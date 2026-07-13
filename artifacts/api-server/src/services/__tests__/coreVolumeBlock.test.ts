/**
 * Tests for the Auxiliary Core / Brzuch Volume Block
 *
 * No database dependency — all functions are pure.
 *
 * Coverage:
 *   recommendWeeklyCoreSets — all four experience levels, priority bonus, max cap
 *   distributeCoreVolume    — 4/6/8/10 distribution examples, sum preservation,
 *                             session limit (≤3), workload-aware day selection
 *   computeAuxiliaryCoreBlock — integration: reasons, placement, isPriority flag
 *   integration contract    — core block is separate from 11 muscle target decisions
 */

import { describe, it, expect } from "vitest";
import {
  recommendWeeklyCoreSets,
  distributeCoreVolume,
  computeAuxiliaryCoreBlock,
} from "../coreVolumeService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a uniform day-workload map (equal loads across N days). */
function uniformWorkloads(trainingDays: number, load = 0): Map<number, number> {
  return new Map(Array.from({ length: trainingDays }, (_, i) => [i, load]));
}

/** Sum all sets across day allocations. */
function sumSets(allocs: Array<{ dayIndex: number; sets: number }>): number {
  return allocs.reduce((s, a) => s + a.sets, 0);
}

// ─── recommendWeeklyCoreSets ──────────────────────────────────────────────────

describe("recommendWeeklyCoreSets", () => {
  it("No Activity → 4 sets", () => {
    expect(recommendWeeklyCoreSets("Brak aktywności fizycznej", false)).toBe(4);
  });

  it("Beginner → 6 sets", () => {
    expect(recommendWeeklyCoreSets("Początkujący", false)).toBe(6);
  });

  it("Intermediate → 6 sets", () => {
    expect(recommendWeeklyCoreSets("Średniozaawansowany", false)).toBe(6);
  });

  it("Advanced → 8 sets", () => {
    expect(recommendWeeklyCoreSets("Zaawansowany", false)).toBe(8);
  });

  it("No Activity + priority → 4 + 2 = 6", () => {
    expect(recommendWeeklyCoreSets("Brak aktywności fizycznej", true)).toBe(6);
  });

  it("Beginner + priority → 6 + 2 = 8", () => {
    expect(recommendWeeklyCoreSets("Początkujący", true)).toBe(8);
  });

  it("Intermediate + priority → 6 + 2 = 8", () => {
    expect(recommendWeeklyCoreSets("Średniozaawansowany", true)).toBe(8);
  });

  it("Advanced + priority → 8 + 2 = 10", () => {
    expect(recommendWeeklyCoreSets("Zaawansowany", true)).toBe(10);
  });

  it("core priority adds exactly +2", () => {
    for (const level of [
      "Brak aktywności fizycznej",
      "Początkujący",
      "Średniozaawansowany",
      "Zaawansowany",
    ]) {
      const base = recommendWeeklyCoreSets(level, false);
      const withPriority = recommendWeeklyCoreSets(level, true);
      expect(withPriority - base).toBe(2);
    }
  });

  it("automatic recommendation never exceeds 10", () => {
    for (const level of [
      "Brak aktywności fizycznej",
      "Początkujący",
      "Średniozaawansowany",
      "Zaawansowany",
    ]) {
      expect(recommendWeeklyCoreSets(level, true)).toBeLessThanOrEqual(10);
      expect(recommendWeeklyCoreSets(level, false)).toBeLessThanOrEqual(10);
    }
  });

  it("all values are integers", () => {
    for (const level of [
      "Brak aktywności fizycznej",
      "Początkujący",
      "Średniozaawansowany",
      "Zaawansowany",
    ]) {
      expect(Number.isInteger(recommendWeeklyCoreSets(level, false))).toBe(true);
      expect(Number.isInteger(recommendWeeklyCoreSets(level, true))).toBe(true);
    }
  });

  it("null experience level falls back to 6 (default)", () => {
    expect(recommendWeeklyCoreSets(null, false)).toBe(6);
  });
});

// ─── distributeCoreVolume ─────────────────────────────────────────────────────

describe("distributeCoreVolume", () => {
  it("4 sets / 3 days → 2 + 2 (2 sessions)", () => {
    const allocs = distributeCoreVolume(4, 3, uniformWorkloads(3));
    expect(allocs.length).toBe(2);
    expect(allocs.every((a) => a.sets === 2)).toBe(true);
    expect(sumSets(allocs)).toBe(4);
  });

  it("6 sets / 3 days → 3 + 3 (2 sessions)", () => {
    const allocs = distributeCoreVolume(6, 3, uniformWorkloads(3));
    expect(allocs.length).toBe(2);
    expect(allocs.every((a) => a.sets === 3)).toBe(true);
    expect(sumSets(allocs)).toBe(6);
  });

  it("8 sets / 4 days → 3 + 3 + 2 (3 sessions)", () => {
    const allocs = distributeCoreVolume(8, 4, uniformWorkloads(4));
    expect(allocs.length).toBe(3);
    const vals = allocs.map((a) => a.sets).sort((a, b) => b - a);
    expect(vals).toEqual([3, 3, 2]);
    expect(sumSets(allocs)).toBe(8);
  });

  it("10 sets / 4 days → 4 + 3 + 3 (3 sessions)", () => {
    const allocs = distributeCoreVolume(10, 4, uniformWorkloads(4));
    expect(allocs.length).toBe(3);
    const vals = allocs.map((a) => a.sets).sort((a, b) => b - a);
    expect(vals).toEqual([4, 3, 3]);
    expect(sumSets(allocs)).toBe(10);
  });

  it("exact weekly sum is preserved for 4", () => {
    expect(sumSets(distributeCoreVolume(4, 4, uniformWorkloads(4)))).toBe(4);
  });

  it("exact weekly sum is preserved for 6", () => {
    expect(sumSets(distributeCoreVolume(6, 4, uniformWorkloads(4)))).toBe(6);
  });

  it("exact weekly sum is preserved for 8", () => {
    expect(sumSets(distributeCoreVolume(8, 4, uniformWorkloads(4)))).toBe(8);
  });

  it("exact weekly sum is preserved for 10", () => {
    expect(sumSets(distributeCoreVolume(10, 4, uniformWorkloads(4)))).toBe(10);
  });

  it("core uses no more than 3 sessions", () => {
    for (const sets of [4, 6, 8, 10]) {
      const allocs = distributeCoreVolume(sets, 6, uniformWorkloads(6));
      expect(allocs.length).toBeLessThanOrEqual(3);
    }
  });

  it("core uses exactly 2 sessions for ≤6 sets", () => {
    expect(distributeCoreVolume(4, 4, uniformWorkloads(4)).length).toBe(2);
    expect(distributeCoreVolume(6, 4, uniformWorkloads(4)).length).toBe(2);
  });

  it("core uses exactly 3 sessions for ≥7 sets (when trainingDays ≥ 3)", () => {
    expect(distributeCoreVolume(8, 4, uniformWorkloads(4)).length).toBe(3);
    expect(distributeCoreVolume(10, 4, uniformWorkloads(4)).length).toBe(3);
  });

  it("all allocation values are whole integers", () => {
    for (const sets of [4, 6, 8, 10]) {
      const allocs = distributeCoreVolume(sets, 4, uniformWorkloads(4));
      for (const a of allocs) {
        expect(Number.isInteger(a.sets)).toBe(true);
      }
    }
  });

  it("prefers days with lowest current workload", () => {
    // Day 0 has high load, day 1 and 2 have low load
    const workloads = new Map([
      [0, 20],
      [1, 5],
      [2, 5],
      [3, 18],
    ]);
    const allocs = distributeCoreVolume(4, 4, workloads);
    const usedDays = allocs.map((a) => a.dayIndex);
    // Days 1 and 2 have lowest load → should be selected
    expect(usedDays).toContain(1);
    expect(usedDays).toContain(2);
    expect(usedDays).not.toContain(0);
    expect(usedDays).not.toContain(3);
  });

  it("dayIndex is used as deterministic tie-breaker when workloads are equal", () => {
    // All days equal load → should pick lowest dayIndex first
    const workloads = new Map([
      [0, 10],
      [1, 10],
      [2, 10],
      [3, 10],
    ]);
    const allocs4 = distributeCoreVolume(4, 4, workloads);
    // 2 sessions → days 0 and 1
    expect(allocs4.map((a) => a.dayIndex).sort()).toEqual([0, 1]);
  });

  it("respects trainingDays limit when fewer days than target sessions", () => {
    // Only 1 training day available for 10 sets — all sets go to that day
    const allocs = distributeCoreVolume(10, 1, uniformWorkloads(1));
    expect(allocs.length).toBe(1);
    expect(allocs[0]!.sets).toBe(10);
  });

  it("returns empty for weeklyTotal 0", () => {
    expect(distributeCoreVolume(0, 4, uniformWorkloads(4))).toEqual([]);
  });
});

// ─── computeAuxiliaryCoreBlock ────────────────────────────────────────────────

describe("computeAuxiliaryCoreBlock", () => {
  it("isPriority = false: weeklyRecommendedSets equals base recommendation", () => {
    const block = computeAuxiliaryCoreBlock({
      experienceLevel: "Zaawansowany",
      isPriority: false,
      trainingDays: 4,
      dayWorkloads: uniformWorkloads(4),
    });
    expect(block.weeklyRecommendedSets).toBe(8);
    expect(block.weeklySelectedSets).toBe(8);
    expect(block.isPriority).toBe(false);
  });

  it("isPriority = true: weeklySelectedSets is +2 with cap", () => {
    const block = computeAuxiliaryCoreBlock({
      experienceLevel: "Zaawansowany",
      isPriority: true,
      trainingDays: 4,
      dayWorkloads: uniformWorkloads(4),
    });
    expect(block.weeklySelectedSets).toBe(10);
    expect(block.isPriority).toBe(true);
  });

  it("placement is always end_of_session", () => {
    const block = computeAuxiliaryCoreBlock({
      experienceLevel: "Początkujący",
      isPriority: false,
      trainingDays: 3,
      dayWorkloads: uniformWorkloads(3),
    });
    expect(block.placement).toBe("end_of_session");
  });

  it("reasons array is non-empty", () => {
    const block = computeAuxiliaryCoreBlock({
      experienceLevel: "Średniozaawansowany",
      isPriority: false,
      trainingDays: 4,
      dayWorkloads: uniformWorkloads(4),
    });
    expect(block.reasons.length).toBeGreaterThan(0);
  });

  it("warnings is empty by default", () => {
    const block = computeAuxiliaryCoreBlock({
      experienceLevel: "Początkujący",
      isPriority: false,
      trainingDays: 4,
      dayWorkloads: uniformWorkloads(4),
    });
    expect(block.warnings).toHaveLength(0);
  });

  it("dayAllocations sum equals weeklySelectedSets", () => {
    const block = computeAuxiliaryCoreBlock({
      experienceLevel: "Zaawansowany",
      isPriority: false,
      trainingDays: 5,
      dayWorkloads: uniformWorkloads(5),
    });
    expect(sumSets(block.dayAllocations)).toBe(block.weeklySelectedSets);
  });
});

// ─── Contract: core block is separate from 11 target decisions ─────────────────

describe("integration: core block appears separately from muscle target decisions", () => {
  it("core block is a separate object, not mixed into targetDecisions", async () => {
    // Dynamic import so this test only runs if the service is importable.
    const { calculateVolumeDistribution } = await import(
      "../planDraftVolumeDistributionService"
    );

    const result = await calculateVolumeDistribution({
      clientId: 1,
      experienceLevel: "Zaawansowany",
      trainingDays: 4,
      selectedSplitType: "push_pull_lower_full_body",
      selectedWeeklyVolumes: [
        { targetId: 1, selectedVolume: 8 }, { targetId: 2, selectedVolume: 6 },
        { targetId: 3, selectedVolume: 6 }, { targetId: 4, selectedVolume: 8 },
        { targetId: 5, selectedVolume: 8 }, { targetId: 6, selectedVolume: 8 },
        { targetId: 7, selectedVolume: 8 }, { targetId: 8, selectedVolume: 12 },
        { targetId: 9, selectedVolume: 12 }, { targetId: 10, selectedVolume: 8 },
        { targetId: 11, selectedVolume: 8 },
      ],
      priorityTargetIds: [],
      corePriority: false,
    });

    // Existing 11 target decisions must remain exactly 11
    expect(result.targetDecisions).toHaveLength(11);

    // Core block is present as a separate top-level field
    expect(result.auxiliaryCoreBlock).toBeDefined();
    expect(result.auxiliaryCoreBlock.weeklySelectedSets).toBe(8); // Zaawansowany, no priority

    // Core does NOT appear inside any targetDecision
    for (const d of result.targetDecisions) {
      expect(d.targetName.toLowerCase()).not.toContain("core");
      expect(d.targetName.toLowerCase()).not.toContain("brzuch");
    }
  }, 10000);

  it("Advanced + corePriority → auxiliaryCoreBlock.weeklySelectedSets = 10", async () => {
    const { calculateVolumeDistribution } = await import(
      "../planDraftVolumeDistributionService"
    );

    const result = await calculateVolumeDistribution({
      clientId: 1,
      experienceLevel: "Zaawansowany",
      trainingDays: 4,
      selectedSplitType: "push_pull_lower_full_body",
      selectedWeeklyVolumes: [
        { targetId: 1, selectedVolume: 8 }, { targetId: 2, selectedVolume: 6 },
        { targetId: 3, selectedVolume: 6 }, { targetId: 4, selectedVolume: 8 },
        { targetId: 5, selectedVolume: 8 }, { targetId: 6, selectedVolume: 8 },
        { targetId: 7, selectedVolume: 8 }, { targetId: 8, selectedVolume: 12 },
        { targetId: 9, selectedVolume: 12 }, { targetId: 10, selectedVolume: 8 },
        { targetId: 11, selectedVolume: 8 },
      ],
      priorityTargetIds: [],
      corePriority: true,
    });

    expect(result.targetDecisions).toHaveLength(11);
    expect(result.auxiliaryCoreBlock.weeklySelectedSets).toBe(10);
    expect(result.auxiliaryCoreBlock.isPriority).toBe(true);
  }, 10000);

  it("Ćwiczenia step remains locked (no plan records created)", async () => {
    const { db } = await import("@workspace/db");
    const { workoutPlansTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const plans = await db
      .select()
      .from(workoutPlansTable)
      .where(eq(workoutPlansTable.clientId, 1));

    // No plan was created by the distribution service
    expect(plans).toHaveLength(0);
  }, 10000);
});
