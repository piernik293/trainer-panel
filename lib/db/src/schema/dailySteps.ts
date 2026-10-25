import { pgTable, serial, integer, text, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

// Kroki dnia wpisywane ręcznie przez klienta (migration 0029). Jeden wpis na (klient, dzień).
export const dailyStepsTable = pgTable("daily_steps", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  steps: integer("steps").notNull(),
  source: text("source").notNull().default("ręcznie"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("daily_steps_client_day_idx").on(t.clientId, t.day)]);

export type DailySteps = typeof dailyStepsTable.$inferSelect;
