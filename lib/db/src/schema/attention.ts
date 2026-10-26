import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";

// Skrzynka uwagi trenera (migration 0052). silence_days ∈ {7, 10, 14}; dismissals ref = konkretne zdarzenie.
export const trainerAttentionSettingsTable = pgTable("trainer_attention_settings", {
  trainerId: integer("trainer_id").primaryKey().references(() => trainersTable.id, { onDelete: "cascade" }),
  silenceDays: integer("silence_days").notNull().default(7),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const attentionDismissalsTable = pgTable("attention_dismissals", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id").notNull().references(() => trainersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  ref: text("ref").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("attention_dismissals_unique_idx").on(t.trainerId, t.kind, t.ref)]);
