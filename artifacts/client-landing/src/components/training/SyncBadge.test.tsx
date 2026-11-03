/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import { SyncBadge } from "./TrainingUi";
import { trainingQueue, resetTrainingQueueForTests } from "@/lib/training/sync";

const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
beforeEach(() => { window.localStorage.clear(); resetTrainingQueueForTests(); vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 }))); });
afterEach(() => { cleanup(); setOnline(true); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("etykieta synchronizacji", () => {
  it("online z czekającym zapisem: „Zapisywanie…” z kółkiem, bez ikony braku sieci", async () => {
    setOnline(true);
    const q = trainingQueue();
    q.enqueue({ id: "S1", kind: "start", sessionUuid: "S1", body: {} });
    const { container } = render(<SyncBadge />);
    expect(container.textContent).toContain("Zapisywanie…");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.querySelector("svg.lucide-wifi-off")).toBeNull();
  });
  it("po dłuższym czasie online: informacja, że ponawiamy, a dane są bezpieczne", async () => {
    vi.useFakeTimers();
    setOnline(true);
    trainingQueue().enqueue({ id: "S1", kind: "start", sessionUuid: "S1", body: {} });
    const { container } = render(<SyncBadge />);
    await act(async () => { await vi.advanceTimersByTimeAsync(21_000); });
    expect(container.textContent).toContain("Ponawiam zapis");
  });
  it("offline: ikona braku sieci i tekst o zapisie na telefonie", () => {
    setOnline(false);
    const { container } = render(<SyncBadge />);
    expect(container.textContent).toContain("Offline — zapisane na telefonie");
    expect(container.querySelector("svg.lucide-wifi-off")).not.toBeNull();
  });
});
