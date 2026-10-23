/**
 * @vitest-environment happy-dom
 *
 * SurveyInvite — a failed invite-list request must show an error with retry,
 * never "Brak aktywnych zaproszeń." (regression: 401 looked like an empty list).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import SurveyInvite from "@/pages/SurveyInvite";

vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { fullName: "Anna Nowak", firstName: "Anna" } }) }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SurveyInvite />
    </QueryClientProvider>,
  );
}

describe("SurveyInvite — failed invite list", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows the session error with retry instead of an empty list", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Twoja sesja wygasła. Zaloguj się ponownie." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Twoja sesja wygasła");
    expect(screen.queryByText("Brak aktywnych zaproszeń.")).toBeNull();

    fireEvent.click(screen.getByText("Spróbuj ponownie"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("still shows the empty state when the list is genuinely empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
    renderPage();
    expect(await screen.findByText("Brak aktywnych zaproszeń.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
