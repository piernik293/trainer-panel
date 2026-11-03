import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

// Solo: zamiany ćwiczenia w planie (migracja 0068). Limit: 3 w ciągu ostatnich 7 dni.
export const soloExerciseSwapsTable = pgTable("solo_exercise_swaps", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  planExerciseId: integer("plan_exercise_id"),
  fromExerciseId: integer("from_exercise_id").notNull(),
  toExerciseId: integer("to_exercise_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("solo_exercise_swaps_client_idx").on(t.clientId, t.createdAt)]);
