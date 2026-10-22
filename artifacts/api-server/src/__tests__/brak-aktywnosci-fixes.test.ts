/**
 * Focused tests for "Brak aktywności fizycznej" exercise-library fixes.
 *
 * Tests 1–6: catalogue-level checks (run against the live DB).
 * Tests 7–9: engine-level checks (run the V0 engine with filtered pools).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  runExerciseSelectionEngineV0,
  type V0SessionType,
} from "../services/ExerciseSelectionEngineV0";
import type { ScoredAndFilteredExercise } from "../services/planDraftDayRecommendationsService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ScoredAndFilteredExercise for engine tests. */
function makeEx(
  partial: Partial<ScoredAndFilteredExercise> & { id: number; mainMuscleGroup: string },
): ScoredAndFilteredExercise {
  return {
    id: partial.id,
    name: partial.name ?? `Exercise ${partial.id}`,
    mainMuscleGroup: partial.mainMuscleGroup,
    secondaryMuscleGroups: partial.secondaryMuscleGroups ?? [],
    equipment: partial.equipment ?? ["Masa własnego ciała"],
    trainingLocation: partial.trainingLocation ?? ["Dom"],
    score: partial.score ?? 50,
    matchReasons: [],
    warnReasons: [],
    isAvoided: false,
    exerciseType: partial.exerciseType ?? null,
    // Default 1 like the real safe catalogue: null difficulty is rejected for
    // inactive/beginner clients (rule since 22.10), which would empty the pool.
    learningDifficulty: partial.learningDifficulty === undefined ? 1 : partial.learningDifficulty,
    movementPattern: partial.movementPattern ?? null,
    suitableForNoActivity: partial.suitableForNoActivity ?? null,
    exercisePriority: partial.exercisePriority ?? null,
    neurologicalFatigue: partial.neurologicalFatigue ?? null,
    movementCategoryKey: partial.movementCategoryKey ?? null,
    subTargetBiases: null,
  };
}

/** Minimal context marking client as inactive (Brak aktywności fizycznej). */
const noActivityCtx = {
  isPriorityEligible: false,
  isNoActivityClient: true,
  isBeginnerClient: false,
  tierA: [],
  tierB: [],
  benchGoalActive: false,
  allowPlyometrics: false,
  preferredExerciseKeywords: [],
  deprioritizePushUps: false,
  goalProfile: {
    isCompetitiveAthlete: false,
    preferHighNeurologicalLoad: false,
    deprioritizeIsolationInMixedSlots: false,
    exerciseClassBias: "default" as const,
  },
  undercoveredMuscleGroups: [],
  usageHistory: new Map(),
  cooldownIds: new Set<number>(),
};

/** Minimal FULL_BODY pool — push, knee-dominant, hip-dominant, calves, core. No pull. */
function makeBodyweightOnlyNoActivityPool(): ScoredAndFilteredExercise[] {
  return [
    // Push (chest compound, horizontal push)
    makeEx({ id: 1, name: "Pompki", mainMuscleGroup: "Klatka piersiowa", exerciseType: "Złożone", movementPattern: "Pchanie poziome", suitableForNoActivity: true }),
    // Knee-dominant (squat family)
    makeEx({ id: 90, name: "Przysiad do skrzyni", mainMuscleGroup: "Mięśnie czworogłowe uda", exerciseType: "Złożone", movementPattern: "Przysiad", suitableForNoActivity: true }),
    makeEx({ id: 95, name: "Przysiad wykroczny z podparciem", mainMuscleGroup: "Mięśnie czworogłowe uda", exerciseType: "Złożone", movementPattern: "Wykrok", suitableForNoActivity: true }),
    makeEx({ id: 96, name: "Wykrok w tył", mainMuscleGroup: "Mięśnie czworogłowe uda", exerciseType: "Złożone", movementPattern: "Wykrok", suitableForNoActivity: null, learningDifficulty: 2 }),
    makeEx({ id: 260, name: "Wejście na niskie podwyższenie z podparciem", mainMuscleGroup: "Mięśnie czworogłowe uda", exerciseType: "Złożone", movementPattern: "Wykrok", suitableForNoActivity: true, learningDifficulty: 2 }),
    // Hip-dominant (hinge)
    makeEx({ id: 105, name: "Glute bridge", mainMuscleGroup: "Pośladki", secondaryMuscleGroups: ["Mięśnie dwugłowe uda"], exerciseType: "Złożone", movementPattern: "Zawias biodrowy", suitableForNoActivity: true }),
    // Calves
    makeEx({ id: 259, name: "Wspięcia na palce obunóż stojąc", mainMuscleGroup: "Łydki", exerciseType: "Izolowane", movementPattern: "Wspięcie na palce", suitableForNoActivity: true, learningDifficulty: 1 }),
    makeEx({ id: 195, name: "Wspięcia na palce jednostronne stojąc", mainMuscleGroup: "Łydki", exerciseType: "Izolowane", movementPattern: "Wspięcie na palce", suitableForNoActivity: null, learningDifficulty: 1 }),
    // Core
    makeEx({ id: 50, name: "Deska", mainMuscleGroup: "Brzuch", exerciseType: "Izolowane", movementPattern: "Stabilizacja tułowia", suitableForNoActivity: true }),
  ];
}

// ─── DB-level catalogue checks ─────────────────────────────────────────────────

describe("Catalogue fixes", () => {
  it("1. id=195 no longer has the knee-extension (Wyprost kolana) movement pattern", async () => {
    const res = await db.execute(sql`
      SELECT movement_pattern FROM exercises WHERE id = 195
    `);
    const row = res.rows[0] as { movement_pattern: string };
    expect(row.movement_pattern).not.toBe("Wyprost kolana");
    expect(row.movement_pattern).toBe("Wspięcie na palce");
  });

  it("2. Bilateral calf raise (id=259) is eligible and flagged suitable_for_no_activity", async () => {
    const res = await db.execute(sql`
      SELECT id, name, suitable_for_no_activity, learning_difficulty, main_muscle_group, movement_pattern
      FROM exercises WHERE id = 259
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.suitable_for_no_activity).toBe(true);
    expect(Number(row.learning_difficulty)).toBe(1);
    expect(row.main_muscle_group).toBe("Łydki");
    expect(row.movement_pattern).toBe("Wspięcie na palce");
  });

  it("3. Low step-up (id=260) is eligible and flagged suitable_for_no_activity", async () => {
    const res = await db.execute(sql`
      SELECT id, name, suitable_for_no_activity, learning_difficulty, main_muscle_group, movement_pattern
      FROM exercises WHERE id = 260
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.suitable_for_no_activity).toBe(true);
    expect(Number(row.learning_difficulty)).toBeLessThanOrEqual(2);
    expect(row.main_muscle_group).toBe("Mięśnie czworogłowe uda");
  });

  it("5. Wykrok w tył (id=96) remains available — is still active and in the exercises table", async () => {
    const res = await db.execute(sql`
      SELECT id, name, is_active FROM exercises WHERE id = 96
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.is_active).toBe(true);
  });

  it("6. Chest-supported row (id=185) has suitable_for_no_activity=true but requires Hantle (AnyOf) AND Ławka (AllOf)", async () => {
    const res = await db.execute(sql`
      SELECT suitable_for_no_activity, equipment, required_equipment_all FROM exercises WHERE id = 185
    `);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.suitable_for_no_activity).toBe(true);
    const equipment = row.equipment as string[];
    expect(equipment).toContain("Hantle");
    // Ławka is now in required_equipment_all (AND semantics), not in equipment (OR/AnyOf)
    const requiredAll = row.required_equipment_all as string[];
    expect(requiredAll).toContain("Ławka");
  });
});

// ─── Engine-level tests ─────────────────────────────────────────────────────────

describe("Engine: inactive-client selection rules", () => {
  it("4. Wykrok w tył (id=96) is NOT selected for inactive clients through the slot 4b fallback", () => {
    // Pool: bodyweight-only, no pull — hip-dominant exhausted so slot 4b fires.
    // Pool includes both id=260 (suitableForNoActivity=true) and id=96 (null) in knee-dominant.
    // After slot 3 picks id=90 and slot 4 picks id=105, slot 4b should pick id=260 or id=95,
    // NEVER id=96 for an inactive client.
    const pool = makeBodyweightOnlyNoActivityPool();
    const used = new Set<string>(["90", "105"]); // pre-consume slot 3 and slot 4 choices

    const result = runExerciseSelectionEngineV0(pool, "full_body", used, noActivityCtx);
    const ids = result.exercises.map((e) => e.id);
    expect(ids).not.toContain(96);
  });

  it("7. Bodyweight-only inactive FULL_BODY reports missing-pull warning when no pull exercise exists", () => {
    const pool = makeBodyweightOnlyNoActivityPool(); // no pull (no Plecy compound)
    const result = runExerciseSelectionEngineV0(pool, "full_body", new Set(), noActivityCtx);

    // Draft remains visible (valid=true or enough exercises to pass the guard)
    // but warnings are present
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
    // The thin fixture pool may also emit slot-skip warnings; the pull warning must be among them.
    expect(result.warnings!.some((w) => w.includes("gumę oporową"))).toBe(true);
  });

  it("8. The pull warning does NOT cause equipment restrictions to be bypassed — no Plecy exercise appears", () => {
    const pool = makeBodyweightOnlyNoActivityPool(); // no pull at all
    const result = runExerciseSelectionEngineV0(pool, "full_body", new Set(), noActivityCtx);

    // No back (Plecy) exercise should appear in the output
    const backExercises = result.exercises.filter((e) => e.mainMuscleGroup === "Plecy");
    expect(backExercises).toHaveLength(0);
  });

  it("9. With a band row in the pool, the pull slot is filled and no pull warning is emitted", () => {
    const pool = makeBodyweightOnlyNoActivityPool();
    // Add a band row (horizontal pull, Plecy)
    pool.push(
      makeEx({
        id: 200,
        name: "Wiosłowanie z gumą oporową",
        mainMuscleGroup: "Plecy",
        exerciseType: "Złożone",
        movementPattern: "Przyciąganie poziome",
        equipment: ["Guma oporowa"],
        suitableForNoActivity: true,
      }),
    );

    const result = runExerciseSelectionEngineV0(pool, "full_body", new Set(), noActivityCtx);

    // Pull slot filled — no pull warning (slot-skip warnings from the thin
    // fixture pool are unrelated).
    expect((result.warnings ?? []).some((w) => w.includes("przyciągającego"))).toBe(false);
    // The band row appears in output
    const pullEx = result.exercises.find((e) => e.id === 200);
    expect(pullEx).toBeDefined();
  });
});
