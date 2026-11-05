// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls: { url: string; method: string }[] = [];
let enabled = true;
vi.mock("@workspace/api-client-react", async (orig) => ({
  ...(await orig<object>()),
  customFetch: async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url === "/api/roadmap/status") return { enabled };
    if (url === "/api/roadmap") return { items: [{ id: 5, title: "Kalkulator 1RM", blurb: "Szacunek maksa.", icon: "calculator", status: "soon", statusLabel: "Wkrótce", votes: 1, voted: false }] };
    return { ok: true };
  },
}));
import { RoadmapPanelCard } from "@/components/dashboard/RoadmapPanelCard";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RoadmapPanelCard /></QueryClientProvider>);
afterEach(() => { cleanup(); calls.length = 0; enabled = true; });

describe("karta „Wkrótce” na pulpicie trenera", () => {
  it("flaga wyłączona: brak karty i brak pytania o listę", async () => {
    enabled = false; const { container } = wrap();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/roadmap/status")).toBe(true));
    expect(container.innerHTML).toBe(""); expect(calls.some((c) => c.url === "/api/roadmap")).toBe(false);
  });
  it("włączona: karta z pozycją „Wkrótce” i głosowanie „Chcę to”", async () => {
    wrap(); await screen.findByTestId("roadmap-card");
    expect(screen.getByText("Wkrótce")).toBeTruthy();
    fireEvent.click(screen.getByTestId("roadmap-vote"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/roadmap/5/vote" && c.method === "POST")).toBe(true));
  });
});
