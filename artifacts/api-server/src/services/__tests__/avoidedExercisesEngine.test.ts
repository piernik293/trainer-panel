/**
 * Excluded exercises are never picked by the generator — on every path of the engine:
 * normal slots, alternative sessions (thin-pool retry with relaxed cross-session exclusion),
 * beginner / no-activity contexts and safe fallbacks. Plus: the generator applies no
 * intensification methods at all, so an excluded method can never appear in a plan.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ADVANCED_METHODS } from "@workspace/survey-config";
import { runExerciseSelectionEngineV0, type V0PriorityContext, type V0SessionType } from "../ExerciseSelectionEngineV0";
import type { ScoredAndFilteredExercise } from "../planDraftDayRecommendationsService";

let id = 5000;
const mk = (name: string, group: string, type: "Złożone" | "Izolowane", pattern: string, over: Partial<ScoredAndFilteredExercise> = {}): ScoredAndFilteredExercise => ({
  id: id++, name, mainMuscleGroup: group, secondaryMuscleGroups: [], equipment: ["Hantle"], requiredEquipmentAll: [],
  trainingLocation: ["Dom", "Siłownia"], score: 60, matchReasons: [], warnReasons: [], isAvoided: false,
  exerciseType: type, movementPattern: pattern, exercisePriority: "Wysoki", learningDifficulty: 1, neurologicalFatigue: 1,
  suitableForNoActivity: true, ...over,
} as ScoredAndFilteredExercise);

const catalogue = (): ScoredAndFilteredExercise[] => [
  mk("Wyciskanie hantli płasko", "Klatka piersiowa", "Złożone", "Pchanie poziome", { exercisePriority: "Bardzo wysoki", score: 90 }),
  mk("Wyciskanie hantli na skosie", "Klatka piersiowa", "Złożone", "Pchanie poziome"),
  mk("Wiosłowanie hantlem", "Plecy", "Złożone", "Przyciąganie poziome", { exercisePriority: "Bardzo wysoki", score: 90 }),
  mk("Wiosłowanie oburącz", "Plecy", "Złożone", "Przyciąganie poziome"),
  mk("Wyciskanie nad głowę", "Barki", "Złożone", "Pchanie pionowe", { score: 85 }),
  mk("Unoszenie bokiem", "Barki", "Izolowane", "Odwodzenie"),
  mk("Uginanie hantli", "Biceps", "Izolowane", "Zgięcie łokcia"),
  mk("Prostowanie ramion", "Triceps", "Izolowane", "Wyprost łokcia"),
  mk("Przysiad z hantlami", "Mięśnie czworogłowe uda", "Złożone", "Przysiad", { exercisePriority: "Bardzo wysoki", score: 90 }),
  mk("Przysiad goblet", "Mięśnie czworogłowe uda", "Złożone", "Przysiad"),
  mk("Martwy ciąg rumuński", "Mięśnie dwugłowe uda", "Złożone", "Zawias biodrowy", { score: 85 }),
  mk("Mostek biodrowy", "Pośladki", "Złożone", "Zawias biodrowy"),
  mk("Wykroki", "Mięśnie czworogłowe uda", "Złożone", "Wykrok"),
  mk("Wspięcia na palce", "Łydki", "Izolowane", "Wspięcie na palce"),
];

const ctx = (over: Partial<V0PriorityContext> = {}): V0PriorityContext => ({
  isPriorityEligible: true, isBeginnerClient: false, isNoActivityClient: false, tierA: [], tierB: [], allowPlyometrics: false, ...over,
});
const withAvoided = (pool: ScoredAndFilteredExercise[], names: string[]) => pool.map((e) => ({ ...e, isAvoided: names.includes(e.name) }));

describe("an excluded exercise is never picked", () => {
  const BEST = ["Wyciskanie hantli płasko", "Wiosłowanie hantlem", "Przysiad z hantlami", "Wyciskanie nad głowę", "Martwy ciąg rumuński"];

  it.each(["upper", "lower", "full_body", "push", "pull", "legs"] as V0SessionType[])("%s: the best-scored exercises are excluded → none of them is chosen", (session) => {
    const pool = withAvoided(catalogue(), BEST);
    const r = runExerciseSelectionEngineV0(pool, session, new Set(), ctx());
    for (const e of r.exercises) expect(BEST, `${session}: ${e.name}`).not.toContain(e.name);
  });

  it("the same pool without exclusions does pick them (the test is not vacuous)", () => {
    const r = runExerciseSelectionEngineV0(catalogue(), "full_body", new Set(), ctx());
    expect(r.exercises.some((e) => BEST.includes(e.name))).toBe(true);
  });

  it("alternative session with relaxed cross-session exclusion (thin-pool retry path)", () => {
    const pool = withAvoided(catalogue(), BEST);
    const used = new Set<string>();
    const first = runExerciseSelectionEngineV0(pool, "upper", used, ctx());
    first.exercises.forEach((e) => used.add(String(e.id)));
    const second = runExerciseSelectionEngineV0(pool, "upper", used, ctx(), { alternativeIndex: 1, sameTypePreviousExercises: first.exercises as never });
    for (const e of [...first.exercises, ...second.exercises]) expect(BEST).not.toContain(e.name);
  });

  it.each([
    ["beginner", { isBeginnerClient: true }],
    ["no activity", { isNoActivityClient: true, isBeginnerClient: true }],
  ])("%s context", (_n, over) => {
    const pool = withAvoided(catalogue(), BEST);
    const r = runExerciseSelectionEngineV0(pool, "full_body", new Set(), ctx(over));
    for (const e of r.exercises) expect(BEST).not.toContain(e.name);
  });

  it("when everything usable is excluded the engine fails instead of falling back to an excluded exercise", () => {
    const all = catalogue().map((e) => e.name);
    const r = runExerciseSelectionEngineV0(withAvoided(catalogue(), all), "full_body", new Set(), ctx());
    expect(r.exercises).toHaveLength(0);
    expect(r.valid).toBe(false);
  });
});

describe("excluded intensification methods", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return n === "__tests__" ? [] : sources(p);
      return p.endsWith(".ts") ? [p] : [];
    });
  }
  it("the generator never applies any intensification method (so an excluded one cannot appear)", () => {
    const root = join(__dirname, "..", "..");
    const files = [...sources(join(root, "services")), ...sources(join(root, "routes"))].filter((f) => !/inviteEmail|public\.ts|surveys\.ts|clients\.ts/.test(f));
    const names = ADVANCED_METHODS.map((m) => m.split(" (")[0]!.toLowerCase());
    for (const f of files) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const n of names) expect(text.includes(n), `${f} mentions "${n}"`).toBe(false);
    }
  });
});
