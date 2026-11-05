// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls: { url: string; method: string }[] = [];
let enabled = true;
let view: Record<string, unknown> = {};
const base = { steps: [{ id: "client", label: "Dodaj podopiecznego", done: false }, { id: "invite", label: "Wyślij link do wywiadu", done: false }, { id: "plan", label: "Ułóż plan generatorem", done: false }, { id: "activate", label: "Aktywuj i wyślij dostęp", done: false }], dismissed: false, completed: false, completedMinutes: null, exampleClientId: null };
vi.mock("@workspace/api-client-react", async (orig) => ({
  ...(await orig<object>()),
  customFetch: async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url === "/api/onboarding/status") return { enabled };
    if (url === "/api/onboarding" && !init?.method) return view;
    if (url === "/api/onboarding/example") return { clientId: 9 };
    return { ok: true };
  },
}));
vi.mock("wouter", () => ({ Link: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
import { TutorialCard, Spotlight } from "@/components/onboarding/TutorialCard";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TutorialCard /></QueryClientProvider>);
afterEach(() => { cleanup(); calls.length = 0; enabled = true; view = base; });

describe("samouczek trenera", () => {
  it("flaga wyłączona: nic nie pokazuje", async () => {
    enabled = false; view = base; const { container } = wrap();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/onboarding/status")).toBe(true)); expect(container.innerHTML).toBe("");
  });
  it("4 kroki, „Pierwszy plan w 10 minut”, przykład i pominięcie; pominięcie zapisuje na koncie", async () => {
    view = base; wrap(); await screen.findByTestId("tutorial-card");
    expect(screen.getByText("Pierwszy plan w 10 minut")).toBeTruthy(); expect(screen.getAllByText("Zacznij")).toHaveLength(4);
    expect(screen.getByText(/Przykładowy klient nie liczy się do limitu i nie dostaje maili/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("create-example")); await waitFor(() => expect(calls.some((c) => c.url === "/api/onboarding/example" && c.method === "POST")).toBe(true));
    fireEvent.click(screen.getByTestId("tutorial-dismiss")); await waitFor(() => expect(calls.some((c) => c.url === "/api/onboarding/dismiss")).toBe(true));
  });
  it("spotlight: „Krok 1 z 4”, Dalej przechodzi do kolejnego, Pomiń zamyka i zapisuje; Esc też pomija", async () => {
    view = base; wrap(); await screen.findByTestId("tutorial-card");
    fireEvent.click(screen.getByTestId("start-tour"));
    expect(screen.getByText("KROK 1 Z 4")).toBeTruthy(); fireEvent.click(screen.getByTestId("spotlight-next")); expect(screen.getByText("KROK 2 Z 4")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" }); await waitFor(() => expect(calls.some((c) => c.url === "/api/onboarding/dismiss")).toBe(true));
  });
  it("ukończony: „Pierwszy plan gotowy! Zajęło Ci to X min”, zaproszenie prawdziwego klienta i usunięcie przykładu", async () => {
    view = { ...base, steps: base.steps.map((s) => ({ ...s, done: true })), completed: true, completedMinutes: 7, exampleClientId: 9 }; wrap();
    await screen.findByTestId("tutorial-done"); expect(screen.getByText("Pierwszy plan gotowy! Zajęło Ci to 7 min")).toBeTruthy();
    expect(screen.getByText("Zaproś prawdziwego klienta")).toBeTruthy(); expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("remove-example")); await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
  it("spotlight wyróżnia element z data-tour i sprząta po sobie", () => {
    const target = document.createElement("div"); target.setAttribute("data-tour", "plan"); document.body.appendChild(target);
    const { unmount } = render(<Spotlight step={3} total={4} text="x" targetId="plan" onNext={() => {}} onSkip={() => {}} />);
    expect(target.style.outline).toContain("3px"); unmount(); expect(target.style.outline).toBe(""); target.remove();
  });
});
