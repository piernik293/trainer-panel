import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";

// Szablony planów trenera (migration 0053). payload: { days: [{ dayName, exercises: [{ exerciseId, sets, repsMin, repsMax, repsText, loadText, rir, note }] }] }
export const planTemplatesTable = pgTable("plan_templates", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id").notNull().references(() => trainersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("plan_templates_trainer_idx").on(t.trainerId, t.createdAt)]);
