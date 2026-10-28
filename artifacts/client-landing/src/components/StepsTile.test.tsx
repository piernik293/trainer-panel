// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { StepsTile, parseSteps } from "./StepsTile";

const summary = (over: object = {}) => ({
  today: "2026-10-25", goal: 8000, todaySteps: 4000, todayPercent: 50,
  days: ["19", "20", "21", "22", "23", "24", "25"].map((d, i) => ({ date: `2026-10-${d}`, steps: i === 6 ? 4000 : i === 5 ? 9000 : null })),
  average: 6500, daysAtGoal: 1, averagePercent: 81, ...over,
});

beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("parseSteps", () => {
  it("accepts 0–100000 digits (spaces allowed), rejects everything else", () => {
    expect(parseSteps("7500")).toBe(7500);
    expect(parseSteps("7 500")).toBe(7500);
    expect(parseSteps("0")).toBe(0);
    expect(parseSteps("100000")).toBe(100000);
    for (const bad of ["", "100001", "-5", "7,5", "abc", "1e4", "1234567"]) expect(parseSteps(bad), bad).toBeNull();
  });
});

describe("StepsTile", () => {
  it("shows today's steps, the goal bar, the average and the hint text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(summary()), { status: 200 })));
    render(<StepsTile />);
    await waitFor(() => expect(screen.getByTestId("steps-today").textContent).toContain("4"));
    expect(screen.getByText("Wpisz kroki z telefonu lub zegarka.")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByTestId("steps-average").textContent).toMatch(/6\s?500/);
    expect(screen.getByTestId("steps-week").children).toHaveLength(7);
    expect((screen.getByTestId("steps-input") as HTMLInputElement).getAttribute("inputmode")).toBe("numeric");
  });
  it("rejects an invalid number without sending anything", async () => {
    const f = vi.fn(async (_u: string, _init?: RequestInit) => new Response(JSON.stringify(summary()), { status: 200 }));
    vi.stubGlobal("fetch", f);
    render(<StepsTile />);
    await waitFor(() => screen.getByTestId("steps-input"));
    fireEvent.change(screen.getByTestId("steps-input"), { target: { value: "250000" } });
    fireEvent.click(screen.getByText("Zapisz"));
    expect(screen.getByRole("alert").textContent).toMatch(/0 do 100/);
    expect(f.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(0);
  });
  it("offline: the entry is shown at once and kept in the phone until the network returns", async () => {
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (!online) throw new TypeError("offline");
      return new Response(JSON.stringify(summary({ todaySteps: init?.method === "PUT" ? 5200 : 4000 })), { status: 200 });
    }));
    window.localStorage.setItem("optimatren-kroki-summary:v1", JSON.stringify(summary()));
    render(<StepsTile />);
    await waitFor(() => screen.getByTestId("steps-input"));
    fireEvent.change(screen.getByTestId("steps-input"), { target: { value: "5200" } });
    fireEvent.click(screen.getByText("Zapisz"));
    await waitFor(() => expect(screen.getByTestId("steps-today").textContent).toMatch(/5\s?200/));
    expect(screen.getByTestId("steps-pending")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("optimatren-kroki-queue:v1") ?? "{}")["2026-10-25"]).toBe(5200);
    online = true;
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(screen.queryByTestId("steps-pending")).toBeNull());
  });
  it("no goal: no bar, offers to set one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(summary({ goal: null, todayPercent: null, daysAtGoal: null, averagePercent: null })), { status: 200 })));
    render(<StepsTile />);
    await waitFor(() => screen.getByText("Ustaw cel kroków"));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("StepsTile compact (the \"Dziś\" tab)", () => {
  it("only a small row with the entry field: no chart, no average, no goal picker; the full tile still has them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(summary()), { status: 200 })));
    const { unmount } = render(<StepsTile compact />);
    await waitFor(() => expect(screen.getByTestId("steps-today").textContent).toContain("4"));
    expect(screen.getByTestId("steps-input")).toBeTruthy();
    expect(screen.queryByTestId("steps-week")).toBeNull();
    expect(screen.queryByTestId("steps-average")).toBeNull();
    expect(screen.queryByText("Zmień cel")).toBeNull();
    unmount();
    render(<StepsTile />);
    await waitFor(() => expect(screen.getByTestId("steps-week")).toBeTruthy());
    expect(screen.getByTestId("steps-average")).toBeTruthy();
  });
});
