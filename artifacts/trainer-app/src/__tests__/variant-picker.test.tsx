/**
 * @vitest-environment happy-dom
 * Odmiany w edytorze planu: rozwijana lista z kontrolą sprzętu i zamianą miejsca w planie.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const calls: { url: string; method: string; body?: string }[] = [];
let variants: unknown[] = [];
vi.mock("@/lib/planApi", async () => {
  const rq = await import("@tanstack/react-query");
  return {
    useExerciseVariants: (id: number) => rq.useQuery({ queryKey: ["v", id], queryFn: async () => { calls.push({ url: `/exercises/${id}/variants`, method: "GET" }); return variants; } }),
    useReplaceWithVariant: (planId: number) => rq.useMutation({ mutationFn: async (v: { planExerciseId: number; exerciseId: number }) => { calls.push({ url: `/plans/${planId}/exercises/${v.planExerciseId}/variant-replacement`, method: "POST", body: JSON.stringify({ exerciseId: v.exerciseId }) }); return {}; } }),
  };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { VariantPicker } from "@/components/VariantPicker";

afterEach(() => { cleanup(); calls.length = 0; });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("VariantPicker", () => {
  it("renders nothing when the exercise has no variants", async () => {
    variants = [];
    const { container } = wrap(<VariantPicker planId={1} planExerciseId={10} exerciseId={3} />);
    await waitFor(() => expect(container.querySelector("[data-testid=variant-picker]")).toBeNull());
    expect(calls).toHaveLength(1);
  });
  it("lists variants with equipment and swaps the slot", async () => {
    variants = [{ id: 7, name: "Wyciskanie z gumą", equipment: ["Gumy oporowe"], unilateral: false, reviewedByTrainer: false }];
    wrap(<VariantPicker planId={1} planExerciseId={10} exerciseId={3} />);
    fireEvent.click(await screen.findByText(/Odmiany \(1\)/));
    expect(screen.getByText(/Gumy oporowe/).textContent).toContain("niezweryfikowane");
    fireEvent.click(screen.getByText("Zamień"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/plans/1/exercises/10/variant-replacement" && c.body === JSON.stringify({ exerciseId: 7 }))).toBe(true));
  });
  it("read-only (archived plan): no swap button", async () => {
    variants = [{ id: 7, name: "Wyciskanie z gumą", equipment: [], unilateral: true, reviewedByTrainer: true }];
    wrap(<VariantPicker planId={1} planExerciseId={10} exerciseId={3} readOnly />);
    fireEvent.click(await screen.findByText(/Odmiany/));
    expect(screen.queryByText("Zamień")).toBeNull();
    expect(screen.getByText(/jednostronne/)).toBeTruthy();
  });
});
