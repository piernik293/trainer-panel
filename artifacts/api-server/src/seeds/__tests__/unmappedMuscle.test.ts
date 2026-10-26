/**
 * Unmapped-muscle guard — integration test.
 *
 * Ensures that every specific muscle appearing in exercise_muscle_assignments
 * with a coefficient above the significance threshold is either:
 *   (a) mapped to at least one entry in volume_target_members, or
 *   (b) listed in INTENTIONALLY_EXCLUDED_MUSCLES with a documented reason.
 *
 * When a new exercise is added that uses a muscle not yet covered by any
 * volume target, this test will fail loudly — preventing a silent miss where
 * volume calculations under-count without any warning.
 *
 * To fix a failure:
 *   Option A — Add a volume_target_members row mapping the muscle to a target.
 *              This is the preferred path when a suitable target exists.
 *   Option B — Add the muscle to INTENTIONALLY_EXCLUDED_MUSCLES in
 *              artifacts/api-server/src/seeds/unmappedMuscleVtm.ts with a
 *              documented reason and a futureTarget description.
 */

import { describe, it, expect } from "vitest";
import { db, specificMusclesTable, exerciseMuscleAssignmentsTable, volumeTargetMembersTable } from "@workspace/db";
import { gt } from "drizzle-orm";
import {
  INTENTIONALLY_EXCLUDED_MUSCLE_ID_SET,
  INTENTIONALLY_EXCLUDED_MUSCLES,
  UNMAPPED_MUSCLE_GUARD_THRESHOLD,
} from "../unmappedMuscleVtm";

describe("Unmapped-muscle guard", () => {
  it("every high-coefficient muscle is mapped or intentionally excluded", async () => {
    // 1. All distinct muscle IDs that appear in exercise_muscle_assignments
    //    with a coefficient strictly above the threshold.
    const highCoeffRows = await db
      .selectDistinct({ specificMuscleId: exerciseMuscleAssignmentsTable.specificMuscleId })
      .from(exerciseMuscleAssignmentsTable)
      .where(gt(exerciseMuscleAssignmentsTable.coefficient, UNMAPPED_MUSCLE_GUARD_THRESHOLD));

    const highCoeffMuscleIds = new Set(highCoeffRows.map((r) => r.specificMuscleId));

    // 2. All distinct muscle IDs that have at least one entry in volume_target_members.
    const mappedRows = await db
      .selectDistinct({ specificMuscleId: volumeTargetMembersTable.specificMuscleId })
      .from(volumeTargetMembersTable);

    const mappedMuscleIds = new Set(mappedRows.map((r) => r.specificMuscleId));

    // Entries with dbName are also matched by name (ids of muscles added later can differ between databases).
    const allMuscles = await db.select({ id: specificMusclesTable.id, name: specificMusclesTable.name }).from(specificMusclesTable);
    const excludedIds = new Set<number>(INTENTIONALLY_EXCLUDED_MUSCLE_ID_SET);
    for (const e of INTENTIONALLY_EXCLUDED_MUSCLES) {
      if (e.dbName) for (const m of allMuscles) if (m.name === e.dbName) excludedIds.add(m.id);
    }

    // 3. Determine which high-coefficient muscles are neither mapped nor excluded.
    const unmappedAndUnexplained: number[] = [];
    for (const muscleId of highCoeffMuscleIds) {
      if (!mappedMuscleIds.has(muscleId) && !excludedIds.has(muscleId)) {
        unmappedAndUnexplained.push(muscleId);
      }
    }

    // 4. Fetch names for a human-readable failure message.
    if (unmappedAndUnexplained.length > 0) {
      const nameRows = await db
        .select({ id: specificMusclesTable.id, name: specificMusclesTable.name })
        .from(specificMusclesTable);

      const nameById = new Map(nameRows.map((r) => [r.id, r.name]));

      const details = unmappedAndUnexplained
        .map((id) => `  • id=${id} "${nameById.get(id) ?? "unknown"}"`)
        .join("\n");

      throw new Error(
        `${unmappedAndUnexplained.length} specific muscle(s) appear in exercise_muscle_assignments ` +
        `with coefficient > ${UNMAPPED_MUSCLE_GUARD_THRESHOLD} but have no entry in ` +
        `volume_target_members and are not listed in INTENTIONALLY_EXCLUDED_MUSCLES:\n` +
        `${details}\n\n` +
        `Fix: either add a volume_target_members row for the muscle, or add it to ` +
        `INTENTIONALLY_EXCLUDED_MUSCLES in src/seeds/unmappedMuscleVtm.ts with a documented reason.`,
      );
    }

    // Explicit assertion so vitest always shows a pass, not a silent vacuous pass.
    expect(unmappedAndUnexplained).toHaveLength(0);
  });

  it("INTENTIONALLY_EXCLUDED_MUSCLES has documented reason and futureTarget for every entry", () => {
    for (const entry of INTENTIONALLY_EXCLUDED_MUSCLES) {
      expect(
        entry.reason.trim().length,
        `Entry for muscle id=${entry.muscleId} (${entry.muscleName}) is missing a reason`,
      ).toBeGreaterThan(0);

      expect(
        entry.futureTarget.trim().length,
        `Entry for muscle id=${entry.muscleId} (${entry.muscleName}) is missing a futureTarget`,
      ).toBeGreaterThan(0);
    }
  });

  it("every INTENTIONALLY_EXCLUDED_MUSCLES entry references an existing specific_muscle id", async () => {
    if (INTENTIONALLY_EXCLUDED_MUSCLES.length === 0) return;

    const nameRows = await db
      .select({ id: specificMusclesTable.id, name: specificMusclesTable.name })
      .from(specificMusclesTable);

    const existingIds = new Set(nameRows.map((r) => r.id));
    for (const e of INTENTIONALLY_EXCLUDED_MUSCLES) {
      if (e.dbName && nameRows.some((r) => r.name === e.dbName)) existingIds.add(e.muscleId);
    }

    for (const entry of INTENTIONALLY_EXCLUDED_MUSCLES) {
      expect(
        existingIds.has(entry.muscleId),
        `INTENTIONALLY_EXCLUDED_MUSCLES references muscle id=${entry.muscleId} ` +
        `(${entry.muscleName}) which does not exist in specific_muscles`,
      ).toBe(true);
    }
  });
});
