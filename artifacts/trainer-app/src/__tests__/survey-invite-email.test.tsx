/**
 * @vitest-environment happy-dom
 *
 * "Zaproś klienta": two separate actions, validation, live e-mail preview,
 * one result message (no raw token URL on screen), duplicate warning →
 * replace, statuses and status-dependent actions in the list.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import SurveyInvite from "@/pages/SurveyInvite";

vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { fullName: "Anna Nowak", firstName: "Anna" } }) }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Call = { url: string; method: string; body?: Record<string, unknown> };

function setup(opts: { list?: unknown[]; post?: (body: Record<string, unknown>, n: number) => Response } = {}) {
  const calls: Call[] = [];
  let posts = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (method === "POST" && url.endsWith("/survey-invites")) {
      posts++;
      return opts.post ? opts.post(body, posts) : json(created({ requested: !!body.sendEmail, sent: !!body.sendEmail }, body), 201);
    }
    return json(opts.list ?? []);
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><SurveyInvite /></QueryClientProvider>);
  return calls;
}

const TOKEN = "a".repeat(64);
const created = (email: unknown, body?: Record<string, unknown>) => ({
  id: 1, token: TOKEN, clientName: body?.clientName ?? "Marta", intendedEmail: body?.intendedEmail ?? null, email,
});

const fill = (name: string, email = "", message = "") => {
  fireEvent.change(screen.getByLabelText("Imię klienta"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: email } });
  if (message) fireEvent.change(screen.getByLabelText(/Wiadomość dla klienta/), { target: { value: message } });
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Nowe zaproszenie", () => {
  it("„Wyślij e-mailem” aktywne tylko z imieniem i poprawnym e-mailem; zły e-mail → komunikat pod polem", () => {
    setup();
    const send = screen.getByTestId("send-invite-email") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fill("Marta", "zly-adres");
    expect(send.disabled).toBe(true);
    expect(screen.getByText("Sprawdź adres e-mail.")).toBeTruthy();
    fill("Marta", "marta@example.com");
    expect(send.disabled).toBe(false);
  });

  it("imię jest wymagane: „Utwórz link” bez imienia pokazuje błąd i nic nie wysyła", () => {
    const calls = setup();
    fireEvent.click(screen.getByTestId("create-link"));
    expect(screen.getByText("Podaj imię klienta.")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("limity pól: imię 80, wiadomość 500 z licznikiem; podgląd maila aktualizuje się na żywo", () => {
    setup();
    expect((screen.getByLabelText("Imię klienta") as HTMLInputElement).maxLength).toBe(80);
    expect((screen.getByLabelText(/Wiadomość dla klienta/) as HTMLTextAreaElement).maxLength).toBe(500);
    fill("Marta", "", "Do zobaczenia w poniedziałek!");
    expect(screen.getByTestId("message-counter").textContent).toBe("29/500");
    const preview = screen.getByTestId("email-preview");
    expect(within(preview).getByText("Cześć Marta,")).toBeTruthy();
    expect(within(preview).getByTestId("preview-message").textContent).toBe("Do zobaczenia w poniedziałek!");
    expect(within(preview).getByText("Anna Nowak")).toBeTruthy();
    expect(within(preview).getByText("Wysłano przez Optimatren")).toBeTruthy();
  });

  it("wysyłka e-mailem: payload z imieniem i wiadomością; jeden komunikat; bez surowego linku na ekranie", async () => {
    const calls = setup();
    fill("Marta", "marta@example.com", "Cześć!");
    fireEvent.click(screen.getByTestId("send-invite-email"));
    const result = await screen.findByTestId("invite-result");
    expect(result.textContent).toContain("Zaproszenie wysłane do Marta");
    expect(result.textContent).toContain("Możesz też wysłać go sam");
    expect(screen.getByTestId("copy-link")).toBeTruthy();
    expect(document.body.textContent).not.toContain(TOKEN);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ clientName: "Marta", intendedEmail: "marta@example.com", trainerMessage: "Cześć!", sendEmail: true, replaceExisting: false });
  });

  it("„Utwórz link do skopiowania” nigdy nie wysyła maila → „Link gotowy dla …”", async () => {
    const calls = setup();
    fill("Marta", "marta@example.com");
    fireEvent.click(screen.getByTestId("create-link"));
    expect((await screen.findByTestId("invite-result")).textContent).toContain("Link gotowy dla Marta");
    expect(screen.getByTestId("invite-next-step").textContent).toContain("poczekaj, aż klient wypełni wywiad");
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ sendEmail: false });
  });

  it("brak SMTP: czytelny komunikat, link nadal do skopiowania", async () => {
    setup({ post: (b) => json(created({ requested: true, sent: false, code: "SMTP_NOT_CONFIGURED", message: "Wysyłka e-mailem nie jest skonfigurowana (brak ustawień SMTP na serwerze). Skopiuj link i wyślij go klientowi samodzielnie." }, b), 201) });
    fill("Marta", "marta@example.com");
    fireEvent.click(screen.getByTestId("send-invite-email"));
    expect((await screen.findByTestId("email-not-sent")).textContent).toContain("nie jest skonfigurowana");
    expect(screen.getByTestId("invite-result").textContent).toContain("Link gotowy dla Marta");
    expect(screen.getByTestId("copy-link")).toBeTruthy();
  });

  it("duplikat: ostrzeżenie z datą → „Wyślij nowe” wysyła z replaceExisting; „Anuluj” zamyka", async () => {
    const calls = setup({
      post: (b, n) =>
        n === 1
          ? json({ code: "DUPLICATE_ACTIVE_INVITE", error: "x", existing: { id: 7, clientName: "Marta", createdAt: "2026-10-20T10:00:00.000Z" } }, 409)
          : json(created({ requested: true, sent: true }, b), 201),
    });
    fill("Marta", "marta@example.com");
    fireEvent.click(screen.getByTestId("send-invite-email"));
    const warn = await screen.findByTestId("duplicate-warning");
    expect(warn.textContent).toContain("Marta ma już aktywne zaproszenie z 20 października. Wysłać nowe?");
    expect(warn.textContent).toContain("Poprzednie zostanie odwołane.");
    fireEvent.click(within(warn).getByText("Wyślij nowe"));
    await screen.findByTestId("invite-result");
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toMatchObject({ replaceExisting: true, sendEmail: true });
  });
});

describe("Wysłane zaproszenia", () => {
  const base = { intendedEmail: "k@example.com", channel: "email", clientId: null, expiresAt: "2026-10-30T10:00:00.000Z", createdAt: "2026-10-22T10:00:00.000Z", lastSentAt: null, openedAt: null };
  const list = [
    { ...base, id: 1, clientName: "Ala", status: "sent" },
    { ...base, id: 2, clientName: "Ola", status: "opened" },
    { ...base, id: 3, clientName: "Ela", status: "completed", clientId: 55 },
    { ...base, id: 4, clientName: "Iza", status: "expired" },
    { ...base, id: 5, clientName: "Uta", status: "revoked" },
    { ...base, id: 6, clientName: "Link", status: "sent", channel: "link", intendedEmail: null },
  ];

  it("statusy jako pigułki z tekstem i akcje zależne od statusu", async () => {
    setup({ list });
    const rows = await screen.findAllByTestId("invite-row");
    const row = (name: string) => rows.find((r) => r.textContent?.includes(name))!;
    expect(within(row("Ala")).getByText("Wysłane")).toBeTruthy();
    expect(within(row("Ala")).getByText("Wyślij ponownie")).toBeTruthy();
    expect(within(row("Ala")).getByText("e-mail · k@example.com")).toBeTruthy();
    expect(within(row("Ola")).getByText("Otwarte")).toBeTruthy();
    expect(within(row("Ola")).getByText("Przypomnij")).toBeTruthy();
    expect(within(row("Ela")).getByText("Wypełniony")).toBeTruthy();
    expect(within(row("Ela")).getByRole("link", { name: "Zobacz odpowiedzi" }).getAttribute("href")).toBe("/clients/55");
    expect(within(row("Iza")).getByText("Wygasło")).toBeTruthy();
    expect(within(row("Iza")).getByText("Wyślij nowe")).toBeTruthy();
    expect(within(row("Uta")).getByText("Odwołane")).toBeTruthy();
    expect(within(row("Link")).getByText("link")).toBeTruthy();
    expect(within(row("Link")).getByText("Nowy link")).toBeTruthy();
  });

  it("„Przypomnij” woła /remind; za wcześnie → komunikat serwera", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.endsWith("/remind")) return json({ code: "REMINDER_TOO_SOON", error: "Kolejny e-mail możesz wysłać po 24 października, 10:00." }, 429);
      return json(list);
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><SurveyInvite /></QueryClientProvider>);
    const rows = await screen.findAllByTestId("invite-row");
    fireEvent.click(within(rows.find((r) => r.textContent?.includes("Ola"))!).getByText("Przypomnij"));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/survey-invites/2/remind") && c.method === "POST")).toBe(true));
  });
});
