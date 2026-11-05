// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ANIMATION_LIBRARY } from "@workspace/survey-config";

const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
const spec = ANIMATION_LIBRARY[0]!.spec;
const item = (o: object = {}) => ({ exerciseId: 117, name: "Pompki klasyczne", status: "review", reviewNote: null, approvedBy: null, approvedAt: null, spec, problems: [], description: "Opis testowy.", executionInstructions: "Wykonanie testowe.", coachingTips: "Wskazówka testowa.", commonMistakes: null, ...o });
let items: unknown[] = [item()];
vi.mock("@workspace/api-client-react", async (orig) => ({
  ...(await orig<object>()),
  customFetch: async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: JSON.parse(init?.body ?? "{}") });
    if (url === "/api/admin/animations") return { items };
    if (url.endsWith("/seed")) return { added: [117], skipped: [] };
    return { ok: true };
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { Animations } from "@/pages/Admin";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Animations /></QueryClientProvider>);
afterEach(() => { cleanup(); calls.length = 0; items = [item()]; });

describe("zakładka Animacje", () => {
  it("podgląd obok opisu i wskazówek; Zatwierdź wysyła zatwierdzenie; Do poprawy wymaga uwagi", async () => {
    wrap(); await screen.findByTestId("admin-animation");
    expect(screen.getByText("Opis testowy.")).toBeTruthy(); expect(screen.getByText(/Wskazówka testowa/)).toBeTruthy(); expect(screen.getByText("Do sprawdzenia")).toBeTruthy();
    fireEvent.click(screen.getByText("Zatwierdź")); await waitFor(() => expect(calls.some((c) => c.url === "/api/admin/animations/117/approve" && c.method === "POST")).toBe(true));
    fireEvent.click(screen.getByText("Do poprawy")); const save = screen.getByText("Zapisz uwagę") as HTMLButtonElement; expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Uwaga do poprawy"), { target: { value: "Kolana do środka" } }); fireEvent.click(save);
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/needs-work"))?.body).toEqual({ note: "Kolana do środka" }));
  });
  it("animacja z błędami danych nie da się zatwierdzić; seed działa", async () => {
    items = [item({ problems: ["Pętla powinna trwać 1,5–4 s"] })]; wrap(); await screen.findByTestId("admin-animation");
    expect((screen.getByText("Zatwierdź") as HTMLButtonElement).disabled).toBe(true); expect(screen.getByRole("alert").textContent).toContain("Pętla");
    fireEvent.click(screen.getByText("Wstaw animacje z biblioteki")); await waitFor(() => expect(calls.some((c) => c.url.endsWith("/seed"))).toBe(true));
  });
});
