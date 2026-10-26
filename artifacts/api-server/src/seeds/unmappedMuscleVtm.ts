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

// ─── Intentional exclusion allowlist ─────────────────────────────────────────
//
// Specific muscles that appear in exercise_muscle_assignments with a high
// coefficient but are deliberately NOT mapped to any volume_target_members row.
// Any muscle that is both high-coefficient AND absent from volume_target_members
// AND absent from this list will cause the unmapped-muscle guard test to fail.
//
// Before adding a muscle here, document why no existing target is appropriate
// and what future target would eventually receive it.

export interface IntentionalExclusion {
  /** Primary key from the specific_muscles table (stable across environments). */
  muscleId: number;
  /** Human-readable name for diagnostics. */
  muscleName: string;
  /**
   * Exact specific_muscles.name. Entries added after the first 28 muscles (migration 0034) are matched by name as well as by id,
   * because their ids are assigned by the sequence and can differ between databases (the test database has an extra row).
   */
  dbName?: string;
  /** Why no current volume target is suitable. */
  reason: string;
  /** Which target should eventually receive this muscle once created. */
  futureTarget: string;
}

export const INTENTIONALLY_EXCLUDED_MUSCLES: IntentionalExclusion[] = [
  {
    muscleId: 7,
    muscleName: "Prostowniki grzbietu (Erector spinae)",
    reason:
      "Mapping to the trapezius target would incorrectly inflate the upper-back " +
      "ceiling (deadlifts, Bird dog, etc. carry sm7 at high coefficients).",
    futureTarget: "Dedicated 'Dolna część pleców' (Lower Back) target",
  },
  {
    muscleId: 15,
    muscleName: "Zginacze nadgarstka i palców (Wrist / finger flexors)",
    reason:
      "Mapping to the biceps target would cause shrugs (sm15 coeff 0.3) to " +
      "consume the biceps ceiling, and wrist curls (coeff 1.0) would be catastrophic.",
    futureTarget: "Dedicated 'Przedramiona' (Forearm) target",
  },
  {
    muscleId: 16,
    muscleName: "Prostowniki nadgarstka i palców (Wrist / finger extensors)",
    reason:
      "Extensor counterpart to sm15 (flexors). No existing target can absorb wrist-extension " +
      "volume without distorting the biceps or triceps ceilings. Exercises like wrist " +
      "extensions and reverse curls carry sm16 at high coefficients.",
    futureTarget: "Dedicated 'Przedramiona' (Forearm) target (same as sm15)",
  },
  {
    muscleId: 29,
    dbName: "Mięsień piszczelowy przedni",
    muscleName: "Mięsień piszczelowy przedni (Tibialis anterior)",
    reason:
      "Front of the shin: not a calf muscle, so it must not count toward the calf (triceps surae) target. " +
      "Only the tibialis raise carries it as the primary muscle.",
    futureTarget: "Dedicated 'Przód podudzia' (Shin) target",
  },
  {
    muscleId: 30,
    dbName: "Mięsień zębaty przedni",
    muscleName: "Mięsień zębaty przedni (Serratus anterior)",
    reason:
      "Scapular protraction muscle: the chest target holds only the pectoralis major. Scapular push-ups and push-up plus " +
      "carry it as the primary muscle; their pectoral work still counts through the secondary coefficients.",
    futureTarget: "Dedicated 'Stabilizacja łopatki' (Scapular stability) target",
  },
];

/** Set of intentionally excluded muscle IDs — for O(1) membership checks. */
export const INTENTIONALLY_EXCLUDED_MUSCLE_ID_SET: ReadonlySet<number> = new Set(
  INTENTIONALLY_EXCLUDED_MUSCLES.map((e) => e.muscleId),
);

// ─── Coefficient threshold ────────────────────────────────────────────────────
//
// A muscle must appear in exercise_muscle_assignments with at least this
// coefficient to be considered "significant" for the unmapped-muscle guard.
// Muscles used only as minor synergists (coeff ≤ threshold) do not need to be
// tracked in volume_target_members.

export const UNMAPPED_MUSCLE_GUARD_THRESHOLD = 0.5;

import { and, eq, gt } from "drizzle-orm";
import {
  db,
  specificMusclesTable,
  exerciseMuscleAssignmentsTable,
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

// ─── Startup guard ────────────────────────────────────────────────────────────
//
// Queries the same two tables as the integration test and emits a console.warn
// for every high-coefficient muscle that is neither mapped nor intentionally
// excluded.  Never throws — a missing mapping is a data quality problem, not a
// reason to crash the server.

export async function checkUnmappedMuscles(): Promise<void> {
  try {
    // 1. Distinct muscle IDs with coefficient > threshold.
    const highCoeffRows = await db
      .selectDistinct({ specificMuscleId: exerciseMuscleAssignmentsTable.specificMuscleId })
      .from(exerciseMuscleAssignmentsTable)
      .where(gt(exerciseMuscleAssignmentsTable.coefficient, UNMAPPED_MUSCLE_GUARD_THRESHOLD));

    const highCoeffMuscleIds = new Set(highCoeffRows.map((r) => r.specificMuscleId));

    // 2. Distinct muscle IDs that have at least one volume_target_members row.
    const mappedRows = await db
      .selectDistinct({ specificMuscleId: volumeTargetMembersTable.specificMuscleId })
      .from(volumeTargetMembersTable);

    const mappedMuscleIds = new Set(mappedRows.map((r) => r.specificMuscleId));

    // 3. Find muscles that are neither mapped nor intentionally excluded.
    const unmapped: number[] = [];
    for (const muscleId of highCoeffMuscleIds) {
      if (!mappedMuscleIds.has(muscleId) && !INTENTIONALLY_EXCLUDED_MUSCLE_ID_SET.has(muscleId)) {
        unmapped.push(muscleId);
      }
    }

    if (unmapped.length === 0) return;

    // 4. Fetch names for a human-readable warning.
    const nameRows = await db
      .select({ id: specificMusclesTable.id, name: specificMusclesTable.name })
      .from(specificMusclesTable);

    const nameById = new Map(nameRows.map((r) => [r.id, r.name]));

    for (const muscleId of unmapped) {
      const name = nameById.get(muscleId) ?? "unknown";
      console.warn(
        `[MuscleGuard] WARNING: muscle id=${muscleId} "${name}" appears in ` +
        `exercise_muscle_assignments with coefficient > ${UNMAPPED_MUSCLE_GUARD_THRESHOLD} ` +
        `but has no entry in volume_target_members and is not intentionally excluded. ` +
        `Volume calculations may silently under-count. ` +
        `Fix: add a volume_target_members row or add to INTENTIONALLY_EXCLUDED_MUSCLES.`,
      );
    }
  } catch (err) {
    console.warn("[MuscleGuard] Guard check failed (non-fatal):", err);
  }
}
