// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { RoadmapSection } from "./RoadmapSection";

const items = [
  { id: 1, title: "Kalkulator 1RM", blurb: "Szacunek maksa.", icon: "calculator", status: "soon", statusLabel: "Wkrótce", votes: 2, voted: false },
  { id: 2, title: "Asystent AI", blurb: "Odpowiedzi.", icon: "sparkles", status: "soon", statusLabel: "Wkrótce", votes: 0, voted: true },
];
function mockFetch(enabled: boolean, voteOk = true) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url === "/api/roadmap/status") return new Response(JSON.stringify({ enabled }), { status: 200 });
    if (url === "/api/roadmap") return new Response(JSON.stringify({ items }), { status: 200 });
    return new Response("{}", { status: voteOk ? 200 : 500 });
  }));
  return calls;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Wkrótce w „Ty”", () => {
  it("flaga wyłączona: nic nie renderuje i nie pyta o listę", async () => {
    const calls = mockFetch(false);
    const { container } = render(<RoadmapSection />);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(container.innerHTML).toBe(""); expect(calls.some((c) => c.url === "/api/roadmap")).toBe(false);
  });
  it("pokazuje karty z „Wkrótce” i licznikiem; „Chcę to” głosuje, drugi klik cofa", async () => {
    const calls = mockFetch(true);
    render(<RoadmapSection />);
    await screen.findByTestId("roadmap-card");
    expect(screen.getAllByText("Wkrótce")).toHaveLength(2);
    const [b1] = screen.getAllByTestId("roadmap-vote");
    expect(b1!.textContent).toContain("2");
    fireEvent.click(b1!);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/roadmap/1/vote" && c.method === "POST")).toBe(true));
    expect(screen.getAllByTestId("roadmap-vote")[0]!.textContent).toContain("3");
    fireEvent.click(screen.getAllByTestId("roadmap-vote")[0]!);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/roadmap/1/vote" && c.method === "DELETE")).toBe(true));
    expect(screen.getAllByTestId("roadmap-vote")[0]!.textContent).toContain("2");
  });
  it("błąd zapisu głosu cofa zmianę licznika", async () => {
    mockFetch(true, false);
    render(<RoadmapSection />);
    await screen.findByTestId("roadmap-card");
    fireEvent.click(screen.getAllByTestId("roadmap-vote")[0]!);
    await waitFor(() => expect(screen.getAllByTestId("roadmap-vote")[0]!.textContent).toContain("2"));
    expect(screen.getAllByTestId("roadmap-vote")[0]!.getAttribute("aria-pressed")).toBe("false");
  });
});
