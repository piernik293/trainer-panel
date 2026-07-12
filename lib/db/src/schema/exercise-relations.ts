import { pgTable, serial, integer, text, uniqueIndex } from "drizzle-orm/pg-core";
import { exercisesTable } from "./exercises";

/**
 * Substitutions — exercises that can replace the source exercise.
 * An exercise can have multiple substitutions ordered by sortOrder.
 */
export const exerciseSubstitutionsTable = pgTable("exercise_substitutions", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercisesTable.id, { onDelete: "cascade" }),
  substituteExerciseId: integer("substitute_exercise_id")
    .notNull()
    .references(() => exercisesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  uniqueIndex("es_exercise_substitute_unique_idx").on(table.exerciseId, table.substituteExerciseId),
]);

/**
 * Progressions — ordered chains linking exercises by difficulty direction.
 * direction = "progression" (harder) | "regression" (easier).
 * Unique per (exerciseId, linkedExerciseId, direction) triplet.
 */
export const exerciseProgressionsTable = pgTable("exercise_progressions", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercisesTable.id, { onDelete: "cascade" }),
  linkedExerciseId: integer("linked_exercise_id")
    .notNull()
    .references(() => exercisesTable.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // "progression" | "regression"
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  uniqueIndex("ep_exercise_linked_direction_unique_idx").on(
    table.exerciseId,
    table.linkedExerciseId,
    table.direction,
  ),
]);

export type ExerciseSubstitution = typeof exerciseSubstitutionsTable.$inferSelect;
export type ExerciseProgression = typeof exerciseProgressionsTable.$inferSelect;
