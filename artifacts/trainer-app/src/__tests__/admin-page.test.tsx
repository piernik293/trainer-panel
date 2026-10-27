/**
 * @vitest-environment happy-dom
 * Panel administratora: osoba bez roli administratora nie widzi panelu (przekierowanie), administrator widzi zakładki.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

let isAdmin = false;
vi.mock("@/lib/adminApi", () => ({
  useIsAdmin: () => ({ data: { isAdmin }, isLoading: false }),
  useAdminErrors: () => ({ data: { errors: [] }, isLoading: false }),
  useAdminTrainers: () => ({ data: undefined, isLoading: true }),
  useAdminSolo: () => ({ data: undefined }),
  useAdminSubscriptions: () => ({ data: undefined }),
  useAccessLog: () => ({ data: { entries: [] } }),
  useTrainerApplications: () => ({ data: { applications: [] } }),
  useAutoAccept: () => ({ data: { autoAccept: false } }),
  useApplicationActions: () => ({ decide: { mutate: vi.fn() }, setAutoAccept: { mutate: vi.fn() } }),
  AUTO_ACCEPT_CONFIRM: "y",
  useAdminAction: () => ({ review: { mutate: vi.fn() }, setPlan: { mutate: vi.fn() }, block: { mutate: vi.fn() }, access: { mutate: vi.fn(), isPending: false } }),
  BLOCK_CONFIRM: "x", SOURCE_LABEL: { api: "Serwer", panel: "Panel", portal: "Portal" },
}));
vi.mock("wouter", () => ({ Redirect: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Admin from "../pages/Admin";

afterEach(cleanup);

describe("strona /admin", () => {
  it("nie-administrator jest przekierowany i nie widzi zakładek", () => {
    isAdmin = false;
    render(<Admin />);
    expect(screen.getByTestId("redirect").textContent).toBe("/");
    expect(screen.queryByText("Panel administratora")).toBeNull();
  });
  it("administrator widzi wszystkie zakładki", () => {
    isAdmin = true;
    render(<Admin />);
    for (const name of ["Błędy", "Wnioski", "Trenerzy", "Solo", "Abonamenty i limity", "Dziennik dostępu"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });
});
