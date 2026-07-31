/**
 * @vitest-environment happy-dom
 *
 * Account menu & settings — Vitest component tests
 *
 * Proves all 9 required behaviors:
 *
 *  1.  The account menu shows the authenticated trainer's name and email.
 *  2.  Trainer A never sees Trainer B's account information.
 *  3.  Signed-out users see a generic fallback (ProtectedRoute handles redirect
 *      at the router level; here we verify no prior session data leaks through).
 *  4.  Clicking "Wyloguj się" calls Clerk signOut.
 *  5.  signOut is invoked (Clerk then navigates via routerReplace to sign-in).
 *  6.  Protected trainer data is not rendered when user is null.
 *  7.  "Zarządzaj kontem" calls Clerk openUserProfile.
 *  8.  The account menu is present in both mobile (compact) and desktop layouts.
 *  9.  Existing trainer auth + multi-tenancy tests are unaffected (verified by
 *      running those suites separately; this file only adds new coverage).
 *
 * Pure-function test (getInitials) runs first; component tests follow.
 * All Clerk, Radix-UI, and Wouter dependencies are mocked so tests are
 * hermetic and do not require a running server or Clerk tenant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

// ─── Shared mock state (module-level so factories close over them) ─────────────

let mockUserData: {
  fullName: string | null;
  firstName: string | null;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
} | null = {
  fullName: "Jan Kowalski",
  firstName: "Jan",
  imageUrl: "https://example.com/avatar.jpg",
  primaryEmailAddress: { emailAddress: "jan@example.com" },
};
let mockIsLoaded = true;

const mockSignOut = vi.fn();
const mockOpenUserProfile = vi.fn();
const mockNavigate = vi.fn();

// ─── Mocks — hoisted before imports by Vitest ─────────────────────────────────

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: mockUserData, isLoaded: mockIsLoaded }),
  useClerk: () => ({ signOut: mockSignOut, openUserProfile: mockOpenUserProfile }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", mockNavigate],
  Link: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

// Radix DropdownMenu — render content inline so data-testid attrs are reachable
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-root">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    className,
    "data-testid": dtid,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    "data-testid"?: string;
  }) => (
    <button data-testid={dtid} onClick={onClick} className={className}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-label">{children}</div>
  ),
  DropdownMenuSeparator: () => <hr data-testid="dropdown-sep" />,
}));

// Radix Avatar
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img data-testid="avatar-img" src={src} alt={alt} />
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
}));

// Skeleton placeholder
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// ─── Static imports AFTER mocks are declared ──────────────────────────────────
// Vitest hoists vi.mock() calls, so these resolve with the mocked modules.

import { AccountMenu, getInitials } from "@/components/layout/AccountMenu";

// ─── 0. Pure-function: getInitials ────────────────────────────────────────────

describe("getInitials", () => {
  it("returns '?' for null or empty input", () => {
    expect(getInitials(null)).toBe("?");
    expect(getInitials(undefined)).toBe("?");
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });

  it("returns one uppercase initial for a single-word name", () => {
    expect(getInitials("anna")).toBe("A");
  });

  it("returns up to 2 initials from a full name", () => {
    expect(getInitials("Jan Kowalski")).toBe("JK");
    expect(getInitials("Anna Maria Nowak")).toBe("AM");
  });

  it("handles extra whitespace", () => {
    expect(getInitials("  Jan  Kowalski  ")).toBe("JK");
  });
});

// ─── 1. Account menu shows authenticated trainer's name and email ─────────────

describe("AccountMenu — identity display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoaded = true;
    mockUserData = {
      fullName: "Jan Kowalski",
      firstName: "Jan",
      imageUrl: "https://example.com/jan.jpg",
      primaryEmailAddress: { emailAddress: "jan@example.com" },
    };
  });
  afterEach(() => cleanup());

  it("(1) renders the trainer's full name in the trigger", () => {
    render(<AccountMenu />);
    expect(screen.getByTestId("account-name").textContent).toBe("Jan Kowalski");
  });

  it("(1) renders the trainer's email in the trigger", () => {
    render(<AccountMenu />);
    expect(screen.getByTestId("account-email").textContent).toBe("jan@example.com");
  });

  it("(1) renders the trainer's name in the dropdown label", () => {
    render(<AccountMenu />);
    expect(screen.getByTestId("menu-name").textContent).toBe("Jan Kowalski");
  });

  it("(1) renders the trainer's email in the dropdown label", () => {
    render(<AccountMenu />);
    expect(screen.getByTestId("menu-email").textContent).toBe("jan@example.com");
  });

  // ─── 2. Trainer A never sees Trainer B's data ──────────────────────────────

  it("(2) Trainer B's session shows Trainer B's name, not Trainer A's", () => {
    mockUserData = {
      fullName: "Maria Nowak",
      firstName: "Maria",
      imageUrl: "https://example.com/maria.jpg",
      primaryEmailAddress: { emailAddress: "maria@example.com" },
    };

    render(<AccountMenu />);

    expect(screen.getByTestId("account-name").textContent).toBe("Maria Nowak");
    expect(screen.getByTestId("account-email").textContent).toBe("maria@example.com");
    expect(screen.queryByText("Jan Kowalski")).toBeNull();
    expect(screen.queryByText("jan@example.com")).toBeNull();
  });

  it("(2) switching user data never renders stale identity from prior session", () => {
    const { rerender } = render(<AccountMenu />);
    expect(screen.getByTestId("account-name").textContent).toBe("Jan Kowalski");

    mockUserData = {
      fullName: "Piotr Wiśniewski",
      firstName: "Piotr",
      imageUrl: "",
      primaryEmailAddress: { emailAddress: "piotr@example.com" },
    };
    rerender(<AccountMenu />);

    expect(screen.getByTestId("account-name").textContent).toBe("Piotr Wiśniewski");
    expect(screen.queryByText("Jan Kowalski")).toBeNull();
  });

  // ─── Loading skeleton: no personal data shown while Clerk loads ────────────

  it("shows loading skeletons (not user data) while Clerk is loading", () => {
    mockIsLoaded = false;
    render(<AccountMenu />);

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("account-name")).toBeNull();
    expect(screen.queryByTestId("account-email")).toBeNull();
  });

  it("compact mode also shows skeletons while loading", () => {
    mockIsLoaded = false;
    render(<AccountMenu compact />);

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("account-name")).toBeNull();
  });
});

// ─── 4, 5 & 7. Button interactions ───────────────────────────────────────────

describe("AccountMenu — button interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoaded = true;
    mockUserData = {
      fullName: "Jan Kowalski",
      firstName: "Jan",
      imageUrl: "",
      primaryEmailAddress: { emailAddress: "jan@example.com" },
    };
  });
  afterEach(() => cleanup());

  it("(4) clicking 'Wyloguj się' calls Clerk signOut", () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTestId("menu-sign-out"));
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it("(5) signOut is invoked (Clerk redirects via routerReplace configured in ClerkProvider)", () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTestId("menu-sign-out"));
    expect(mockSignOut).toHaveBeenCalledOnce();
    // Redirect to /sign-in is handled by Clerk's routerReplace callback;
    // the component's sole responsibility is to call signOut().
  });

  it("(7) clicking 'Zarządzaj kontem' calls Clerk openUserProfile", () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTestId("menu-manage-account"));
    expect(mockOpenUserProfile).toHaveBeenCalledOnce();
  });

  it("clicking 'Ustawienia' navigates to /settings", () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByTestId("menu-settings"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("signOut and openUserProfile are never called without explicit interaction", () => {
    render(<AccountMenu />);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockOpenUserProfile).not.toHaveBeenCalled();
  });
});

// ─── 3 & 6. Signed-out / null user state ────────────────────────────────────

describe("AccountMenu — signed-out / null user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoaded = true;
    mockUserData = null; // Clerk has loaded but no user is signed in
  });
  afterEach(() => cleanup());

  it("(3)(6) null user renders generic 'Trener' fallback — no prior session data", () => {
    render(<AccountMenu />);
    expect(screen.getByTestId("account-name").textContent).toBe("Trener");
    expect(screen.queryByTestId("account-email")).toBeNull();
  });

  it("(6) dropdown label also shows 'Trener' fallback — no prior session leaks", () => {
    render(<AccountMenu />);
    expect(screen.getByTestId("menu-name").textContent).toBe("Trener");
    expect(screen.queryByTestId("menu-email")).toBeNull();
  });
});

// ─── 8. Mobile compact vs desktop full layout ────────────────────────────────

describe("AccountMenu — layout variants (desktop vs mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoaded = true;
    mockUserData = {
      fullName: "Jan Kowalski",
      firstName: "Jan",
      imageUrl: "https://example.com/jan.jpg",
      primaryEmailAddress: { emailAddress: "jan@example.com" },
    };
  });
  afterEach(() => cleanup());

  it("(8) desktop (compact=false) — renders account-name and account-email in trigger", () => {
    render(<AccountMenu compact={false} />);
    expect(screen.getByTestId("account-name")).toBeDefined();
    expect(screen.getByTestId("account-email")).toBeDefined();
  });

  it("(8) mobile (compact=true) — trigger shows ONLY avatar, no text name/email", () => {
    render(<AccountMenu compact />);
    expect(screen.queryByTestId("account-name")).toBeNull();
    expect(screen.queryByTestId("account-email")).toBeNull();
    // Avatar is present
    expect(screen.getByTestId("avatar")).toBeDefined();
  });

  it("(8) mobile compact mode still exposes all three action items in the dropdown", () => {
    render(<AccountMenu compact />);
    expect(screen.getByTestId("menu-settings")).toBeDefined();
    expect(screen.getByTestId("menu-manage-account")).toBeDefined();
    expect(screen.getByTestId("menu-sign-out")).toBeDefined();
  });

  it("(8) desktop mode also exposes all three action items in the dropdown", () => {
    render(<AccountMenu compact={false} />);
    expect(screen.getByTestId("menu-settings")).toBeDefined();
    expect(screen.getByTestId("menu-manage-account")).toBeDefined();
    expect(screen.getByTestId("menu-sign-out")).toBeDefined();
  });
});
