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

  it("client account: shows the Polish message and never renders trainer screens", async () => {
    stubFetch(403, {
      code: "CLIENT_ACCOUNT",
      error: "To konto należy do klienta. Zaloguj się w portalu klienta albo użyj konta trenera.",
    });
    renderGate();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("portalu klienta");
    expect(screen.queryByText("Panel trenera")).toBeNull();
    expect(screen.getByText("Wyloguj się")).toBeTruthy();
  });

  it("other failures: error state with retry, no trainer screens", async () => {
    stubFetch(500, { error: "x" });
    renderGate();
    expect(await screen.findByText("Spróbuj ponownie")).toBeTruthy();
    expect(screen.queryByText("Panel trenera")).toBeNull();
  });
});
