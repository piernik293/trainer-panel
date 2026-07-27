/**
 * Idempotent seed: map previously unmapped specific muscles to volume targets.
 *
 * Runs on every server startup via ON CONFLICT DO NOTHING — safe to repeat.
 *
 * Mappings added:
 *
 *   5  Mięśnie równoległoboczne (Rhomboids)
 *      → 23 Mięsień czworoboczny grzbietu (Traps / upper back)
 *      Rhomboids and trapezius both perform scapular retraction; grouped in
 *      the upper-back volume target.
 *
 *   7  Prostowniki grzbietu (Erector spinae)
 *      → 23 Mięsień czworoboczny grzbietu (Traps / upper back)
 *      No erector-specific volume target exists in the schema.  Erectors are
 *      "back" muscles; the upper-back target is the least-wrong existing slot.
 *
 *   11 Mięśnie stożka rotatorów (Rotator cuff)
 *      → 19 Mięśnie naramienne (Deltoids)
 *      Rotator cuff is trained alongside deltoids in shoulder work and is
 *      commonly counted within shoulder volume.
 *
 *   13 Mięsień ramienny (Brachialis)
 *      → 24 Mięsień dwugłowy ramienia (Biceps)
 *      Brachialis is an elbow-flexion synergist consistently trained with
 *      biceps; counted in the bicep volume target.
 *
 *   15 Zginacze nadgarstka i palców (Wrist / finger flexors)
 *      → 24 Mięsień dwugłowy ramienia (Biceps)
 *      Most exercises assigning this muscle are curl variations.  NOTE: a few
 *      shrug exercises also carry this muscle (coeff ≈ 0.3); their bicep
 *      contribution is small, but this mapping is a known approximation.
 */

import { and, eq } from "drizzle-orm";
import {
  db,
  specificMusclesTable,
  volumeTargetsTable,
  volumeTargetMembersTable,
} from "@workspace/db";

interface Mapping {
  muscleName: string;
  targetName: string;
}

const MAPPINGS: Mapping[] = [
  { muscleName: "Mięśnie równoległoboczne", targetName: "Mięsień czworoboczny grzbietu" },
  { muscleName: "Prostowniki grzbietu",      targetName: "Mięsień czworoboczny grzbietu" },
  { muscleName: "Mięśnie stożka rotatorów",  targetName: "Mięśnie naramienne" },
  { muscleName: "Mięsień ramienny",           targetName: "Mięsień dwugłowy ramienia" },
  { muscleName: "Zginacze nadgarstka i palców", targetName: "Mięsień dwugłowy ramienia" },
];

export async function seedUnmappedMuscleVtm(): Promise<void> {
  for (const { muscleName, targetName } of MAPPINGS) {
    // Resolve IDs by name so this is DB-state agnostic (dev vs prod IDs may differ).
    const [muscle] = await db
      .select({ id: specificMusclesTable.id })
      .from(specificMusclesTable)
      .where(eq(specificMusclesTable.name, muscleName));

    const [target] = await db
      .select({ id: volumeTargetsTable.id })
      .from(volumeTargetsTable)
      .where(eq(volumeTargetsTable.name, targetName));

    if (!muscle || !target) {
      console.warn(
        `[VtmSeed] Skipping "${muscleName}" → "${targetName}": ` +
          `muscle found=${!!muscle} target found=${!!target}`,
      );
      continue;
    }

    // Check for existing entry before inserting to avoid ON CONFLICT failures
    // with tables that may not have a unique constraint.
    const [existing] = await db
      .select({ id: volumeTargetMembersTable.id })
      .from(volumeTargetMembersTable)
      .where(
        and(
          eq(volumeTargetMembersTable.specificMuscleId, muscle.id),
          eq(volumeTargetMembersTable.volumeTargetId, target.id),
        ),
      );

    if (existing) continue; // already mapped

    await db.insert(volumeTargetMembersTable).values({
      specificMuscleId: muscle.id,
      volumeTargetId:   target.id,
    });

    console.log(
      `[VtmSeed] Mapped "${muscleName}" (id=${muscle.id}) → "${targetName}" (id=${target.id})`,
    );
  }
}
