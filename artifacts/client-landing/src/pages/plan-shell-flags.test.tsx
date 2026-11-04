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
function stubApi(flags: { solo: boolean; achievements: boolean; uiV2?: boolean }) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    if (u.includes("/api/solo/status")) return json({ enabled: flags.solo });
    if (u.includes("/api/achievements/status")) return json({ enabled: flags.achievements });
    if (u.includes("/api/ui-v2/status")) return json({ enabled: flags.uiV2 === true });
    if (u.includes("/client-portal/profile")) return json({ firstName: "Anna", displayName: null, nick: "ShiiFuu", avatarColor: "#C2410C", colors: ["#C2410C", "#0F766E", "#1D4ED8", "#7E22CE", "#BE123C", "#4D7C0F"], trainsSince: "2026-10" });
    if (u.includes("/client-portal/achievements/overview")) return json({ streakWeeks: 4, sessionCount: 8, recordCount: 5, earnedCount: 1, total: 2, items: [{ id: "milestone:1", kind: "milestone", title: "Pierwszy trening", hint: "", state: "earned", progress: null, earnedAt: "2026-11-01T10:00:00.000Z", seen: true }, { id: "milestone:10", kind: "milestone", title: "10 treningów", hint: "Zrób 10 treningów z planu.", state: "progress", progress: { value: 8, target: 10 }, earnedAt: null, seen: true }] });
    if (u.includes("/training/today")) return json({}, 404);
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

describe("UI_V2_ENABLED", () => {
  it("wyłączona (domyślnie): portal jak dziś — klasyczne „Dziś” i „Ty”, bez ekranów v2", async () => {
    stubApi({ solo: false, achievements: true, uiV2: false });
    render(<PlanPortal />);
    await screen.findByText("Cześć, Anna!");
    expect(screen.queryByTestId("home-v2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ty" }));
    await screen.findByTestId("you-screen");
    expect(screen.queryByTestId("you-v2")).toBeNull();
  });
  it("włączona: nowe „Dziś” (powitanie z nickiem), „Postępy” z siatką osiągnięć i nowe „Ty” z @nickiem", async () => {
    stubApi({ solo: false, achievements: true, uiV2: true });
    render(<PlanPortal />);
    expect((await screen.findByTestId("home-greeting")).textContent).toBe("Cześć, Anna!");
    await waitFor(() => expect(screen.getByTestId("home-greeting").textContent).toBe("Cześć, ShiiFuu!"));
    await waitFor(() => expect(screen.getByTestId("next-achievement").textContent).toContain("8/10"));
    fireEvent.click(screen.getByRole("button", { name: "Postępy" }));
    expect((await screen.findByTestId("ach-count")).textContent).toBe("1 z 2");
    fireEvent.click(screen.getByRole("button", { name: "Ty" }));
    expect((await screen.findByTestId("you-sub")).textContent).toBe("@ShiiFuu · trenuje od października");
  });
});
