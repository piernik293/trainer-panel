/**
 * @vitest-environment happy-dom
 * Karta „Kroki” w profilu klienta: średnia tygodnia, realizacja celu, ustawienie celu przez trenera.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const calls: { url: string; method: string; body?: string }[] = [];
let summary: Record<string, unknown>;
vi.mock("@workspace/api-client-react", () => ({
  customFetch: async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (init?.method === "PUT") { summary = { ...summary, goal: JSON.parse(init.body!).goal }; }
    return summary;
  },
}));
import { StepsCard } from "@/components/StepsCard";

afterEach(() => { cleanup(); calls.length = 0; });
const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${19 + i}`, steps: i >= 5 ? 6000 : null }));
const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;

describe("StepsCard", () => {
  it("shows the week average, the goal and the goal realisation", async () => {
    summary = { today: "2026-10-25", goal: 8000, todaySteps: 6000, todayPercent: 75, days, average: 6000, daysAtGoal: 0, averagePercent: 75 };
    render(wrap(<StepsCard clientId={7} />));
    await waitFor(() => expect(screen.getByTestId("steps-card-average").textContent).toMatch(/6\s?000 dziennie/));
    expect(screen.getByTestId("steps-card-goal").textContent).toMatch(/8\s?000/);
    expect(screen.getByTestId("steps-card-percent").textContent).toContain("75%");
    expect(calls[0]!.url).toBe("/api/clients/7/steps");
  });
  it("without entries and goal: says so and offers goal buttons", async () => {
    summary = { today: "2026-10-25", goal: null, todaySteps: null, todayPercent: null, days: days.map((d) => ({ ...d, steps: null })), average: null, daysAtGoal: null, averagePercent: null };
    render(wrap(<StepsCard clientId={7} />));
    await waitFor(() => expect(screen.getByTestId("steps-card-average").textContent).toBe("brak wpisów"));
    expect(screen.getByTestId("steps-card-goal").textContent).toBe("nie ustawiono");
    fireEvent.click(screen.getByText("10 000"));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.url === "/api/clients/7/steps-goal" && c.body === JSON.stringify({ goal: 10000 }))).toBe(true));
    await waitFor(() => expect(screen.getByTestId("steps-card-goal").textContent).toMatch(/10\s?000/));
  });
  it("custom goal outside 1 000–100 000 is rejected without a request", async () => {
    summary = { today: "2026-10-25", goal: null, todaySteps: null, todayPercent: null, days, average: null, daysAtGoal: null, averagePercent: null };
    render(wrap(<StepsCard clientId={7} />));
    await waitFor(() => screen.getByLabelText("Własny cel kroków"));
    fireEvent.change(screen.getByLabelText("Własny cel kroków"), { target: { value: "500" } });
    fireEvent.click(screen.getAllByText("Zapisz")[0]!);
    expect(screen.getByRole("alert").textContent).toMatch(/1 000/);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });
});
