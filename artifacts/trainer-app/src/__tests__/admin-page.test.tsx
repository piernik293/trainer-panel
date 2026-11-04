/**
 * @vitest-environment happy-dom
 * Panel administratora: osoba bez roli administratora nie widzi panelu (przekierowanie), administrator widzi zakładki.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

let isAdmin = false;
const testSent: string[] = [];
const bullCalls: [string, unknown][] = [];
vi.mock("@/lib/adminApi", () => ({
  useIsAdmin: () => ({ data: { isAdmin }, isLoading: false }),
  useAdminErrors: () => ({ data: { errors: [] }, isLoading: false }),
  useAdminTrainers: () => ({ data: undefined, isLoading: true }),
  useAdminSolo: () => ({ data: undefined }),
  useAdminSubscriptions: () => ({ data: undefined }),
  useAccessLog: () => ({ data: { entries: [] } }),
  useAdminMails: () => ({ data: { ownerAddressSet: true, mails: [{ id: "plan_ready", label: "Plan gotowy (do podopiecznego)", audience: "podopieczny", when: "Trener aktywował plan." }] }, isLoading: false }),
  useAdminMailPreview: (id: string | null) => ({ data: id ? { subject: "Twój plan jest gotowy", html: "<p>Cześć, Anna,</p>", text: "Cześć, Anna," } : undefined }),
  useAdminBulls: () => ({ data: { enabled: true, pools: { trainer: 10, solo: 100 }, bulls: [{ id: 1, kind: "trainer", number: 1, who: "Marek Nowak", grantedAt: "2026-11-04T10:00:00Z", grantedBy: "automatycznie", reason: null, perksUntil: null, revoked: false, revokedAt: null, revokedReason: null }, { id: 2, kind: "solo", number: 1, who: "Ola", grantedAt: "2026-11-04T11:00:00Z", grantedBy: "administrator", reason: "test", perksUntil: null, revoked: true, revokedAt: "2026-11-04T12:00:00Z", revokedReason: "konto testowe" }] }, isLoading: false }),
  useBullActions: () => ({ grant: { mutate: (v: unknown, o: { onSuccess: (r: { number: number }) => void }) => { bullCalls.push(["grant", v]); o.onSuccess({ number: 2 }); }, isPending: false }, revoke: { mutate: (v: unknown, o: { onSuccess: () => void }) => { bullCalls.push(["revoke", v]); o.onSuccess(); }, isPending: false } }),
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
    for (const name of ["Błędy", "Wnioski", "Trenerzy", "Solo", "Abonamenty i limity", "Maile", "Byczki", "Dziennik dostępu"]) {
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
  it("zakładka „Byczki”: liczniki pul, lista (kto, numer, odebrane), przyznanie i odebranie wymagają powodu", () => {
    isAdmin = true; bullCalls.length = 0;
    render(<Admin />);
    fireEvent.click(screen.getByRole("tab", { name: "Byczki" }));
    expect(screen.getByTestId("bulls-counts").textContent).toBe("Trenerzy: 1 z 10 · Solo: 0 z 100");
    expect(screen.getAllByTestId("admin-bull")).toHaveLength(2);
    expect(screen.getByText(/Solo #1 · Ola · odebrany/)).toBeTruthy();
    expect(screen.getByText("Odebrany: konto testowe")).toBeTruthy();
    const grant = screen.getByRole("button", { name: "Przyznaj" }) as HTMLButtonElement;
    expect(grant.disabled).toBe(true); // bez numeru i powodu
    fireEvent.change(screen.getByLabelText("Numer konta"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Powód przyznania"), { target: { value: "ręczne" } });
    expect(grant.disabled).toBe(false);
    fireEvent.click(grant);
    expect(bullCalls[0]).toEqual(["grant", { kind: "trainer", id: 42, reason: "ręczne" }]);
    fireEvent.click(screen.getByRole("button", { name: "Odbierz…" }));
    const doRevoke = screen.getByRole("button", { name: "Odbierz" }) as HTMLButtonElement;
    expect(doRevoke.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Powód odebrania"), { target: { value: "konto QA" } });
    fireEvent.click(doRevoke);
    expect(bullCalls[1]).toEqual(["revoke", { id: 1, reason: "konto QA" }]);
  });
});
