/** @vitest-environment happy-dom */
import { describe, it, expect } from "vitest";
import { joinPathFromCode } from "./AccountNotice";

describe("kod trenera wpisany ręcznie", () => {
  it("normalizuje małe litery, spacje i myślniki", () => {
    expect(joinPathFromCode("abcde-23456")).toBe("/join/ABCDE23456");
    expect(joinPathFromCode(" abcde 23456 ")).toBe("/join/ABCDE23456");
  });
  it("odrzuca za krótki i z nieprawidłowymi znakami", () => {
    expect(joinPathFromCode("ABC")).toBeNull();
    expect(joinPathFromCode("ABCDE2345!")).toBeNull();
  });
});

// ─── Osoba bez trenera: formularz wniosku o konto trenera jest osiągalny na ekranie bez planu ───
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { AccountNotice } from "./AccountNotice";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ekran osoby bez trenera", () => {
  it("pokazuje „wkrótce”, pole na kod i wniosek „Prowadzę podopiecznych”; zgłasza status do rodzica", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/account/roles")
        ? { isTrainer: false, isClient: true, application: null }
        : { linked: false, trainerName: null, pendingTrainerName: null }),
    })));
    const seen: Array<boolean | null> = [];
    render(<AccountNotice onStatus={(s) => seen.push(s ? s.linked : null)} />);
    await waitFor(() => expect(screen.getByTestId("account-notice")).toBeTruthy());
    expect(screen.getByText("Trening samodzielny — wkrótce")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("trainer-apply")).toBeTruthy());
    expect(screen.getByText("Prowadzę podopiecznych")).toBeTruthy();
    expect(seen).toContain(false);
  });
  it("osoba połączona z trenerem nie widzi nic", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ linked: true, trainerName: "Anna", pendingTrainerName: null }) })));
    render(<AccountNotice />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("account-notice")).toBeNull();
  });
});
