import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const trainersTable = pgTable("trainers", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name"),
  email: text("email"),
  /** Blokada konta przez administratora (migration 0039); NULL = konto aktywne. */
  blockedAt: timestamp("blocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Trainer = typeof trainersTable.$inferSelect;
export type InsertTrainer = typeof trainersTable.$inferInsert;
