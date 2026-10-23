/**
 * @vitest-environment happy-dom
 *
 * SurveyInvite — "Wyślij e-mailem": offered only with an address; the link stays
 * copyable; missing SMTP configuration shows a readable message (no silent failure).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import SurveyInvite from "@/pages/SurveyInvite";

vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { fullName: "Anna Nowak", firstName: "Anna" } }) }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(createResponse: unknown) {
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return json(createResponse, 201);
    }
    return json([]);
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><SurveyInvite /></QueryClientProvider>);
  return calls;
}

const created = (email: unknown) => ({
  id: 1, token: "a".repeat(64), intendedEmail: "k@example.com",
  expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), createdAt: new Date().toISOString(), email,
});

describe("SurveyInvite — wysyłka e-mailem", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("the e-mail button appears only after an address is typed", async () => {
    setup(created({ requested: false, sent: false }));
    expect(screen.queryByTestId("send-invite-email")).toBeNull();
    fireEvent.change(screen.getByLabelText(/E-mail klienta/), { target: { value: "k@example.com" } });
    expect(screen.getByTestId("send-invite-email").textContent).toContain("Wyślij e-mailem");
  });

  it("sends sendEmail + trainer name and still shows the copyable link", async () => {
    const calls = setup(created({ requested: true, sent: true }));
    fireEvent.change(screen.getByLabelText(/E-mail klienta/), { target: { value: "k@example.com" } });
    fireEvent.click(screen.getByTestId("send-invite-email"));
    expect(await screen.findByTestId("email-sent")).toBeTruthy();
    expect(calls[0].body).toMatchObject({ intendedEmail: "k@example.com", sendEmail: true, trainerName: "Anna Nowak" });
    expect(screen.getByText("Kopiuj")).toBeTruthy();
  });

  it("missing SMTP configuration: readable message, link still available", async () => {
    setup(created({ requested: true, sent: false, code: "SMTP_NOT_CONFIGURED", message: "Wysyłka e-mailem nie jest skonfigurowana (brak ustawień SMTP na serwerze). Skopiuj link i wyślij go klientowi samodzielnie." }));
    fireEvent.change(screen.getByLabelText(/E-mail klienta/), { target: { value: "k@example.com" } });
    fireEvent.click(screen.getByTestId("send-invite-email"));
    const msg = await screen.findByTestId("email-not-sent");
    expect(msg.textContent).toContain("nie jest skonfigurowana");
    expect(screen.queryByTestId("email-sent")).toBeNull();
    expect(screen.getByText("Kopiuj")).toBeTruthy();
  });

  it("'Wygeneruj link' never requests an e-mail", async () => {
    const calls = setup(created({ requested: false, sent: false }));
    fireEvent.change(screen.getByLabelText(/E-mail klienta/), { target: { value: "k@example.com" } });
    fireEvent.click(screen.getByText("Wygeneruj link"));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ sendEmail: false });
    expect(screen.queryByTestId("email-sent")).toBeNull();
    expect(screen.queryByTestId("email-not-sent")).toBeNull();
  });
});
