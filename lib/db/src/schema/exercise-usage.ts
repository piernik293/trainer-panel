import {
  pgTable,
  serial,
  integer,
  uuid,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { exercisesTable } from "./exercises";

/**
 * Per-client exercise usage history for draft-generation variety.
 *
 * One row per (client, generation, exercise). Only automatically selected
 * exercises from handleGenerateFromEmpty are stored here — manual or locked
 * selections are never inserted.
 *
 * The UNIQUE constraint on (client_id, generation_id, exercise_id) is the
 * final database integrity guard; the commit endpoint also enforces
 * idempotency at the application layer.
 */
export const clientExerciseUsageLogTable = pgTable(
  "client_exercise_usage_log",
  {
    id:           serial("id").primaryKey(),
    clientId:     integer("client_id").notNull()
                    .references(() => clientsTable.id, { onDelete: "cascade" }),
    generationId: uuid("generation_id").notNull(),
    exerciseId:   integer("exercise_id").notNull()
                    .references(() => exercisesTable.id, { onDelete: "cascade" }),
    generatedAt:  timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ceu_unique_client_gen_ex").on(
      table.clientId,
      table.generationId,
      table.exerciseId,
    ),
    index("ceu_client_gen_idx").on(table.clientId, table.generatedAt),
    index("ceu_client_exer_idx").on(table.clientId, table.exerciseId),
  ],
);

export type ClientExerciseUsageLog = typeof clientExerciseUsageLogTable.$inferSelect;
export type InsertClientExerciseUsageLog = typeof clientExerciseUsageLogTable.$inferInsert;
