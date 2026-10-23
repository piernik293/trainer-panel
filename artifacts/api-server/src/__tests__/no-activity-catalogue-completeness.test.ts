/**
 * Catalogue data check: every active exercise flagged suitableForNoActivity
 * must have a primary muscle assignment. Without one the exercise is
 * "incomplete" and the generator never selects it, silently shrinking the
 * safe pool for inactive clients (e.g. ids 259, 260 — the 4th safe
 * lower-body option the engine relies on).
 */

import { describe, it, expect, afterAll } from "vitest";
import { db, pool, exercisesTable, exerciseMuscleAssignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

afterAll(async () => {
  await pool.end();
});

describe("catalogue — safe exercises for inactive clients are usable", () => {
  it("every active suitableForNoActivity exercise has a primary muscle", async () => {
    const safe = await db
      .select({ id: exercisesTable.id, name: exercisesTable.name })
      .from(exercisesTable)
      .where(and(eq(exercisesTable.isActive, true), eq(exercisesTable.suitableForNoActivity, true)));
    expect(safe.length).toBeGreaterThan(0);

    const primaries = await db
      .select({ exerciseId: exerciseMuscleAssignmentsTable.exerciseId })
      .from(exerciseMuscleAssignmentsTable)
      .where(eq(exerciseMuscleAssignmentsTable.isPrimary, true));
    const withPrimary = new Set(primaries.map((p) => p.exerciseId));

    const missing = safe.filter((e) => !withPrimary.has(e.id)).map((e) => `${e.id} ${e.name}`);
    expect(missing, `brak mięśnia głównego: ${missing.join("; ")}`).toEqual([]);
  });
});
