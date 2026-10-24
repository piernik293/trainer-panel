import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";
import { clientsTable } from "./clients";

/**
 * Trainer decisions to keep an exercise that loads a joint the client reported (interview or pain ≤ 30 days).
 * Written when the trainer confirms "Dodaj mimo to". Trainer-only: never exposed to the client portal.
 * plan / plan exercise ids are kept without FKs so the record survives deleting the plan.
 */
export const jointWarningDecisionsTable = pgTable("joint_warning_decisions", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => trainersTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id"),
  planExerciseId: integer("plan_exercise_id"),
  exerciseId: integer("exercise_id").notNull(),
  exerciseNameSnapshot: text("exercise_name_snapshot").notNull(),
  /** Reported joints this exercise loads (subset of PAIN_AREAS) */
  joints: text("joints").array().notNull(),
  /** "dodaj_mimo_to" */
  decision: text("decision").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("joint_warning_decisions_client_idx").on(table.clientId, table.createdAt),
]);

export type JointWarningDecision = typeof jointWarningDecisionsTable.$inferSelect;
