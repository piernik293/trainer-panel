// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useTermsGate, TermsGateScreen } from "./TermsGate";
import { DownloadMyData } from "./v2/DownloadMyData";

function Harness() {
  const t = useTermsGate(true);
  return t.state.phase === "needs" ? <TermsGateScreen update={t.state.update} onAccept={t.accept} /> : <p>treść aplikacji</p>;
}
function mock(opts: { enabled: boolean; accepted?: boolean; previous?: string | null; acceptOk?: boolean }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/terms/status") return new Response(JSON.stringify({ enabled: opts.enabled }), { status: 200 });
    if (url === "/api/terms/me") return new Response(JSON.stringify({ accepted: !!opts.accepted, version: "projekt-0.1", previousVersion: opts.previous ?? null }), { status: 200 });
    if (url === "/api/terms/accept") return new Response("{}", { status: opts.acceptOk === false ? 500 : 200 });
    return new Response("{}", { status: 200 });
  }));
  return calls;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("bramka Regulaminu w portalu", () => {
  it("flaga wyłączona: aplikacja bez bramki i bez pytania o zgodę", async () => {
    const calls = mock({ enabled: false }); render(<Harness />);
    await waitFor(() => expect(calls).toContain("GET /api/terms/status"));
    expect(screen.getByText("treść aplikacji")).toBeTruthy(); expect(calls.some((c) => c.includes("/api/terms/me"))).toBe(false);
  });
  it("pierwszy raz: „Zanim zaczniesz”, przycisk nieaktywny bez zaznaczenia; po akceptacji aplikacja", async () => {
    const calls = mock({ enabled: true }); render(<Harness />);
    await screen.findByTestId("terms-screen"); expect(screen.getByText("Zanim zaczniesz")).toBeTruthy();
    expect(screen.getByText("Wersja testowa — dokument w trakcie weryfikacji prawnej.")).toBeTruthy();
    const btn = screen.getByTestId("terms-accept") as HTMLButtonElement; expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("terms-checkbox")); expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await screen.findByText("treść aplikacji"); expect(calls).toContain("POST /api/terms/accept");
  });
  it("po zmianie wersji: „Zaktualizowaliśmy regulamin”; błąd zapisu zostawia ekran z komunikatem", async () => {
    mock({ enabled: true, previous: "projekt-0.0", acceptOk: false }); render(<Harness />);
    await screen.findByText("Zaktualizowaliśmy regulamin");
    fireEvent.click(screen.getByTestId("terms-checkbox")); fireEvent.click(screen.getByTestId("terms-accept"));
    await screen.findByRole("alert"); expect(screen.getByTestId("terms-screen")).toBeTruthy();
  });
  it("„Pobierz moje dane”: tylko przy włączonej fladze; limit pokazuje komunikat", async () => {
    mock({ enabled: false }); const { container } = render(<DownloadMyData />);
    await new Promise((r) => setTimeout(r, 20)); expect(container.innerHTML).toBe(""); cleanup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/terms/status" ? new Response(JSON.stringify({ enabled: true }), { status: 200 }) : new Response("{}", { status: 429 }))));
    render(<DownloadMyData />); fireEvent.click(await screen.findByTestId("download-my-data"));
    await screen.findByText("Dane można pobrać 3 razy na dobę. Spróbuj jutro.");
  });
});
