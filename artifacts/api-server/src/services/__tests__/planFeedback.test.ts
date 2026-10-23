import { describe, it, expect } from "vitest";
import { buildPlanFeedback } from "../planFeedback.js";
import type { DailyAllocationInput, DailyAllocationResult } from "../dailyAllocationEngine.js";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Minimal input used as a base; override fields as needed. */
function makeInput(
  overrides: Partial<DailyAllocationInput> = {},
): DailyAllocationInput {
  return {
    days: [
      { dayIndex: 0, dayType: "push" },
      { dayIndex: 1, dayType: "pull" },
      { dayIndex: 2, dayType: "legs" },
    ],
    weeklyTargets: { chest: 12, back: 12, legs: 12 },
    constraints: { sessionMax: 20, sessionMin: 4 },
    ...overrides,
  };
}

/** Minimal feasible result (all volume placed, no day near max). */
function makeResult(
  overrides: Partial<DailyAllocationResult> = {},
): DailyAllocationResult {
  return {
    status: "feasible",
    weeklyAllocated: { chest: 12, back: 12, legs: 12 },
    weeklyUnresolved: { chest: 0, back: 0, legs: 0 },
    days: [
      { dayIndex: 0, dayType: "push", allocations: { chest: 12 }, total: 12 },
      { dayIndex: 1, dayType: "pull", allocations: { back: 12 }, total: 12 },
      { dayIndex: 2, dayType: "legs", allocations: { legs: 12 }, total: 12 },
    ],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildPlanFeedback", () => {
  // ── 1. Unresolved volume ────────────────────────────────────────────────────

  describe("Case 1 — unresolved volume", () => {
    it("adds the unresolved message and suggestion", () => {
      const result = buildPlanFeedback(
        makeResult({
          status: "feasible_with_tradeoffs",
          weeklyUnresolved: { chest: 4, back: 0, legs: 0 },
          weeklyAllocated: { chest: 8, back: 12, legs: 12 },
        }),
        makeInput(),
      );

      expect(result.messages).toContain(
        "Nie cała objętość została rozłożona w tygodniu.",
      );
      expect(result.suggestions).toContain(
        "Zmniejsz objętość lub zmień podział treningów.",
      );
    });

    it("does NOT add the clean message when there is unresolved volume", () => {
      const result = buildPlanFeedback(
        makeResult({
          status: "feasible_with_tradeoffs",
          weeklyUnresolved: { chest: 2, back: 0, legs: 0 },
          weeklyAllocated: { chest: 10, back: 12, legs: 12 },
        }),
        makeInput(),
      );

      expect(result.messages).not.toContain("Plan jest dobrze zbalansowany.");
    });
  });

  // ── 2. Low frequency ───────────────────────────────────────────────────────

  describe("Case 2 — low frequency (1 active day AND weeklyTarget ≥ 10)", () => {
    it("adds a low-frequency message for the affected target", () => {
      // chest trained only on day 0, volume = 12 ≥ 10
      const result = buildPlanFeedback(
        makeResult({
          days: [
            {
              dayIndex: 0,
              dayType: "push",
              allocations: { chest: 12, back: 0, legs: 0 },
              total: 12,
            },
            {
              dayIndex: 1,
              dayType: "pull",
              allocations: { chest: 0, back: 12, legs: 0 },
              total: 12,
            },
            {
              dayIndex: 2,
              dayType: "legs",
              allocations: { chest: 0, back: 0, legs: 12 },
              total: 12,
            },
          ],
        }),
        makeInput(),
      );

      expect(result.messages).toContain("Niska częstotliwość dla: chest");
      expect(result.suggestions).toContain(
        "Zwiększ częstotliwość tej partii mięśniowej.",
      );
    });

    it("does NOT flag low frequency when volume < 10", () => {
      const result = buildPlanFeedback(
        makeResult({
          days: [
            {
              dayIndex: 0,
              dayType: "push",
              allocations: { chest: 8 },
              total: 8,
            },
            {
              dayIndex: 1,
              dayType: "pull",
              allocations: { back: 12 },
              total: 12,
            },
            {
              dayIndex: 2,
              dayType: "legs",
              allocations: { legs: 12 },
              total: 12,
            },
          ],
        }),
        makeInput({ weeklyTargets: { chest: 8, back: 12, legs: 12 } }),
      );

      expect(result.messages).not.toContain("Niska częstotliwość dla: chest");
    });

    it("does NOT flag low frequency when volume is spread across 2+ days", () => {
      const result = buildPlanFeedback(
        makeResult({
          days: [
            {
              dayIndex: 0,
              dayType: "push",
              allocations: { chest: 6 },
              total: 6,
            },
            {
              dayIndex: 1,
              dayType: "pull",
              allocations: { chest: 6, back: 12 },
              total: 18,
            },
            {
              dayIndex: 2,
              dayType: "legs",
              allocations: { legs: 12 },
              total: 12,
            },
          ],
        }),
        makeInput(),
      );

      expect(result.messages).not.toContain("Niska częstotliwość dla: chest");
    });
  });

  // ── 3. Session overload ────────────────────────────────────────────────────

  describe("Case 3 — session overload (day.total ≥ sessionMax * 0.9)", () => {
    it("adds the overload message and suggestion for the affected day", () => {
      // sessionMax = 20, threshold = 18; day 0 total = 18
      const result = buildPlanFeedback(
        makeResult({
          status: "feasible_with_tradeoffs",
          days: [
            {
              dayIndex: 0,
              dayType: "push",
              allocations: { chest: 18 },
              total: 18,
            },
            {
              dayIndex: 1,
              dayType: "pull",
              allocations: { back: 12 },
              total: 12,
            },
            {
              dayIndex: 2,
              dayType: "legs",
              allocations: { legs: 6 },
              total: 6,
            },
          ],
          weeklyAllocated: { chest: 18, back: 12, legs: 6 },
          weeklyUnresolved: { chest: 0, back: 0, legs: 0 },
        }),
        makeInput({ weeklyTargets: { chest: 18, back: 12, legs: 6 } }),
      );

      expect(result.messages).toContain("Trening bardzo obciążony: dzień 1");
      expect(result.suggestions).toContain(
        "Zmniejsz objętość lub zwiększ liczbę dni treningowych.",
      );
    });

    it("does NOT flag a day that is just below the 90 % threshold", () => {
      // sessionMax = 20, threshold = 18; day 0 total = 17 → no flag
      const result = buildPlanFeedback(
        makeResult({
          days: [
            {
              dayIndex: 0,
              dayType: "push",
              allocations: { chest: 17 },
              total: 17,
            },
            {
              dayIndex: 1,
              dayType: "pull",
              allocations: { back: 12 },
              total: 12,
            },
            {
              dayIndex: 2,
              dayType: "legs",
              allocations: { legs: 7 },
              total: 7,
            },
          ],
          weeklyAllocated: { chest: 17, back: 12, legs: 7 },
          weeklyUnresolved: { chest: 0, back: 0, legs: 0 },
        }),
        makeInput({ weeklyTargets: { chest: 17, back: 12, legs: 7 } }),
      );

      expect(result.messages).not.toContain("Trening bardzo obciążony: dzień 1");
    });
  });

  // ── 4. Clean case ──────────────────────────────────────────────────────────

  describe("Case 4 — clean plan", () => {
    it('returns "Plan jest dobrze zbalansowany." when no issues are detected', () => {
      // Each target trained on exactly 1 day but volume < 10 → no low-freq flag
      const result = buildPlanFeedback(
        makeResult({
          weeklyAllocated: { chest: 8, back: 8, legs: 8 },
          weeklyUnresolved: { chest: 0, back: 0, legs: 0 },
          days: [
            {
              dayIndex: 0,
              dayType: "push",
              allocations: { chest: 8 },
              total: 8,
            },
            {
              dayIndex: 1,
              dayType: "pull",
              allocations: { back: 8 },
              total: 8,
            },
            {
              dayIndex: 2,
              dayType: "legs",
              allocations: { legs: 8 },
              total: 8,
            },
          ],
        }),
        makeInput({ weeklyTargets: { chest: 8, back: 8, legs: 8 } }),
      );

      expect(result.messages).toEqual(["Plan jest dobrze zbalansowany."]);
      expect(result.suggestions).toHaveLength(0);
      expect(result.status).toBe("feasible");
    });

    it("contains only the clean message — no duplicates", () => {
      // Use the same clean scenario: volume < 10 so the low-frequency rule
      // does not trigger; no unresolved, no overloaded day.
      const result = buildPlanFeedback(
        makeResult({
          weeklyAllocated: { chest: 8, back: 8, legs: 8 },
          weeklyUnresolved: { chest: 0, back: 0, legs: 0 },
          days: [
            { dayIndex: 0, dayType: "push", allocations: { chest: 8 }, total: 8 },
            { dayIndex: 1, dayType: "pull", allocations: { back: 8 }, total: 8 },
            { dayIndex: 2, dayType: "legs", allocations: { legs: 8 }, total: 8 },
          ],
        }),
        makeInput({ weeklyTargets: { chest: 8, back: 8, legs: 8 } }),
      );
      expect(
        result.messages.filter((m) => m === "Plan jest dobrze zbalansowany."),
      ).toHaveLength(1);
    });
  });

  // ── 5. Infeasible case ─────────────────────────────────────────────────────

  describe("Case 5 — infeasible plan", () => {
    it("adds the infeasible message and suggestion", () => {
      const result = buildPlanFeedback(
        makeResult({
          status: "infeasible",
          weeklyUnresolved: { chest: 12, back: 0, legs: 0 },
          weeklyAllocated: { chest: 0, back: 12, legs: 12 },
        }),
        makeInput(),
      );

      expect(result.messages).toContain(
        "Nie można poprawnie rozłożyć planu przy obecnych założeniach.",
      );
      expect(result.suggestions).toContain("Zmień split lub zmniejsz objętość.");
      expect(result.status).toBe("infeasible");
    });

    it("does NOT emit the clean message for an infeasible plan", () => {
      const result = buildPlanFeedback(
        makeResult({
          status: "infeasible",
          weeklyUnresolved: { chest: 12, back: 0, legs: 0 },
          weeklyAllocated: { chest: 0, back: 12, legs: 12 },
        }),
        makeInput(),
      );

      expect(result.messages).not.toContain("Plan jest dobrze zbalansowany.");
    });
  });
});
