// @vitest-environment happy-dom
/** The portal is exactly what it was with both flags off; the bottom bar replaces the top navigation only when a flag is on. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, isLoaded: true, user: { primaryEmailAddress: { emailAddress: "a@b.pl" } } }),
  useClerk: () => ({ signOut: vi.fn() }),
  SignIn: () => null,
}));

import PlanPortal from "./plan";

const PLAN = { id: 1, clientId: 1, title: "Plan testowy", goal: null, description: null, startDate: null, endDate: null, status: "active", updatedAt: null, cardioRecommendation: null, days: [] };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
function stubApi(flags: { solo: boolean; achievements: boolean }) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    if (u.includes("/api/solo/status")) return json({ enabled: flags.solo });
    if (u.includes("/api/achievements/status")) return json({ enabled: flags.achievements });
    if (u.includes("/client-portal/plan")) return json({ client: { id: 1, firstName: "Anna", lastName: "T" }, plan: PLAN });
    if (u.includes("/client-portal/booking")) return json({ bookable: false });
    if (u.includes("/client-portal/steps")) return json({ today: "2026-10-28", goal: 8000, todaySteps: 4000, todayPercent: 50, days: [{ date: "2026-10-28", steps: 4000 }], average: 4000, daysAtGoal: 0, averagePercent: 50 });
    if (u.includes("/client-portal/achievements")) return json({ items: [], streakWeeks: null });
    if (u.includes("/client-portal/activity")) return json({ days: [] });
    return json({}, 404);
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PlanPortal and the shell flags", () => {
  it("both flags off: the classic portal (top navigation, plan view), no bottom bar", async () => {
    stubApi({ solo: false, achievements: false });
    render(<PlanPortal />);
    await screen.findByText("Plan treningowy");
    await new Promise((r) => setTimeout(r, 50)); // let the flag requests settle
    expect(screen.queryByRole("navigation", { name: "Nawigacja główna" })).toBeNull();
    expect(screen.getAllByRole("navigation", { name: "Nawigacja portalu" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Plan treningowy")).toBeTruthy();
  });
  it("a flag on: the bottom bar Dziś · Plan · Postępy · Ty replaces the top navigation", async () => {
    stubApi({ solo: false, achievements: true });
    render(<PlanPortal />);
    const bar = await screen.findByRole("navigation", { name: "Nawigacja główna" });
    expect(bar.textContent).toBe("DziśPlanPostępyTy");
    expect(screen.queryByRole("navigation", { name: "Nawigacja portalu" })).toBeNull();
    expect(await screen.findByText("Cześć, Anna!")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Postępy" })).toBeTruthy());
  });
  it("steps: a small row on \"Dziś\", the chart only in \"Postępy\"", async () => {
    stubApi({ solo: false, achievements: true });
    render(<PlanPortal />);
    await screen.findByText("Cześć, Anna!");
    await screen.findByTestId("steps-input");
    expect(screen.queryByTestId("steps-week")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Postępy" }));
    await screen.findByTestId("steps-week");
  });
});
