// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
let enabled = true;
const LIB = { useOwnInGenerator: false, joints: ["Kolano", "Bark"], levels: ["Niskie", "Średnie"], exercises: [
  { id: 1, name: "Pełne", isActive: true, complete: true, missing: [], jointStress: "Niskie", jointStressAreas: [], shareConsent: false, shareStatus: "none", shareRejectReason: null },
  { id: 2, name: "Niepełne", isActive: true, complete: false, missing: ["Poziom obciążenia stawów"], jointStress: null, jointStressAreas: null, shareConsent: false, shareStatus: "rejected", shareRejectReason: "Za mało szczegółów" },
] };
vi.mock("@workspace/api-client-react", async (orig) => ({
  ...(await orig<object>()),
  customFetch: async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: JSON.parse(init?.body ?? "{}") });
    if (url === "/api/trainer-library/status") return { enabled };
    if (url === "/api/trainer-library") return LIB;
    return { ok: true };
  },
}));
vi.mock("wouter", () => ({ Link: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import TrainerLibrary from "@/pages/TrainerLibrary";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TrainerLibrary /></QueryClientProvider>);
afterEach(() => { cleanup(); calls.length = 0; enabled = true; });

describe("Moja biblioteka", () => {
  it("flaga wyłączona: komunikat, bez pobierania listy", async () => {
    enabled = false; wrap();
    await screen.findByText("Ta funkcja jest jeszcze niedostępna."); expect(calls.some((c) => c.url === "/api/trainer-library")).toBe(false);
  });
  it("lista z kompletnością, zgodą domyślnie niezaznaczoną i blokadą zgody dla niekompletnego; powód odrzucenia widoczny", async () => {
    wrap(); await screen.findByTestId("library-list");
    const boxes = screen.getAllByTestId("library-consent") as HTMLInputElement[];
    expect(boxes[0]!.checked).toBe(false); expect(boxes[0]!.disabled).toBe(false); expect(boxes[1]!.disabled).toBe(true);
    expect(screen.getByText(/Brakuje: Poziom obciążenia stawów/)).toBeTruthy();
    expect(screen.getByTestId("library-share-status").textContent).toContain("Odrzucone: Za mało szczegółów");
    expect(screen.getAllByText("Regulamin, §8").length).toBeGreaterThan(0);
  });
  it("zgoda wysyła PUT; opcja generatora wysyła ustawienie; uzupełnienie stawów wymaga poziomu", async () => {
    wrap(); await screen.findByTestId("library-list");
    fireEvent.click(screen.getAllByTestId("library-consent")[0]!);
    await waitFor(() => expect(calls.find((c) => c.url === "/api/trainer-library/1/share")?.body).toEqual({ consent: true }));
    fireEvent.click(screen.getByTestId("library-generator"));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/trainer-library/settings")?.body).toEqual({ useOwnInGenerator: true }));
    fireEvent.click(screen.getAllByText("Stawy i poziom obciążenia")[1]!);
    const save = screen.getByText("Zapisz") as HTMLButtonElement; expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Średnie" } });
    fireEvent.click(screen.getByLabelText("Bark")); fireEvent.click(save);
    await waitFor(() => expect(calls.find((c) => c.url === "/api/trainer-library/2")?.body).toEqual({ jointStress: "Średnie", jointStressAreas: ["Bark"] }));
  });
});
