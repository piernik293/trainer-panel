/**
 * @vitest-environment happy-dom
 * Trainer's "Treningi" tab: pain reports (mark as read), records, sessions with sets, legacy marker.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const calls: { url: string; method: string }[] = [];
let pain: unknown[];
vi.mock("@workspace/api-client-react", () => ({
  customFetch: async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/pain-reports")) return pain;
    if (url.includes("/pain-reports/") && url.endsWith("/read")) { (pain[0] as { readByTrainerAt: string | null }).readByTrainerAt = "2026-10-23T10:00:00Z"; return { read: true }; }
    if (url.endsWith("/training-records")) return [{ exerciseId: 1, name: "Wyciskanie sztangi", weightKg: 65, reps: 8, at: "2026-10-22T10:00:00Z" }];
    if (url.endsWith("/training-sessions")) return [
      { id: 3, status: "completed", isCompleted: true, date: "2026-10-22", completedAt: "2026-10-22T18:00:00Z", rating: "too_hard", note: "Ciężko", dayName: "Dzień A", sets: 6, pain: 1, legacy: false },
      { id: 2, status: "aborted", isCompleted: true, date: "2026-10-20", completedAt: "2026-10-20T18:00:00Z", rating: null, note: null, dayName: "Dzień B", sets: 1, pain: 0, legacy: false },
      { id: 1, status: null, isCompleted: true, date: "2026-10-01", completedAt: "2026-10-01T18:00:00Z", rating: null, note: null, dayName: "Dzień A", sets: 0, pain: 0, legacy: true },
    ];
    if (url.endsWith("/training-sessions/3")) return { session: { id: 3, legacy: false, note: "Ciężko" }, sets: [{ exerciseId: 1, name: "Wyciskanie sztangi", setNumber: 1, weightKg: 60, reps: 8, rir: 2, skipped: false }, { exerciseId: 1, name: "Wyciskanie sztangi", setNumber: 2, weightKg: null, reps: null, rir: null, skipped: true }], pain: [], legacyLogs: [] };
    if (url.endsWith("/training-sessions/1")) return { session: { id: 1, legacy: true, note: null }, sets: [], pain: [], legacyLogs: [{ id: 9, exerciseNameSnapshot: "Przysiad", setsCompleted: 3, repsCompleted: 8, weightKg: "40.00", rir: 2, note: null }] };
    throw new Error("unexpected " + url);
  },
}));

import TrainingSessionsTab from "@/pages/TrainingSessionsTab";

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TrainingSessionsTab clientId={5} /></QueryClientProvider>);
beforeEach(() => { calls.length = 0; pain = [{ id: 7, sessionId: 3, exerciseNameSnapshot: "Wyciskanie sztangi", area: "Bark", severity: 4, description: "Ostry przy unoszeniu", createdAt: "2026-10-22T17:00:00Z", readByTrainerAt: null }]; });
afterEach(cleanup);

describe("TrainingSessionsTab", () => {
  it("shows a new pain report and marks it as read", async () => {
    mount();
    const box = await screen.findByTestId("pain-reports");
    expect(within(box).getByText("Bark")).toBeTruthy();
    expect(within(box).getByText(/siła 4\/5/)).toBeTruthy();
    expect(within(box).getByText("Nowe")).toBeTruthy();
    expect(box.textContent).not.toMatch(/diagnoz|uraz|kontuzj/i);
    fireEvent.click(within(box).getByRole("button", { name: "Oznacz jako przeczytane" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.url.endsWith("/pain-reports/7/read"))).toBe(true));
    await waitFor(() => expect(within(screen.getByTestId("pain-reports")).getByText("Przeczytane")).toBeTruthy());
  });
  it("lists sessions with status, rating, legacy marker; opens per-set detail", async () => {
    mount();
    const rows = await screen.findAllByTestId("training-session-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Ukończony")).toBeTruthy();
    expect(within(rows[0]!).getByText("Za ciężko")).toBeTruthy();
    expect(within(rows[0]!).getByText("Ból ×1")).toBeTruthy();
    expect(within(rows[1]!).getByText("Przerwany")).toBeTruthy();
    expect(within(rows[2]!).getByText("Starszy zapis")).toBeTruthy();
    fireEvent.click(within(rows[0]!).getByRole("button"));
    expect(await screen.findByText("Seria 1: 60 kg × 8 · RIR 2")).toBeTruthy();
    expect(screen.getByText("Seria 2: pominięta")).toBeTruthy();
    fireEvent.click(within(rows[2]!).getByRole("button"));
    expect(await screen.findByText(/Przysiad: 3 serii × 8 pow\., 40 kg, RIR 2/)).toBeTruthy();
  });
  it("shows records with the rule explained", async () => {
    mount();
    expect(await screen.findByText("65 kg × 8")).toBeTruthy();
    expect(screen.getByText(/najwyższy ciężar przy tej samej lub większej liczbie powtórzeń/)).toBeTruthy();
  });
});
