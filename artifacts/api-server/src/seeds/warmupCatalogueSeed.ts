/**
 * Seeds the warm-up / stretching exercises. Idempotent (ON CONFLICT on slug); safe to run on every start.
 * #10 of the list is the existing Band Pull-Apart row: it only gets the role and the amount (no duplicate).
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";
import { WARMUP_CATALOGUE } from "./warmupCatalogueData";

const ALL_LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"];
const arr = (v: string[]) => sql`ARRAY[${sql.join(v.map((x) => sql`${x}`), sql`, `)}]::text[]`;
const emptyArr = sql`ARRAY[]::text[]`;

/** Primary specific muscle per exercise number (catalogue integrity: every exercise has one; volume is irrelevant — these never enter plans). */
const PRIMARY_MUSCLE: Record<number, string> = {
  1: "Mięsień poprzeczny brzucha", 2: "Mięśnie stożka rotatorów", 3: "Mięsień pośladkowy średni", 4: "Mięśnie skośne brzucha",
  5: "Zginacze nadgarstka i palców", 6: "Prostowniki grzbietu", 7: "Mięsień czworogłowy uda", 8: "Mięsień czworogłowy uda",
  9: "Mięsień pośladkowy wielki", 10: "Mięśnie równoległoboczne", 11: "Mięśnie stożka rotatorów", 12: "Mięsień piersiowy większy",
  13: "Mięsień poprzeczny brzucha", 14: "Mięsień brzuchaty łydki", 15: "Mięsień czworogłowy uda", 16: "Mięsień piersiowy większy",
  17: "Mięsień naramienny (głowa tylna)", 18: "Mięsień trójgłowy ramienia", 19: "Mięsień dwugłowy ramienia", 20: "Prostowniki grzbietu",
  21: "Mięsień czworogłowy uda", 22: "Mięśnie kulszowo-goleniowe", 23: "Mięsień pośladkowy wielki", 24: "Mięsień brzuchaty łydki",
  25: "Mięśnie przywodziciele uda", 26: "Mięśnie skośne brzucha", 27: "Mięsień czworogłowy uda", 28: "Mięśnie kulszowo-goleniowe",
};

export async function seedWarmupCatalogue(): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const e of WARMUP_CATALOGUE) {
    const verification = e.suitable === true ? "zweryfikowane" : "do_weryfikacji";
    if (e.existingSlug) {
      const r = await db.execute(sql`
        UPDATE exercises SET role = ${e.role}, default_reps = ${e.reps}, default_duration_seconds = ${e.secs}, per_side = ${e.perSide},
               joint_stress_areas = ${e.joints.length ? arr(e.joints) : emptyArr}, updated_at = now()
         WHERE slug = ${e.existingSlug}`);
      updated += (r as unknown as { rowCount?: number }).rowCount ?? 0;
      continue; // #10 already has its own muscle assignments
    }
    const complexity = e.learning === 1 ? "Prosta" : "Umiarkowana";
    const r = await db.execute(sql`
      INSERT INTO exercises (
        name, slug, main_muscle_group, secondary_muscle_groups, equipment, required_equipment_all, training_location,
        difficulty_level, movement_pattern, exercise_type, execution_instructions, execution, joint_stress,
        learning_difficulty, suitable_for_no_activity, movement_complexity, suitable_experience_levels, requires_spotter,
        can_be_performed_to_failure, exercise_priority, movement_category, plane_of_motion, neurological_fatigue, doms_potential,
        is_active, role, verification_status, joint_stress_areas,
        equipment_detail, default_reps, default_duration_seconds, per_side
      ) VALUES (
        ${e.name}, ${e.slug}, ${e.main}, ${arr(e.secondary)}, ${arr(e.equipment)}, ${emptyArr}, ${arr(e.location)},
        'Brak aktywności fizycznej', ${e.pattern}, ${e.type}, ${e.instr}, ${e.perSide ? "Jednostronne" : "Obustronne"}, 'Niskie',
        ${e.learning}, ${e.suitable}, ${complexity}, ${arr(ALL_LEVELS)}, false,
        'Nie', 'Niski', 'Inne', 'Strzałkowa', 1, 1, true, ${e.role}, ${verification}, ${e.joints.length ? arr(e.joints) : emptyArr},
        ${e.nr === 15 ? arr(["Rower stacjonarny"]) : emptyArr}, ${e.reps}, ${e.secs}, ${e.perSide}
      )
      ON CONFLICT (slug) DO UPDATE SET
        role = EXCLUDED.role, default_reps = EXCLUDED.default_reps, default_duration_seconds = EXCLUDED.default_duration_seconds,
        per_side = EXCLUDED.per_side, joint_stress_areas = EXCLUDED.joint_stress_areas, equipment_detail = EXCLUDED.equipment_detail,
        execution_instructions = EXCLUDED.execution_instructions, suitable_for_no_activity = EXCLUDED.suitable_for_no_activity,
        learning_difficulty = EXCLUDED.learning_difficulty, verification_status = EXCLUDED.verification_status,
        main_muscle_group = EXCLUDED.main_muscle_group, secondary_muscle_groups = EXCLUDED.secondary_muscle_groups,
        movement_pattern = EXCLUDED.movement_pattern, movement_category = EXCLUDED.movement_category,
        plane_of_motion = EXCLUDED.plane_of_motion, neurological_fatigue = EXCLUDED.neurological_fatigue,
        doms_potential = EXCLUDED.doms_potential, updated_at = now()
      -- never overwrite a regular catalogue exercise that happens to share the slug
      WHERE exercises.role IN ('rozgrzewka', 'rozciąganie')
      RETURNING (xmax = 0) AS inserted`);
    const row = (r as unknown as { rows: { inserted: boolean }[] }).rows?.[0];
    if (row?.inserted) inserted++;
    else updated++;
    await assignPrimaryMuscle(e.slug, e.nr);
  }
  if (inserted > 0) logger.info({ inserted }, "Warm-up catalogue seeded");
  return { inserted, updated };
}

async function assignPrimaryMuscle(slug: string, nr: number): Promise<void> {
  const muscle = PRIMARY_MUSCLE[nr];
  if (!muscle) return;
  // DO NOTHING on any unique conflict: an exercise keeps the assignments it already has.
  await db.execute(sql`
    INSERT INTO exercise_muscle_assignments (exercise_id, specific_muscle_id, is_primary, coefficient)
    SELECT e.id, m.id, true, 1.0 FROM exercises e, specific_muscles m
     WHERE e.slug = ${slug} AND m.name = ${muscle}
    ON CONFLICT DO NOTHING`);
}
