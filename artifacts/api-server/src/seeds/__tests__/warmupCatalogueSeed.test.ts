/** Warm-up catalogue seed (real test database): idempotent, #10 without a duplicate, fields as approved, kept out of main plan pools. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, exercisesTable } from "@workspace/db";
import { seedWarmupCatalogue } from "../warmupCatalogueSeed";
import { WARMUP_CATALOGUE } from "../warmupCatalogueData";
import { isMainPlanExercise, mainPlanRoleCondition, WARMUP_ROLES } from "../../lib/exerciseRoles";

const BAND = "rozciaganie-gumy-przed-klatka-band-pull-apart";
beforeAll(async () => {
  // the existing Band Pull-Apart row (#10) is part of the main catalogue seed — make sure it exists in an empty test DB
  const [b] = await db.select({ id: exercisesTable.id }).from(exercisesTable).where(eq(exercisesTable.slug, BAND));
  if (!b) await db.insert(exercisesTable).values({ name: "Rozciąganie gumy przed klatką (Band Pull-Apart)", slug: BAND, mainMuscleGroup: "Barki", equipment: ["Gumy oporowe"], exerciseType: "Izolowane" });
  await seedWarmupCatalogue();
});
afterAll(async () => { await pool.end(); });

describe("warm-up catalogue seed", () => {
  it("27 new exercises + the existing #10 updated; idempotent", async () => {
    const first = await seedWarmupCatalogue();
    expect(first.inserted).toBe(0); // already seeded in beforeAll
    expect(first.updated).toBe(28);
    const slugs = WARMUP_CATALOGUE.map((e) => e.slug);
    const rows = await db.select().from(exercisesTable).where(inArray(exercisesTable.slug, slugs));
    expect(rows.length).toBe(27 + 0 + (slugs.includes(BAND) ? 1 : 0)); // #10 keeps its own slug (checked below)
    const dup = await db.select().from(exercisesTable).where(eq(exercisesTable.slug, BAND));
    expect(dup).toHaveLength(1); // no duplicate of the existing exercise
    expect(dup[0]!.role).toBe("rozgrzewka");
    expect(dup[0]!.defaultReps).toBe(15);
  });

  it("roles, amounts and joint tags as approved", async () => {
    const rows = await db.select().from(exercisesTable).where(inArray(exercisesTable.slug, WARMUP_CATALOGUE.filter((e) => !e.existingSlug).map((e) => e.slug)));
    const by = new Map(rows.map((r) => [r.slug, r]));
    const get = (nr: number) => by.get(WARMUP_CATALOGUE.find((e) => e.nr === nr)!.slug)!;
    expect(get(1).role).toBe("rozgrzewka");
    expect(get(16).role).toBe("rozciąganie");
    expect(get(28)).toMatchObject({ name: "Wymachy nóg (w przód i w bok)", role: "rozgrzewka", mainMuscleGroup: "Mięśnie dwugłowe uda", defaultReps: 10, perSide: true, suitableForNoActivity: true, learningDifficulty: 1 });
    for (const nr of [7, 8, 20, 27]) expect(get(nr).jointStressAreas).toContain("Kolano");
    for (const nr of [2, 12]) expect(get(nr).jointStressAreas).toContain("Bark");
    expect(get(12).jointStressAreas).toContain("Nadgarstek");
    for (const nr of [4, 26]) expect(get(nr).jointStressAreas).toContain("Plecy — dół");
    expect(get(13)).toMatchObject({ defaultDurationSeconds: 20, perSide: false });
    expect(get(15).equipmentDetail).toEqual(["Rower stacjonarny"]);
    for (const r of rows) {
      expect(r.executionInstructions, r.name).toBeTruthy();
      expect(r.jointStress).toBe("Niskie");
      expect(r.requiresSpotter).toBe(false);
    }
    expect(get(8).verificationStatus).toBe("do_weryfikacji"); // not confirmed for inactive clients
    expect(get(1).verificationStatus).toBe("zweryfikowane");
  });

  it("the main plan pools never contain warm-up or stretching exercises", async () => {
    const pool = await db.select().from(exercisesTable).where(and(eq(exercisesTable.isActive, true), mainPlanRoleCondition()));
    expect(pool.some((e) => (WARMUP_ROLES as readonly string[]).includes(e.role ?? ""))).toBe(false);
    expect(pool.every(isMainPlanExercise)).toBe(true);
    const all = await db.select().from(exercisesTable).where(eq(exercisesTable.isActive, true));
    expect(all.length).toBeGreaterThan(pool.length); // the warm-up rows exist, they are just filtered out
  });

  it("isMainPlanExercise", () => {
    expect(isMainPlanExercise({ role: null })).toBe(true);
    expect(isMainPlanExercise({ role: "główne" })).toBe(true);
    expect(isMainPlanExercise({ role: "pomocnicze" })).toBe(true);
    expect(isMainPlanExercise({ role: "rozgrzewka" })).toBe(false);
    expect(isMainPlanExercise({ role: "rozciąganie" })).toBe(false);
  });
});
