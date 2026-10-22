/**
 * @vitest-environment happy-dom
 *
 * Dashboard empty state — focused tests
 *
 * 1. New trainer with zero clients sees the empty state (not the stats grid).
 * 2. Trainer with clients sees the normal (populated) dashboard.
 * 3. Primary action navigates to /survey-invite (existing invitation flow).
 * 4. Secondary action navigates to /clients/new (existing client creation flow).
 * 5. No foreign or demo data is rendered in either state.
 * 6. A failed stats request shows an error with retry — never the empty state.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

// ─── Shared mock state ────────────────────────────────────────────────────────

type StatsShape = {
  totalClients: number;
  activeClients: number;
  pausedClients: number;
  finishedClients: number;
  surveysCompleted: number;
  incompleteSurveys: number;
  noSurveyClients: number;
  newSurveysThisWeek: number;
  surveysPercent: number;
  recentClients: { id: number; firstName: string; lastName: string; email: string | null }[];
};

let mockStats: StatsShape | undefined = undefined;
let mockIsLoading = false;
let mockIsError = false;
let mockError: unknown = null;
const mockRefetch = vi.fn();
const mockNavigate = vi.fn();

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetStats: () => ({
    data: mockStats,
    isLoading: mockIsLoading,
    isError: mockIsError,
    error: mockError,
    refetch: mockRefetch,
  }),
  getGetStatsQueryKey: () => ["stats"],
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", mockNavigate],
  Link: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// SubscriptionSummary has its own query — not under test here.
vi.mock("@/components/subscription/SubscriptionSummary", () => ({
  SubscriptionSummary: () => <div data-testid="subscription-summary" />,
}));

// Minimal Card stubs — preserve data-testid pass-through
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

// Minimal Empty stubs — forward data-testid
vi.mock("@/components/ui/empty", () => ({
  Empty: ({ children, className, "data-testid": dtid }: { children: React.ReactNode; className?: string; "data-testid"?: string }) => (
    <div data-testid={dtid} className={className}>{children}</div>
  ),
  EmptyHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyMedia: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyTitle: ({ children, "data-testid": dtid }: { children: React.ReactNode; "data-testid"?: string }) => (
    <h2 data-testid={dtid}>{children}</h2>
  ),
  EmptyDescription: ({ children, "data-testid": dtid }: { children: React.ReactNode; "data-testid"?: string }) => (
    <p data-testid={dtid}>{children}</p>
  ),
  EmptyContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Button: render as <button> and forward onClick + data-testid
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    className,
    variant,
    "data-testid": dtid,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    variant?: string;
    "data-testid"?: string;
  }) => (
    <button data-testid={dtid} onClick={onClick} className={className} data-variant={variant}>
      {children}
    </button>
  ),
}));

// Lucide icons: lightweight stubs
vi.mock("lucide-react", () => ({
  Users: () => <svg data-testid="icon-users" />,
  FileText: () => <svg data-testid="icon-file-text" />,
  Activity: () => <svg data-testid="icon-activity" />,
  PauseCircle: () => <svg data-testid="icon-pause-circle" />,
  CheckCircle2: () => <svg data-testid="icon-check-circle" />,
  Sparkles: () => <svg data-testid="icon-sparkles" />,
  UserPlus: () => <svg data-testid="icon-user-plus" />,
  AlertCircle: () => <svg data-testid="icon-alert-circle" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  ArrowLeft: () => <svg data-testid="icon-arrow-left" />,
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import Dashboard from "@/pages/Dashboard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ZERO_STATS: StatsShape = {
  totalClients: 0,
  activeClients: 0,
  pausedClients: 0,
  finishedClients: 0,
  surveysCompleted: 0,
  incompleteSurveys: 0,
  noSurveyClients: 0,
  newSurveysThisWeek: 0,
  surveysPercent: 0,
  recentClients: [],
};

const POPULATED_STATS: StatsShape = {
  totalClients: 5,
  activeClients: 3,
  pausedClients: 1,
  finishedClients: 1,
  surveysCompleted: 4,
  incompleteSurveys: 1,
  noSurveyClients: 0,
  newSurveysThisWeek: 2,
  surveysPercent: 80,
  recentClients: [
    { id: 1, firstName: "Anna", lastName: "Nowak", email: "anna@example.com" },
    { id: 2, firstName: "Piotr", lastName: "Kowalski", email: null },
  ],
};

// ─── 1. Zero-client empty state ───────────────────────────────────────────────

describe("Dashboard — zero clients (new trainer)", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("shows the empty state, not the stats grid", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.getByTestId("dashboard-empty-state")).toBeDefined();
    expect(screen.queryByTestId("dashboard-populated")).toBeNull();
  });

  it("displays the required title", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.getByTestId("empty-title").textContent).toBe(
      "Zacznij pracę z pierwszym klientem"
    );
  });

  it("displays the required description", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.getByTestId("empty-description").textContent).toContain(
      "Wyślij link do Wywiadu treningowego"
    );
    expect(screen.getByTestId("empty-description").textContent).toContain(
      "dodaj klienta ręcznie"
    );
  });

  it("exposes the primary 'Wyślij zaproszenie' action", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    const btn = screen.getByTestId("empty-action-invite");
    expect(btn.textContent).toContain("Wyślij zaproszenie");
  });

  it("exposes the secondary 'Dodaj klienta ręcznie' action", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    const btn = screen.getByTestId("empty-action-add-manual");
    expect(btn.textContent).toContain("Dodaj klienta ręcznie");
  });

  it("does not render any zero-value stats cards", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    // stat cards are only in the populated view
    expect(screen.queryByTestId("icon-users")).toBeNull();
    expect(screen.queryByTestId("icon-pause-circle")).toBeNull();
  });

  // ── 5. No foreign / demo data ──────────────────────────────────────────────
  it("(5) renders no client names, emails, or IDs when there are no clients", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.queryByText("Anna Nowak")).toBeNull();
    expect(screen.queryByText("anna@example.com")).toBeNull();
    expect(screen.queryByText(/Profil →/)).toBeNull();
  });
});

// ─── 2. Populated dashboard ───────────────────────────────────────────────────

describe("Dashboard — trainer with clients", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("shows the normal populated dashboard, not the empty state", () => {
    mockStats = POPULATED_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.getByTestId("dashboard-populated")).toBeDefined();
    expect(screen.queryByTestId("dashboard-empty-state")).toBeNull();
  });

  it("renders real client names from the trainer's own data", () => {
    mockStats = POPULATED_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.getByText("Anna Nowak")).toBeDefined();
    expect(screen.getByText("Piotr Kowalski")).toBeDefined();
  });

  it("does not render the empty state title or actions", () => {
    mockStats = POPULATED_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.queryByTestId("empty-title")).toBeNull();
    expect(screen.queryByTestId("empty-action-invite")).toBeNull();
    expect(screen.queryByTestId("empty-action-add-manual")).toBeNull();
  });

  // ── 5. No demo data leaks into populated view ──────────────────────────────
  it("(5) only shows clients from the current trainer's stats response", () => {
    mockStats = {
      ...POPULATED_STATS,
      recentClients: [
        { id: 99, firstName: "Demo", lastName: "Klient", email: "demo@demo.com" },
      ],
    };
    mockIsLoading = false;
    render(<Dashboard />);

    expect(screen.getByText("Demo Klient")).toBeDefined();
    expect(screen.queryByText("Anna Nowak")).toBeNull();
  });
});

// ─── 3. Action navigation ─────────────────────────────────────────────────────

describe("Dashboard — empty state actions navigate to existing flows", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("primary action navigates to /survey-invite (existing invitation flow)", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    fireEvent.click(screen.getByTestId("empty-action-invite"));
    expect(mockNavigate).toHaveBeenCalledWith("/survey-invite");
  });

  it("secondary action navigates to /clients/new (existing client creation flow)", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    fireEvent.click(screen.getByTestId("empty-action-add-manual"));
    expect(mockNavigate).toHaveBeenCalledWith("/clients/new");
  });

  it("no navigation fires without user interaction", () => {
    mockStats = ZERO_STATS;
    mockIsLoading = false;
    render(<Dashboard />);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── Loading state (regression guard) ────────────────────────────────────────

describe("Dashboard — loading state", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("shows neither empty state nor populated content while loading", () => {
    mockStats = undefined;
    mockIsLoading = true;
    render(<Dashboard />);

    expect(screen.queryByTestId("dashboard-empty-state")).toBeNull();
    expect(screen.queryByTestId("dashboard-populated")).toBeNull();
  });
});

// ─── Error state (regression: 401/500 used to look like "no clients") ────────

describe("Dashboard — failed stats request", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockIsError = false;
    mockError = null;
  });

  it("shows an error with a retry action instead of the empty state", () => {
    mockStats = undefined;
    mockIsLoading = false;
    mockIsError = true;
    mockError = Object.assign(new Error("Twoja sesja wygasła. Zaloguj się ponownie."), { status: 401 });
    render(<Dashboard />);

    expect(screen.queryByTestId("dashboard-empty-state")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Twoja sesja wygasła");
    fireEvent.click(screen.getByText("Spróbuj ponownie"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
