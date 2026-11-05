// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const mutate = vi.fn();
let pending = false;
vi.mock("@/lib/planApi", async (orig) => ({ ...(await orig<object>()), useUpdatePlan: () => ({ mutate, isPending: pending }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { PlanInfoForm } from "@/pages/PlanEditor";

const plan = { id: 7, clientId: 3, title: "Plan A", goal: "Siła", description: "", startDate: null, endDate: null, trainerNotes: "", experienceLevelUsed: "Początkujący", status: "draft" } as never;
beforeEach(() => { vi.useFakeTimers(); mutate.mockReset(); pending = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("autozapis informacji planu", () => {
  it("po 1,5 s od zmiany zapisuje sam (bez przycisku); brak zmian = brak zapisu", () => {
    render(<PlanInfoForm plan={plan} planId={7} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tytuł planu"), { target: { value: "Plan B" } });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(mutate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect((mutate.mock.calls[0]![0] as { title: string }).title).toBe("Plan B");
  });
  it("kolejna zmiana przed upływem czasu przesuwa zapis (jeden zapis z ostatnią wartością); sukces pokazuje „Zapisano automatycznie”", () => {
    render(<PlanInfoForm plan={plan} planId={7} />);
    const input = screen.getByLabelText("Tytuł planu");
    fireEvent.change(input, { target: { value: "P1" } });
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.change(input, { target: { value: "P2" } });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(mutate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(600); });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect((mutate.mock.calls[0]![0] as { title: string }).title).toBe("P2");
    const opts = mutate.mock.calls[0]![1] as { onSuccess: (u: unknown) => void };
    act(() => { opts.onSuccess({ ...(plan as object), title: "P2" }); });
    expect(screen.getByTestId("plan-autosaved")).toBeTruthy();
  });
  it("nieudany zapis nie powtarza się w pętli", () => {
    render(<PlanInfoForm plan={plan} planId={7} />);
    fireEvent.change(screen.getByLabelText("Tytuł planu"), { target: { value: "X" } });
    act(() => { vi.advanceTimersByTime(1600); });
    const opts = mutate.mock.calls[0]![1] as { onError: (e: unknown) => void };
    act(() => { opts.onError(new Error("fail")); vi.advanceTimersByTime(20_000); });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
