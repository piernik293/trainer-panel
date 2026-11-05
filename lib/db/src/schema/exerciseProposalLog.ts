import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

/** Migracja 0078: dziennik akcji administratora na propozycjach ćwiczeń trenerów (dodane / odrzucone, z powodem). */
export const exerciseProposalLogTable = pgTable("exercise_proposal_log", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id").notNull(),
  actorClerkUserId: text("actor_clerk_user_id").notNull(),
  action: text("action").notNull(), // 'added' | 'rejected'
  reason: text("reason"),
  copyExerciseId: integer("copy_exercise_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("exercise_proposal_log_ex_idx").on(t.exerciseId, t.createdAt)]);
