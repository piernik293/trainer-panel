/**
 * @vitest-environment happy-dom
 * Strona „Do weryfikacji”: lista z odmianą czego/sprzętem, Zweryfikuj, Ukryj, osobny przełącznik „brak aktywności” z potwierdzeniem.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const calls: { url: string; method: string; body?: string }[] = [];
let rows: Record<string, unknown>[];
vi.mock("@workspace/api-client-react", () => ({
  customFetch: async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (!init?.method) return rows;
    const id = Number(url.split("/")[3]);
    if (url.endsWith("/verify")) { rows = rows.filter((r) => r.id !== id); return {}; }
    return {};
  },
}));
vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import ExerciseReview from "@/pages/ExerciseReview";

afterEach(() => { cleanup(); calls.length = 0; });
const row = (o: object = {}) => ({ id: 5, name: "Wyciskanie z gumą", difficultyLevel: "Średniozaawansowany", movementPattern: "Pchanie poziome", equipment: ["Gumy oporowe"], jointStressAreas: ["Bark"], parentExerciseId: 1, parentName: "Wyciskanie sztangi leżąc", variantGrip: "szeroki", variantPosition: null, unilateral: false, intensity: null, description: "Opis własny.", learningDifficulty: 2, suitableForNoActivity: false, reviewedByTrainer: false, hidden: false, canAct: true, ...o });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ExerciseReview /></QueryClientProvider>);

describe("Do weryfikacji", () => {
  it("shows what it is a variant of, level, equipment, joints and description", async () => {
    rows = [row()];
    wrap();
    const r = await screen.findByTestId("review-row");
    expect(r.textContent).toContain("Odmiana: Wyciskanie sztangi leżąc");
    expect(r.textContent).toContain("Gumy oporowe");
    expect(r.textContent).toContain("Średniozaawansowany");
    expect(r.textContent).toContain("Stawy: Bark");
    expect(r.textContent).toContain("Opis własny.");
    expect(screen.getByTestId("review-count").textContent).toBe("1 ćwiczeń");
  });
  it("Zweryfikuj calls verify only (does not touch the no-activity switch) and the row leaves the list", async () => {
    rows = [row()];
    wrap();
    fireEvent.click(await screen.findByText("Zweryfikuj"));
    await waitFor(() => expect(screen.queryByTestId("review-row")).toBeNull());
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/exercises/5/verify"]);
  });
  it("Ukryj calls hide with hidden = true", async () => {
    rows = [row()];
    wrap();
    fireEvent.click(await screen.findByText("Ukryj"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/exercises/5/hide" && c.body === JSON.stringify({ hidden: true }))).toBe(true));
  });
  it("the no-activity switch needs its own confirmation; Anuluj sends nothing", async () => {
    rows = [row()];
    wrap();
    fireEvent.click(await screen.findByText("Dla braku aktywności…"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Brak aktywności fizycznej/);
    fireEvent.click(within(dialog).getByText("Anuluj"));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    fireEvent.click(await screen.findByText("Dla braku aktywności…"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByText("Tak, zaznacz"));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/exercises/5/verify", "/api/exercises/5/no-activity"]));
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/no-activity"))!.body!)).toEqual({ value: true, confirm: true });
  });
  it("a non-admin sees the list but no action buttons", async () => {
    rows = [row({ canAct: false })];
    wrap();
    await screen.findByTestId("review-row");
    expect(screen.queryByText("Zweryfikuj")).toBeNull();
    expect(screen.queryByText("Ukryj")).toBeNull();
  });
});
