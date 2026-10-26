// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { BreathingSetting } from "./BreathingSetting";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

describe("BreathingSetting", () => {
  it("jest domyślnie wyłączony i ma dokładnie ten podpis", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ breathingCooldown: false })));
    render(<BreathingSetting />);
    const sw = await screen.findByRole("switch", { name: "Kończ schłodzenie minutą spokojnego oddechu" });
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false));
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });
  it("włączenie zapisuje ustawienie; błąd cofa przełącznik i pokazuje komunikat", async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "PUT" ? json({}, 500) : json({ breathingCooldown: false })));
    vi.stubGlobal("fetch", f);
    render(<BreathingSetting />);
    const sw = await screen.findByRole("switch");
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Nie udało się zapisać/));
    expect(sw.getAttribute("aria-checked")).toBe("false");
    const put = f.mock.calls.find((c) => c[1]?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ breathingCooldown: true });
  });
});
