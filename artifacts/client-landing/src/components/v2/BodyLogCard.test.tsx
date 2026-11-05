// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { BodyLogCard, WeightChart } from "./BodyLogCard";

function mock(enabled: boolean) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const items = [{ id: 1, measuredOn: "2026-10-01", weightKg: 72, waistCm: null, hipsCm: null, chestCm: null, armCm: null, thighCm: null }, { id: 2, measuredOn: "2026-10-08", weightKg: 71.5, waistCm: 80, hipsCm: null, chestCm: null, armCm: null, thighCm: null }];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (url === "/api/body-log/status") return new Response(JSON.stringify({ enabled }), { status: 200 });
    if (url === "/api/client-portal/body" && !init?.method) return new Response(JSON.stringify({ items }), { status: 200 });
    return new Response("{}", { status: 201 });
  }));
  return calls;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("masa i obwody w Postępach", () => {
  it("flaga wyłączona: nic nie renderuje", async () => {
    const calls = mock(false); const { container } = render(<BodyLogCard />);
    await waitFor(() => expect(calls.length).toBe(1)); expect(container.innerHTML).toBe("");
  });
  it("pokazuje wykres i ostatnie wpisy; zapis wysyła liczbę z przecinkiem; puste pole = komunikat; bez ocen i celów", async () => {
    const calls = mock(true); render(<BodyLogCard />);
    await screen.findByTestId("body-log"); expect(screen.getByTestId("weight-chart")).toBeTruthy();
    expect(screen.getByTestId("body-recent").textContent).toContain("71.5 kg");
    fireEvent.click(screen.getByTestId("body-save")); await screen.findByText("Wpisz co najmniej jedną wartość.");
    fireEvent.change(screen.getByTestId("body-weight"), { target: { value: "70,4" } });
    fireEvent.click(screen.getByTestId("body-save"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(JSON.parse(calls.find((c) => c.method === "POST")!.body!)).toEqual({ weightKg: 70.4 });
    expect(document.body.textContent).not.toMatch(/cel|norma|schud|odchud|za dużo|za mało|BMI|brawo/i);
  });
  it("wykres: mniej niż 2 punkty = brak; z dwóch punktów linia", () => {
    const { container, rerender } = render(<WeightChart points={[{ day: "2026-10-01", v: 70 }]} />);
    expect(container.innerHTML).toBe("");
    rerender(<WeightChart points={[{ day: "2026-10-01", v: 70 }, { day: "2026-10-08", v: 69 }]} />);
    expect(container.querySelector("polyline")).toBeTruthy();
  });
});
