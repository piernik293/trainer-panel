/**
 * @vitest-environment happy-dom
 *
 * TrainerProfileGate — the trainer app creates the trainer profile right after
 * sign-in; client accounts are refused with a clear message.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const signOut = vi.fn();
vi.mock("@clerk/react", () => ({ useClerk: () => ({ signOut }) }));

import { TrainerProfileGate } from "@/components/TrainerProfileGate";

function renderGate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TrainerProfileGate>
        <div>Panel trenera</div>
      </TrainerProfileGate>
    </QueryClientProvider>,
  );
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("TrainerProfileGate", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("calls POST /api/trainer/profile and then renders the app", async () => {
    const fetchMock = stubFetch(200, { id: 7 });
    renderGate();
    expect(await screen.findByText("Panel trenera")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/trainer\/profile$/);
    expect(init.method).toBe("POST");
  });

  it("konto bez roli trenera (klient, nowe konto, Solo): bez ślepego ekranu — od razu przejście do portalu, ekranów trenera nie widać", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    for (const code of ["CLIENT_ACCOUNT", "TRAINER_NOT_APPROVED", "TRAINER_PROFILE_REQUIRED"]) {
      replace.mockClear();
      stubFetch(403, { code, error: "x" });
      const { unmount } = renderGate();
      await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/client-landing/plan"));
      expect(screen.queryByText("Panel trenera")).toBeNull();
      expect(screen.queryByText(/nie ma jeszcze dostępu trenera/)).toBeNull();
      unmount();
    }
    vi.unstubAllGlobals();
  });

  it("konto zablokowane: jedyny ekran z komunikatem i wylogowaniem", async () => {
    stubFetch(403, { code: "ACCOUNT_BLOCKED", error: "x" });
    renderGate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("To konto jest zablokowane");
    expect(screen.getByText("Wyloguj się")).toBeTruthy();
    expect(screen.queryByText("Panel trenera")).toBeNull();
  });

  it("other failures: error state with retry, no trainer screens", async () => {
    stubFetch(500, { error: "x" });
    renderGate();
    expect(await screen.findByText("Spróbuj ponownie")).toBeTruthy();
    expect(screen.queryByText("Panel trenera")).toBeNull();
  });
});
