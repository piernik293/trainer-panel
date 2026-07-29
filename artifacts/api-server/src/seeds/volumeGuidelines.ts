/**
 * One-time seed for volume guideline tables.
 * Safe to call on every startup — checks for existing data first.
 *
 * Seeds:
 *   - 1 guideline version ("v1 – zatwierdzona tabela objętości")
 *   - 11 approved volume targets
 *   - volume_target_members linking targets → specific_muscles (by name)
 *   - 44 guideline rows (11 targets × 4 experience levels)
 */

import { eq, inArray } from "drizzle-orm";
import {
  db,
  volumeGuidelineVersionsTable,
  volumeTargetsTable,
  volumeTargetMembersTable,
  volumeGuidelinesTable,
  specificMusclesTable,
} from "@workspace/db";

// ─── Target definitions ───────────────────────────────────────────────────────

interface TargetDef {
  name: string;
  targetType: "specific_muscle" | "muscle_group";
  broadCategory: string;
  /** Names of specific_muscles in the catalogue that map to this target. */
  memberNames: string[];
}

const TARGETS: TargetDef[] = [
  {
    name: "Mięsień czworogłowy uda",
    targetType: "muscle_group",
    broadCategory: "Mięśnie czworogłowe uda",
    memberNames: ["Mięsień czworogłowy uda"],
  },
  {
    name: "Mięśnie pośladkowe",
    targetType: "muscle_group",
    broadCategory: "Pośladki",
    memberNames: [
      "Mięsień pośladkowy wielki",
      "Mięsień pośladkowy średni",
      "Mięsień pośladkowy mały",
    ],
  },
  {
    name: "Mięsień trójgłowy łydki",
    targetType: "muscle_group",
    broadCategory: "Łydki",
    memberNames: ["Mięsień brzuchaty łydki", "Mięsień płaszczkowaty"],
  },
  {
    name: "Przywodziciele",
    targetType: "muscle_group",
    broadCategory: "Przywodziciele",
    memberNames: ["Mięśnie przywodziciele uda"],
  },
  {
    name: "Grupa kulszowo-goleniowa",
    targetType: "muscle_group",
    broadCategory: "Mięśnie dwugłowe uda",
    memberNames: ["Mięśnie kulszowo-goleniowe"],
  },
  {
    name: "Mięśnie naramienne",
    targetType: "muscle_group",
    broadCategory: "Barki",
    memberNames: [
      "Mięsień naramienny (głowa przednia)",
      "Mięsień naramienny (głowa boczna)",
      "Mięsień naramienny (głowa tylna)",
    ],
  },
  {
    name: "Mięsień trójgłowy ramienia",
    targetType: "specific_muscle",
    broadCategory: "Triceps",
    memberNames: ["Mięsień trójgłowy ramienia"],
  },
  {
    name: "Mięsień piersiowy większy",
    targetType: "specific_muscle",
    broadCategory: "Klatka piersiowa",
    memberNames: ["Mięsień piersiowy większy"],
  },
  {
    name: "Mięsień najszerszy grzbietu",
    targetType: "specific_muscle",
    broadCategory: "Plecy",
    memberNames: ["Mięsień najszerszy grzbietu"],
  },
  {
    name: "Mięsień czworoboczny grzbietu",
    targetType: "specific_muscle",
    broadCategory: "Plecy",
    memberNames: ["Mięsień czworoboczny grzbietu"],
  },
  {
    name: "Mięsień dwugłowy ramienia",
    targetType: "specific_muscle",
    broadCategory: "Biceps",
    memberNames: ["Mięsień dwugłowy ramienia"],
  },
];

// ─── Guideline values ─────────────────────────────────────────────────────────

interface GuidelineValues {
  sessionMin: number;
  sessionMax: number;
  weeklyPreferredCeiling: number;
  weeklyAbsoluteCeiling: number;
}

type GuidelineTable = Record<string, GuidelineValues>;

const BEGINNER: GuidelineTable = {
  "Mięsień czworogłowy uda": { sessionMin: 4, sessionMax: 4, weeklyPreferredCeiling: 8, weeklyAbsoluteCeiling: 10 },
  "Mięśnie pośladkowe":      { sessionMin: 4, sessionMax: 4, weeklyPreferredCeiling: 8, weeklyAbsoluteCeiling: 10 },
  "Mięsień trójgłowy łydki": { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 4 },
  "Przywodziciele":           { sessionMin: 3, sessionMax: 3, weeklyPreferredCeiling: 6, weeklyAbsoluteCeiling: 6 },
  "Grupa kulszowo-goleniowa": { sessionMin: 3, sessionMax: 3, weeklyPreferredCeiling: 6, weeklyAbsoluteCeiling: 6 },
  "Mięśnie naramienne":       { sessionMin: 2, sessionMax: 4, weeklyPreferredCeiling: 8, weeklyAbsoluteCeiling: 12 },
  "Mięsień trójgłowy ramienia":  { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 4 },
  "Mięsień piersiowy większy":   { sessionMin: 2, sessionMax: 4, weeklyPreferredCeiling: 8, weeklyAbsoluteCeiling: 10 },
  "Mięsień najszerszy grzbietu": { sessionMin: 2, sessionMax: 4, weeklyPreferredCeiling: 8, weeklyAbsoluteCeiling: 8 },
  "Mięsień czworoboczny grzbietu": { sessionMin: 4, sessionMax: 4, weeklyPreferredCeiling: 8, weeklyAbsoluteCeiling: 12 },
  "Mięsień dwugłowy ramienia":   { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 4 },
};

const INTERMEDIATE: GuidelineTable = {
  "Mięsień czworogłowy uda": { sessionMin: 6, sessionMax: 8,  weeklyPreferredCeiling: 16, weeklyAbsoluteCeiling: 20 },
  "Mięśnie pośladkowe":      { sessionMin: 6, sessionMax: 8,  weeklyPreferredCeiling: 16, weeklyAbsoluteCeiling: 20 },
  "Mięsień trójgłowy łydki": { sessionMin: 4, sessionMax: 4,  weeklyPreferredCeiling: 8,  weeklyAbsoluteCeiling: 8 },
  "Przywodziciele":           { sessionMin: 4, sessionMax: 4,  weeklyPreferredCeiling: 8,  weeklyAbsoluteCeiling: 8 },
  "Grupa kulszowo-goleniowa": { sessionMin: 4, sessionMax: 6,  weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 16 },
  "Mięśnie naramienne":       { sessionMin: 4, sessionMax: 6,  weeklyPreferredCeiling: 16, weeklyAbsoluteCeiling: 20 },
  "Mięsień trójgłowy ramienia":  { sessionMin: 3, sessionMax: 3, weeklyPreferredCeiling: 6,  weeklyAbsoluteCeiling: 8 },
  "Mięsień piersiowy większy":   { sessionMin: 4, sessionMax: 6, weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 16 },
  "Mięsień najszerszy grzbietu": { sessionMin: 4, sessionMax: 4, weeklyPreferredCeiling: 10, weeklyAbsoluteCeiling: 12 },
  "Mięsień czworoboczny grzbietu": { sessionMin: 6, sessionMax: 6, weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 16 },
  "Mięsień dwugłowy ramienia":   { sessionMin: 3, sessionMax: 3, weeklyPreferredCeiling: 6,  weeklyAbsoluteCeiling: 8 },
};

const ADVANCED: GuidelineTable = {
  "Mięsień czworogłowy uda": { sessionMin: 6,  sessionMax: 10, weeklyPreferredCeiling: 24, weeklyAbsoluteCeiling: 30 },
  "Mięśnie pośladkowe":      { sessionMin: 6,  sessionMax: 10, weeklyPreferredCeiling: 24, weeklyAbsoluteCeiling: 30 },
  "Mięsień trójgłowy łydki": { sessionMin: 6,  sessionMax: 6,  weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 12 },
  "Przywodziciele":           { sessionMin: 6,  sessionMax: 6,  weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 12 },
  "Grupa kulszowo-goleniowa": { sessionMin: 6,  sessionMax: 8,  weeklyPreferredCeiling: 20, weeklyAbsoluteCeiling: 24 },
  "Mięśnie naramienne":       { sessionMin: 5,  sessionMax: 8,  weeklyPreferredCeiling: 20, weeklyAbsoluteCeiling: 24 },
  "Mięsień trójgłowy ramienia":  { sessionMin: 4, sessionMax: 4, weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 16 },
  "Mięsień piersiowy większy":   { sessionMin: 5, sessionMax: 8, weeklyPreferredCeiling: 15, weeklyAbsoluteCeiling: 20 },
  "Mięsień najszerszy grzbietu": { sessionMin: 5, sessionMax: 6, weeklyPreferredCeiling: 15, weeklyAbsoluteCeiling: 20 },
  "Mięsień czworoboczny grzbietu": { sessionMin: 5, sessionMax: 8, weeklyPreferredCeiling: 20, weeklyAbsoluteCeiling: 24 },
  "Mięsień dwugłowy ramienia":   { sessionMin: 4, sessionMax: 4, weeklyPreferredCeiling: 12, weeklyAbsoluteCeiling: 16 },
};

const NO_ACTIVITY: GuidelineTable = {
  "Mięsień czworogłowy uda":       { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 8 },
  "Mięśnie pośladkowe":            { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 8 },
  "Mięsień trójgłowy łydki":       { sessionMin: 1, sessionMax: 1, weeklyPreferredCeiling: 2, weeklyAbsoluteCeiling: 3 },
  "Przywodziciele":                { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 3, weeklyAbsoluteCeiling: 4 },
  "Grupa kulszowo-goleniowa":      { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 3, weeklyAbsoluteCeiling: 5 },
  "Mięśnie naramienne":            { sessionMin: 1, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 8 },
  "Mięsień trójgłowy ramienia":    { sessionMin: 1, sessionMax: 1, weeklyPreferredCeiling: 2, weeklyAbsoluteCeiling: 3 },
  "Mięsień piersiowy większy":     { sessionMin: 1, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 8 },
  "Mięsień najszerszy grzbietu":   { sessionMin: 1, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 6 },
  "Mięsień czworoboczny grzbietu": { sessionMin: 2, sessionMax: 2, weeklyPreferredCeiling: 4, weeklyAbsoluteCeiling: 8 },
  "Mięsień dwugłowy ramienia":     { sessionMin: 1, sessionMax: 1, weeklyPreferredCeiling: 2, weeklyAbsoluteCeiling: 3 },
};

const LEVELS: { level: string; table: GuidelineTable }[] = [
  { level: "Brak aktywności fizycznej", table: NO_ACTIVITY },
  { level: "Początkujący",             table: BEGINNER },
  { level: "Średniozaawansowany",      table: INTERMEDIATE },
  { level: "Zaawansowany",             table: ADVANCED },
];

// ─── Seed function ────────────────────────────────────────────────────────────

export async function seedVolumeGuidelines(): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Insert guideline version.
    const [version] = await tx
      .insert(volumeGuidelineVersionsTable)
      .values({
        label: "v1 – zatwierdzona tabela objętości",
        sourceDescription: null,
        isActive: true,
      })
      .returning({ id: volumeGuidelineVersionsTable.id });

    const versionId = version.id;

    // 2. Insert targets and collect their IDs.
    const allMemberNames = TARGETS.flatMap((t) => t.memberNames);
    const muscleRows = await tx
      .select({ id: specificMusclesTable.id, name: specificMusclesTable.name })
      .from(specificMusclesTable)
      .where(inArray(specificMusclesTable.name, allMemberNames));

    const muscleIdByName = new Map<string, number>(muscleRows.map((m) => [m.name, m.id]));

    const targetIdByName = new Map<string, number>();

    for (const target of TARGETS) {
      const [inserted] = await tx
        .insert(volumeTargetsTable)
        .values({
          name: target.name,
          targetType: target.targetType,
          broadCategory: target.broadCategory,
          isActive: true,
        })
        .returning({ id: volumeTargetsTable.id });

      targetIdByName.set(target.name, inserted.id);

      // 3. Insert volume_target_members.
      for (const memberName of target.memberNames) {
        const muscleId = muscleIdByName.get(memberName);
        if (!muscleId) {
          throw new Error(
            `Seed error: specific_muscle not found in catalogue: "${memberName}" ` +
            `(required for target "${target.name}")`,
          );
        }
        await tx.insert(volumeTargetMembersTable).values({
          volumeTargetId: inserted.id,
          specificMuscleId: muscleId,
        });
      }
    }

    // 4. Insert 44 guideline rows (11 targets × 4 levels).
    const guidelineRows: (typeof volumeGuidelinesTable.$inferInsert)[] = [];

    for (const { level, table } of LEVELS) {
      for (const target of TARGETS) {
        const vals = table[target.name];
        if (!vals) {
          throw new Error(
            `Seed error: missing guideline values for "${target.name}" at level "${level}"`,
          );
        }
        const targetId = targetIdByName.get(target.name);
        if (!targetId) throw new Error(`Seed error: target ID not found for "${target.name}"`);

        guidelineRows.push({
          versionId,
          experienceLevel: level,
          volumeTargetId: targetId,
          sessionMin: String(vals.sessionMin),
          sessionMax: String(vals.sessionMax),
          weeklyPreferredCeiling: String(vals.weeklyPreferredCeiling),
          weeklyAbsoluteCeiling: String(vals.weeklyAbsoluteCeiling),
        });
      }
    }

    await tx.insert(volumeGuidelinesTable).values(guidelineRows);
  });
}

/** Called on server startup. Runs seed only if volume_guideline_versions is empty. */
export async function maybeRunSeed(): Promise<void> {
  const existing = await db
    .select({ id: volumeGuidelineVersionsTable.id })
    .from(volumeGuidelineVersionsTable)
    .limit(1);

  if (existing.length === 0) {
    await seedVolumeGuidelines();
  }
}
