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
  { experienceLevel: "Początkujący",             sessionMin: 2, sessionMax: 3, weeklyPreferredCeiling: 6,  weeklyAbsoluteCeiling: 10 },
  { experienceLevel: "Średniozaawansowany",      sessionMin: 3, sessionMax: 4, weeklyPreferredCeiling: 8,  weeklyAbsoluteCeiling: 14 },
  { experienceLevel: "Zaawansowany",             sessionMin: 4, sessionMax: 6, weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 18 },
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

// ─── Public entry point ───────────────────────────────────────────────────────

export async function applyVolumeTargetPatch(): Promise<void> {
  await patchTargetMembers();
  await patchBrzuchTarget();
}
