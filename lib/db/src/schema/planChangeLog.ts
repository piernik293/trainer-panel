import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";
import { workoutPlansTable } from "./plans";

/**
 * Plan history: changes a trainer made to an existing plan outside the normal editor flow
 * (e.g. one-click swap of an exercise loading a reported joint). Who, when, what → what. Trainer-only.
 */
export const planChangeLogTable = pgTable("plan_change_log", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => workoutPlansTable.id, { onDelete: "cascade" }),
  trainerId: integer("trainer_id").references(() => trainersTable.id, { onDelete: "set null" }),
  /** "zamiana_staw" */
  kind: text("kind").notNull(),
  planExerciseId: integer("plan_exercise_id"),
  fromExerciseId: integer("from_exercise_id"),
  fromExerciseName: text("from_exercise_name"),
  toExerciseId: integer("to_exercise_id"),
  toExerciseName: text("to_exercise_name"),
  /** e.g. the reported joints the swap avoids */
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("plan_change_log_plan_idx").on(table.planId, table.createdAt),
]);

export type PlanChangeLogEntry = typeof planChangeLogTable.$inferSelect;
