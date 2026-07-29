/**
 * Idempotent patch applied on every server startup AFTER the main volume-
 * guideline seed.  Each block checks whether the data already exists before
 * inserting, so it is safe to run repeatedly.
 *
 * Patch 1 — Mięsień obły większy → Mięsień najszerszy grzbietu
 *   Teres major is a primary synergist of latissimus dorsi in all pulling
 *   movements (adduction, extension, internal rotation of the shoulder).
 *   Without this mapping, every row and pulldown exercise fires a
 *   MISSING_MUSCLE_TARGET warning for their secondary lat-synergist entry.
 *
 * Patch 2 — Mięśnie odwodziciele uda → Mięśnie pośladkowe
 *   Hip abductors (glute medius / minimus acting as abductors) are trained
 *   alongside the posterior chain in abduction-specific exercises.  Adding
 *   them to the glute target lets the abductor machine exercise contribute
 *   through its primary muscle column.
 *
 * Patch 3 — Brzuch (Core) target
 *   The generator places exercises such as Plank, Dead bug, Bird dog, and
 *   Ab wheel rollout into dedicated "Core" slots.  Without a Brzuch volume
 *   target these exercises trigger EXERCISE_WITHOUT_MUSCLE_ASSIGNMENTS and
 *   are completely invisible to volume tracking.  This patch adds the target
 *   and sensible weekly-volume guidelines for all four experience levels.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  specificMusclesTable,
  volumeTargetsTable,
  volumeTargetMembersTable,
  volumeGuidelinesTable,
  volumeGuidelineVersionsTable,
} from "@workspace/db";

// ─── Patch 1 & 2: add missing members to existing targets ────────────────────

interface NewMember {
  muscleNameToAdd: string;
  targetName: string;
}

const NEW_MEMBERS: NewMember[] = [
  {
    muscleNameToAdd: "Mięsień obły większy",
    targetName: "Mięsień najszerszy grzbietu",
  },
  {
    muscleNameToAdd: "Mięśnie odwodziciele uda",
    targetName: "Mięśnie pośladkowe",
  },
];

async function patchTargetMembers(): Promise<void> {
  for (const { muscleNameToAdd, targetName } of NEW_MEMBERS) {
    const [muscle] = await db
      .select({ id: specificMusclesTable.id })
      .from(specificMusclesTable)
      .where(eq(specificMusclesTable.name, muscleNameToAdd));

    if (!muscle) {
      // Muscle not in catalogue — nothing to link.
      continue;
    }

    const [target] = await db
      .select({ id: volumeTargetsTable.id })
      .from(volumeTargetsTable)
      .where(eq(volumeTargetsTable.name, targetName));

    if (!target) {
      continue;
    }

    // Check whether the link already exists.
    const existing = await db
      .select({ volumeTargetId: volumeTargetMembersTable.volumeTargetId })
      .from(volumeTargetMembersTable)
      .where(
        and(
          eq(volumeTargetMembersTable.volumeTargetId, target.id),
          eq(volumeTargetMembersTable.specificMuscleId, muscle.id),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(volumeTargetMembersTable).values({
        volumeTargetId: target.id,
        specificMuscleId: muscle.id,
      });
    }
  }
}

// ─── Patch 3: Brzuch (Core) volume target ─────────────────────────────────────

const BRZUCH_TARGET_NAME = "Brzuch";

const BRZUCH_MEMBER_NAMES = [
  "Mięsień poprzeczny brzucha",
  "Mięsień prosty brzucha",
  "Mięśnie skośne brzucha",
];

interface BrzuchGuideline {
  experienceLevel: string;
  sessionMin: number;
  sessionMax: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
}

// Core volume guidelines modelled on common practice.
// Core is trained at relatively higher frequency; absolute ceilings are generous
// because core sets accumulate from compound movements and dedicated isolation.
const BRZUCH_GUIDELINES: BrzuchGuideline[] = [
  { experienceLevel: "Brak aktywności fizycznej", sessionMin: 1, sessionMax: 2, weeklyPreferredCeiling: 4,  weeklyAbsoluteCeiling: 6  },
  { experienceLevel: "Początkujący",             sessionMin: 2, sessionMax: 3, weeklyPreferredCeiling: 6,  weeklyAbsoluteCeiling: 9  },
  { experienceLevel: "Średniozaawansowany",      sessionMin: 3, sessionMax: 4, weeklyPreferredCeiling: 8,  weeklyAbsoluteCeiling: 12 },
  { experienceLevel: "Zaawansowany",             sessionMin: 4, sessionMax: 6, weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 16 },
];

async function patchBrzuchTarget(): Promise<void> {
  // Already exists?
  const existing = await db
    .select({ id: volumeTargetsTable.id })
    .from(volumeTargetsTable)
    .where(eq(volumeTargetsTable.name, BRZUCH_TARGET_NAME))
    .limit(1);

  if (existing.length > 0) {
    return; // Already patched.
  }

  // Resolve muscle IDs from the catalogue.
  const muscleRows = await db
    .select({ id: specificMusclesTable.id, name: specificMusclesTable.name })
    .from(specificMusclesTable)
    .where(inArray(specificMusclesTable.name, BRZUCH_MEMBER_NAMES));

  const muscleIdByName = new Map(muscleRows.map((m) => [m.name, m.id]));

  // Resolve the active guideline version (must exist — created by main seed).
  const [version] = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.isActive, true))
    .limit(1);

  if (!version) {
    throw new Error("volumeTargetPatch: no active guideline version found");
  }

  await db.transaction(async (tx) => {
    // Insert the target.
    const [inserted] = await tx
      .insert(volumeTargetsTable)
      .values({
        name: BRZUCH_TARGET_NAME,
        targetType: "muscle_group",
        broadCategory: "Brzuch",
        isActive: true,
      })
      .returning({ id: volumeTargetsTable.id });

    // Link member muscles (skip any not present in the catalogue).
    for (const muscleName of BRZUCH_MEMBER_NAMES) {
      const muscleId = muscleIdByName.get(muscleName);
      if (!muscleId) continue;
      await tx.insert(volumeTargetMembersTable).values({
        volumeTargetId: inserted.id,
        specificMuscleId: muscleId,
      });
    }

    // Insert guideline rows for each experience level.
    for (const g of BRZUCH_GUIDELINES) {
      await tx.insert(volumeGuidelinesTable).values({
        versionId: version.id,
        experienceLevel: g.experienceLevel,
        volumeTargetId: inserted.id,
        sessionMin: String(g.sessionMin),
        sessionMax: String(g.sessionMax),
        weeklyPreferredCeiling: String(g.weeklyPreferredCeiling),
        weeklyAbsoluteCeiling: String(g.weeklyAbsoluteCeiling),
      });
    }
  });
}

// ─── Patch 4: update NO_ACTIVITY weekly_absolute_ceiling to new max/week ──────

/**
 * Patch 4 — Brak aktywności fizycznej max/week ceiling update.
 *
 * Previous values were conservatively low (e.g. Quad: 5, Glute: 5).
 * New values align with the programme-wide max/week targets supplied in the
 * product spec (Quad: 8, Glute: 8, …).
 *
 * Idempotent: checks current Quad ceiling; exits immediately if already ≥ 8.
 * Brzuch stays unchanged (weeklyAbsoluteCeiling=6 already correct).
 */
const NO_ACTIVITY_CEILING_UPDATES: Record<string, number> = {
  "Mięsień czworogłowy uda":       8,
  "Mięśnie pośladkowe":            8,
  "Mięsień trójgłowy łydki":       3,
  "Przywodziciele":                4,
  "Grupa kulszowo-goleniowa":       5,
  "Mięśnie naramienne":            8,
  "Mięsień trójgłowy ramienia":    3,
  "Mięsień piersiowy większy":     8,
  "Mięsień najszerszy grzbietu":   6,
  "Mięsień czworoboczny grzbietu": 8,
  "Mięsień dwugłowy ramienia":     3,
};

async function patchNoActivityCeilings(): Promise<void> {
  // Idempotency guard: if Quad is already ≥ 8, the patch has already run.
  const [version] = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.isActive, true))
    .limit(1);

  if (!version) return;

  const [quadTarget] = await db
    .select({ id: volumeTargetsTable.id })
    .from(volumeTargetsTable)
    .where(eq(volumeTargetsTable.name, "Mięsień czworogłowy uda"))
    .limit(1);

  if (!quadTarget) return;

  const [currentRow] = await db
    .select({ weeklyAbsoluteCeiling: volumeGuidelinesTable.weeklyAbsoluteCeiling })
    .from(volumeGuidelinesTable)
    .where(
      and(
        eq(volumeGuidelinesTable.versionId, version.id),
        eq(volumeGuidelinesTable.volumeTargetId, quadTarget.id),
        eq(volumeGuidelinesTable.experienceLevel, "Brak aktywności fizycznej"),
      ),
    )
    .limit(1);

  if (!currentRow) return;
  if (Number(currentRow.weeklyAbsoluteCeiling) >= 8) return; // already patched

  // Apply updates for all listed targets.
  const targetNames = Object.keys(NO_ACTIVITY_CEILING_UPDATES);
  const targetRows = await db
    .select({ id: volumeTargetsTable.id, name: volumeTargetsTable.name })
    .from(volumeTargetsTable)
    .where(inArray(volumeTargetsTable.name, targetNames));

  for (const target of targetRows) {
    const newCeiling = NO_ACTIVITY_CEILING_UPDATES[target.name];
    if (newCeiling === undefined) continue;
    await db
      .update(volumeGuidelinesTable)
      .set({ weeklyAbsoluteCeiling: String(newCeiling) })
      .where(
        and(
          eq(volumeGuidelinesTable.versionId, version.id),
          eq(volumeGuidelinesTable.volumeTargetId, target.id),
          eq(volumeGuidelinesTable.experienceLevel, "Brak aktywności fizycznej"),
        ),
      );
  }
}

// ─── Patch 5: update existing Brzuch weeklyAbsoluteCeiling rows ──────────────

/**
 * Patch 5 — Brzuch max/week ceiling update.
 *
 * patchBrzuchTarget() is insert-once and won't re-run once Brzuch exists, so
 * ceiling changes to BRZUCH_GUIDELINES cannot be applied by simply changing the
 * array — this idempotent patch updates the already-inserted rows directly.
 *
 * Expected values (from spec):
 *   Brak aktywności fizycznej → 6  (unchanged)
 *   Początkujący              → 9  (was 10)
 *   Średniozaawansowany       → 12 (was 14)
 *   Zaawansowany              → 16 (was 18)
 *
 * Idempotency guard: checks Początkujący ceiling; exits if already ≤ 9.
 */
async function patchBrzuchCeilings(): Promise<void> {
  const [brzuchTarget] = await db
    .select({ id: volumeTargetsTable.id })
    .from(volumeTargetsTable)
    .where(eq(volumeTargetsTable.name, BRZUCH_TARGET_NAME))
    .limit(1);

  if (!brzuchTarget) return; // Brzuch not yet inserted — patchBrzuchTarget will use BRZUCH_GUIDELINES directly.

  const [version] = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .where(eq(volumeGuidelineVersionsTable.isActive, true))
    .limit(1);

  if (!version) return;

  // Idempotency guard: if Początkujący ceiling is already ≤ 9, already patched.
  const [begRow] = await db
    .select({ weeklyAbsoluteCeiling: volumeGuidelinesTable.weeklyAbsoluteCeiling })
    .from(volumeGuidelinesTable)
    .where(
      and(
        eq(volumeGuidelinesTable.versionId, version.id),
        eq(volumeGuidelinesTable.volumeTargetId, brzuchTarget.id),
        eq(volumeGuidelinesTable.experienceLevel, "Początkujący"),
      ),
    )
    .limit(1);

  if (!begRow) return;
  if (Number(begRow.weeklyAbsoluteCeiling) <= 9) return; // already at target value

  // Apply the correct ceilings from BRZUCH_GUIDELINES for all four levels.
  for (const g of BRZUCH_GUIDELINES) {
    await db
      .update(volumeGuidelinesTable)
      .set({ weeklyAbsoluteCeiling: String(g.weeklyAbsoluteCeiling) })
      .where(
        and(
          eq(volumeGuidelinesTable.versionId, version.id),
          eq(volumeGuidelinesTable.volumeTargetId, brzuchTarget.id),
          eq(volumeGuidelinesTable.experienceLevel, g.experienceLevel),
        ),
      );
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function applyVolumeTargetPatch(): Promise<void> {
  await patchTargetMembers();
  await patchBrzuchTarget();
  await patchNoActivityCeilings();
  await patchBrzuchCeilings();
}
