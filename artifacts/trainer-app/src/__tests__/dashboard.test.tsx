/**
 * @vitest-environment happy-dom
 *
 * Pulpit (nowy): header sentence, attention list, today, first-day layout,
 * limit bar, loading and error states. Data comes from GET /api/dashboard/summary.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";
import type { DashboardSummary } from "@/lib/dashboardApi";

let mockData: DashboardSummary | undefined;
let mockIsLoading = false;
let mockIsError = false;
let mockSub: unknown = undefined;
const mockRefetch = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/lib/dashboardApi", () => ({
  useDashboardSummary: () => ({
    data: mockData, isLoading: mockIsLoading, isError: mockIsError, error: null, refetch: mockRefetch,
  }),
}));
vi.mock("@/lib/use-subscription-summary", () => ({ useSubscriptionSummary: () => ({ data: mockSub }) }));
vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { firstName: "Anna" } }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/", mockNavigate],
  Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import Dashboard from "../pages/Dashboard";

const base: DashboardSummary = {
  today: "2026-10-22",
  trainerName: null,
  counts: { totalClients: 3, activeClients: 3, newInterviews: 1, plansEndingSoon: 1 },
  attention: {
    total: 2,
    items: [
      { kind: "interview", clientId: 1, name: "Ala Nowak", reasonLabel: "Nowy wywiad", description: "Klient wypełnił wywiad treningowy. Przejrzyj odpowiedzi.", at: "2026-10-21T09:00:00.000Z", actionLabel: "Przejrzyj", actionHref: "/clients/1" },
      { kind: "plan_ending", clientId: 2, name: "Ola Kowalska", reasonLabel: "Koniec planu", description: "Data zakończenia planu: 25.10.", at: "2026-10-25T00:00:00.000Z", actionLabel: "Przedłuż plan", actionHref: "/plans/9" },
    ],
  },
  todayBookings: [{ id: 1, clientId: 1, clientName: "Ala Nowak", startsAt: "2026-10-22T14:00:00.000Z", durationMinutes: 60 }],
  recentEvents: [],
  onboarding: {
    steps: [
      { key: "account", title: "Załóż konto trenera", done: true, href: null },
      { key: "invite", title: "Zaproś pierwszego klienta", done: false, href: "/survey-invite?krok=2" },
      { key: "interview", title: "Przejrzyj odpowiedzi z wywiadu", done: false, href: "/clients?krok=3" },
      { key: "plan", title: "Przygotuj plan", done: false, href: "/clients?krok=4" },
      { key: "share", title: "Udostępnij plan klientowi", done: false, href: "/clients?krok=5" },
    ],
    completed: 1, total: 5, next: "invite",
  },
};

afterEach(() => {
  cleanup();
  mockData = undefined; mockIsLoading = false; mockIsError = false; mockSub = undefined;
  vi.clearAllMocks();
});

describe("Pulpit z klientami", () => {
  it("header: Polish date, greeting with name, sentence from real counts, two actions", () => {
    mockData = base;
    render(<Dashboard />);
    expect(screen.getByTestId("dashboard-date").textContent).toBe("Czwartek, 22 października");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Dzień dobry, Anna");
    expect(screen.getByTestId("dashboard-sentence").textContent).toBe("2 sprawy czekają na Twoją reakcję. Dziś masz 1 trening.");
    fireEvent.click(screen.getByRole("button", { name: "Zaproś klienta" }));
    expect(mockNavigate).toHaveBeenCalledWith("/survey-invite");
    fireEvent.click(screen.getByRole("button", { name: "Nowy plan" }));
    expect(mockNavigate).toHaveBeenCalledWith("/clients");
  });

  it("says everything is up to date when nothing waits and nothing is booked", () => {
    mockData = { ...base, attention: { items: [], total: 0 }, todayBookings: [] };
    render(<Dashboard />);
    expect(screen.getByTestId("dashboard-sentence").textContent).toBe("Wszystko na bieżąco.");
    expect(screen.getByTestId("attention-empty").textContent).toBe("Nic nie czeka na Twoją reakcję.");
    expect(screen.getByText("Brak zaplanowanych treningów.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Otwórz Kalendarz" }).getAttribute("href")).toBe("/calendar");
  });

  it("attention rows: text label for the reason, action link to the right screen", () => {
    mockData = base;
    render(<Dashboard />);
    const rows = screen.getAllByTestId("attention-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Nowy wywiad")).toBeTruthy();
    expect(within(rows[0]).getByRole("link", { name: /Przejrzyj/ }).getAttribute("href")).toBe("/clients/1");
    expect(within(rows[1]).getByText("Koniec planu")).toBeTruthy();
    expect(within(rows[1]).getByText(/za 3 dni/)).toBeTruthy();
    expect(within(rows[1]).getByRole("link", { name: /Przedłuż plan/ }).getAttribute("href")).toBe("/plans/9");
  });

  it("tiles show real counts and no 'on track / at risk' tiles", () => {
    mockData = base;
    render(<Dashboard />);
    const tiles = screen.getByTestId("dashboard-tiles");
    expect(within(tiles).getByText("Aktywni klienci")).toBeTruthy();
    expect(within(tiles).getByText("Nowe wywiady do przejrzenia")).toBeTruthy();
    expect(within(tiles).getByText("Plany kończące się w 7 dni")).toBeTruthy();
    expect(screen.queryByText(/Zagrożeni|Na dobrej drodze/)).toBeNull();
  });

  it("limit bar only when the client limit is reached; no big plan card on the Pulpit", () => {
    mockData = base;
    mockSub = { plan: { name: "Free" }, usage: { clients: { used: 3, limit: 3, atLimit: false } } };
    const { unmount } = render(<Dashboard />);
    expect(screen.queryByTestId("limit-bar")).toBeNull();
    unmount();
    mockSub = { plan: { name: "Free" }, usage: { clients: { used: 3, limit: 3, atLimit: true } } };
    render(<Dashboard />);
    const bar = screen.getByTestId("limit-bar");
    expect(bar.textContent).toContain("Osiągnąłeś limit klientów w planie Free");
    expect(within(bar).getByRole("link", { name: "Plan i limity" }).getAttribute("href")).toBe("/settings#plan-i-limity");
    expect(screen.queryByTestId("subscription-summary-dashboard")).toBeNull();
  });

  it("with clients, the first-steps card stays until all 5 steps are done", () => {
    mockData = base;
    const { unmount } = render(<Dashboard />);
    expect(screen.getByTestId("first-steps")).toBeTruthy();
    unmount();
    mockData = { ...base, onboarding: { ...base.onboarding, completed: 5, next: null, steps: base.onboarding.steps.map((s) => ({ ...s, done: true })) } };
    render(<Dashboard />);
    expect(screen.queryByTestId("first-steps")).toBeNull();
  });

  it("recent events section is omitted when there are none", () => {
    mockData = base;
    render(<Dashboard />);
    expect(screen.queryByTestId("recent-events")).toBeNull();
  });
});

describe("Pulpit: pierwszy dzień (bez klientów)", () => {
  const empty: DashboardSummary = {
    ...base,
    counts: { totalClients: 0, activeClients: 0, newInterviews: 0, plansEndingSoon: 0 },
    attention: { items: [], total: 0 },
    todayBookings: [],
  };

  it("welcome header, first steps with progress, next step highlighted", () => {
    mockData = empty;
    render(<Dashboard />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Witaj, Anna");
    expect(screen.getByText("Zacznij od pierwszego klienta. Reszta pulpitu wypełni się sama.")).toBeTruthy();
    expect(screen.getByTestId("first-steps-count").textContent).toBe("1 z 5");
    expect(screen.getByTestId("first-step-invite").getAttribute("aria-current")).toBe("step");
    expect(screen.getByTestId("first-step-account").getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Wygeneruj link" }).getAttribute("href")).toBe("/survey-invite?krok=2");
    expect(screen.getByTestId("first-step-how").textContent).toContain("wygeneruj link");
    expect(screen.getByTestId("will-appear")).toBeTruthy();
    expect(screen.queryByTestId("attention-list")).toBeNull();
    expect(screen.queryByTestId("dashboard-tiles")).toBeNull();
  });

  it("every step except the account is a link to where it is done; no strikethrough", () => {
    mockData = empty;
    render(<Dashboard />);
    const step = (k: string) => screen.getByTestId(`first-step-${k}`);
    expect(within(step("invite")).getAllByRole("link")[0].getAttribute("href")).toBe("/survey-invite?krok=2");
    expect(within(step("interview")).getByRole("link").getAttribute("href")).toBe("/clients?krok=3");
    expect(within(step("plan")).getByRole("link").getAttribute("href")).toBe("/clients?krok=4");
    expect(within(step("share")).getByRole("link").getAttribute("href")).toBe("/clients?krok=5");
    expect(within(step("account")).queryByRole("link")).toBeNull();
    expect(document.querySelector(".line-through")).toBeNull();
    // only the next step carries the button and the "how to" sentence
    expect(screen.getAllByTestId("first-step-how")).toHaveLength(1);
  });

  it("done steps: green mark, secondary text colour, still a link", () => {
    mockData = {
      ...empty,
      onboarding: {
        ...empty.onboarding,
        steps: empty.onboarding.steps.map((s) => (s.key === "invite" ? { ...s, done: true } : s)),
        completed: 2,
        next: "interview",
      },
    };
    render(<Dashboard />);
    const done = within(screen.getByTestId("first-step-invite")).getByRole("link");
    expect(done.className).toContain("text-muted-foreground");
    expect(done.textContent).toContain("ukończone");
    expect(screen.getByTestId("first-step-interview").getAttribute("aria-current")).toBe("step");
  });

  it("'Dodaj klienta ręcznie' goes to the existing client form", () => {
    mockData = empty;
    render(<Dashboard />);
    fireEvent.click(screen.getByTestId("empty-action-add-manual"));
    expect(mockNavigate).toHaveBeenCalledWith("/clients/new");
  });

  it("first steps card disappears when all 5 steps are done", () => {
    mockData = {
      ...empty,
      onboarding: { ...empty.onboarding, steps: empty.onboarding.steps.map((s) => ({ ...s, done: true })), completed: 5, next: null },
    };
    render(<Dashboard />);
    expect(screen.queryByTestId("first-steps")).toBeNull();
  });
});

describe("Pulpit: stany", () => {
  it("loading → skeleton, no content", () => {
    mockIsLoading = true;
    render(<Dashboard />);
    expect(screen.getByTestId("dashboard-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-populated")).toBeNull();
    expect(screen.queryByTestId("dashboard-empty-state")).toBeNull();
  });

  it("error → message with retry, never the empty state", () => {
    mockIsError = true;
    render(<Dashboard />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-empty-state")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Spróbuj ponownie/ }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
