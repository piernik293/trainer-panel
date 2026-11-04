/**
 * @vitest-environment happy-dom
 * Panel administratora: osoba bez roli administratora nie widzi panelu (przekierowanie), administrator widzi zakładki.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

let isAdmin = false;
const testSent: string[] = [];
vi.mock("@/lib/adminApi", () => ({
  useIsAdmin: () => ({ data: { isAdmin }, isLoading: false }),
  useAdminErrors: () => ({ data: { errors: [] }, isLoading: false }),
  useAdminTrainers: () => ({ data: undefined, isLoading: true }),
  useAdminSolo: () => ({ data: undefined }),
  useAdminSubscriptions: () => ({ data: undefined }),
  useAccessLog: () => ({ data: { entries: [] } }),
  useAdminMails: () => ({ data: { ownerAddressSet: true, mails: [{ id: "plan_ready", label: "Plan gotowy (do podopiecznego)", audience: "podopieczny", when: "Trener aktywował plan." }] }, isLoading: false }),
  useAdminMailPreview: (id: string | null) => ({ data: id ? { subject: "Twój plan jest gotowy", html: "<p>Cześć, Anna,</p>", text: "Cześć, Anna," } : undefined }),
  useAdminMailTest: () => ({ mutate: (id: string, o: { onSuccess: () => void }) => { testSent.push(id); o.onSuccess(); }, isPending: false }),
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
    for (const name of ["Błędy", "Wnioski", "Trenerzy", "Solo", "Abonamenty i limity", "Maile", "Dziennik dostępu"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });
  it("zakładka „Maile”: lista szablonów, podgląd w ramce bez skryptów i „Wyślij test do mnie”", () => {
    isAdmin = true; testSent.length = 0;
    render(<Admin />);
    fireEvent.click(screen.getByRole("tab", { name: "Maile" }));
    expect(screen.getByText("Plan gotowy (do podopiecznego)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Podgląd" }));
    const frame = screen.getByTitle("Podgląd: Plan gotowy (do podopiecznego)") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe(""); // bez skryptów i formularzy
    expect(screen.getByText("Twój plan jest gotowy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Wyślij test do mnie" }));
    expect(testSent).toEqual(["plan_ready"]);
  });
});
