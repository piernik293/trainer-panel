import { pgTable, serial, integer, text, boolean, real, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { exercisesTable } from "./exercises";

/**
 * Catalogue of named specific muscles. The broadCategory must match exactly
 * the vocabulary used in exercises.mainMuscleGroup so the two levels stay
 * consistent (see approved architecture spec).
 */
export const specificMusclesTable = pgTable("specific_muscles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  broadCategory: text("broad_category").notNull(),
}, (table) => [
  uniqueIndex("specific_muscles_name_idx").on(table.name),
]);

/**
 * Maps specific muscles to exercises with a volume-contribution coefficient.
 *
 * DB-level integrity rules (cannot be bypassed by API or UI):
 *  - UNIQUE(exerciseId, specificMuscleId) — no duplicate muscle per exercise.
 *  - Partial UNIQUE(exerciseId) WHERE is_primary = true — at most one primary
 *    per exercise.
 */
export const exerciseMuscleAssignmentsTable = pgTable("exercise_muscle_assignments", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercisesTable.id, { onDelete: "cascade" }),
  specificMuscleId: integer("specific_muscle_id")
    .notNull()
    .references(() => specificMusclesTable.id, { onDelete: "restrict" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  /** 0.0–1.0 coaching estimate. Primary is always 1.0 (enforced by API). */
  coefficient: real("coefficient").notNull().default(1.0),
}, (table) => [
  uniqueIndex("ema_exercise_muscle_unique_idx").on(table.exerciseId, table.specificMuscleId),
  uniqueIndex("ema_one_primary_per_exercise_idx")
    .on(table.exerciseId)
    .where(sql`${table.isPrimary} = true`),
]);

export type SpecificMuscle = typeof specificMusclesTable.$inferSelect;
export type ExerciseMuscleAssignment = typeof exerciseMuscleAssignmentsTable.$inferSelect;
