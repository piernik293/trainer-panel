/**
 * Idempotent seed: map previously unmapped specific muscles to volume targets.
 *
 * Runs on every server startup — safe to repeat (checks for existing rows).
 *
 * Mappings added:
 *
 *   5  Mięśnie równoległoboczne (Rhomboids)
 *      → 23 Mięsień czworoboczny grzbietu (Traps / upper back)
 *      Rhomboids and trapezius both perform scapular retraction; grouped in
 *      the upper-back volume target.
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
 * Intentionally NOT mapped (no correct existing target):
 *
 *   7  Prostowniki grzbietu (Erector spinae)
 *      Mapping to the trapezius target would incorrectly inflate the upper-back
 *      ceiling (deadlifts, Bird dog, etc. carry sm7 at high coefficients).
 *      Leave unmapped until a dedicated Lower Back target exists.
 *
 *   15 Zginacze nadgarstka i palców (Wrist / finger flexors)
 *      Mapping to the biceps target would cause shrugs (sm15 coeff 0.3) to
 *      consume the biceps ceiling, and wrist curls (coeff 1.0) would be
 *      catastrophic.  Leave unmapped until a dedicated Forearm target exists.
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
  { muscleName: "Mięśnie równoległoboczne",  targetName: "Mięsień czworoboczny grzbietu" },
  { muscleName: "Mięśnie stożka rotatorów",  targetName: "Mięśnie naramienne" },
  { muscleName: "Mięsień ramienny",           targetName: "Mięsień dwugłowy ramienia" },
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
