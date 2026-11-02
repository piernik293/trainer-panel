/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import DemoPage from "./demo";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubFetch(enabled: boolean) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: (init?.method ?? "GET").toUpperCase() });
    return { ok: true, json: async () => ({ enabled }) };
  }));
  return calls;
}

describe("tryb podglądu bez konta", () => {
  it("flaga wyłączona: komunikat zamiast podglądu", async () => {
    stubFetch(false);
    render(<DemoPage />);
    await waitFor(() => expect(screen.getByText("Podgląd jest niedostępny")).toBeTruthy());
    expect(screen.queryByTestId("demo-banner")).toBeNull();
  });

  it("przejście Dziś → trening → seria → koniec: pasek trybu podglądu, zero zapytań poza odczytem flagi, zachęta do rejestracji", async () => {
    window.localStorage.clear();
    const calls = stubFetch(true);
    render(<DemoPage />);
    await waitFor(() => expect(screen.getByTestId("demo-banner")).toBeTruthy());
    expect(screen.getByTestId("demo-banner").textContent).toContain("Tryb podglądu — nic nie jest zapisywane");
    fireEvent.click(screen.getByRole("button", { name: /Zacznij trening/ }));
    for (let guard = 0; guard < 40 && !screen.queryByTestId("demo-end"); guard++) {
      const save = screen.queryByRole("button", { name: /Zapisz serię/ });
      if (save) { fireEvent.click(save); continue; }
      const nextBtn = screen.queryByRole("button", { name: /Następne ćwiczenie|Przejdź do podsumowania/ });
      if (nextBtn) fireEvent.click(nextBtn);
    }
    expect(screen.getByTestId("demo-end").textContent).toContain("Załóż konto, żeby zapisywać postępy");
    expect(screen.getByRole("link", { name: "Załóż konto" }).getAttribute("href")).toBe("/sign-up");
    // „Coś boli?” nic nie zapisuje
    expect(calls.every((c) => c.method === "GET" && c.url.includes("/api/guest-demo/status"))).toBe(true);
    expect(calls.length).toBe(1);
    expect(window.localStorage.length).toBe(0); // nic nie ląduje nawet w pamięci przeglądarki (kolejka treningu)
  });

  it("brak wywiadu i pytań o zdrowie na ekranie podglądu (375 px — jedna kolumna, bez sztywnych szerokości)", async () => {
    stubFetch(true);
    const { container } = render(<DemoPage />);
    await waitFor(() => expect(screen.getByTestId("demo-today")).toBeTruthy());
    expect(container.textContent).not.toMatch(/wywiad|ból|kontuzj|zdrow/i);
    expect(container.querySelector("main")?.className).toContain("max-w-2xl");
  });
});
