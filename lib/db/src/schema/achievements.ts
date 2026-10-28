import { pgTable, serial, integer, text, date, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { workoutSessionsTable } from "./plans";

/** Osiągnięcia (migration 0056, docs/OSIAGNIECIA.md). Unique (client, kind, key) makes every award idempotent. */
export const clientAchievementsTable = pgTable("client_achievements", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  /** week_streak | record | milestone | first_month | ladder_step | steps_week | month_challenge */
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
  sessionId: integer("session_id").references(() => workoutSessionsTable.id, { onDelete: "set null" }),
  seenAt: timestamp("seen_at"),
  /** Placeholder for the mascot / "share" later; nothing reads it yet. */
  detail: jsonb("detail"),
}, (t) => [
  uniqueIndex("client_achievements_unique_idx").on(t.clientId, t.kind, t.key),
  index("client_achievements_client_idx").on(t.clientId, t.earnedAt),
]);

/** Holiday / illness periods: weeks inside are neutral for the weekly streak. */
export const clientPausesTable = pgTable("client_pauses", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  /** urlop | choroba | inne */
  reason: text("reason").notNull(),
  /** client | trainer */
  setBy: text("set_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("client_pauses_client_idx").on(t.clientId, t.startDate)]);

export type ClientAchievement = typeof clientAchievementsTable.$inferSelect;
export type ClientPause = typeof clientPausesTable.$inferSelect;
