import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";
import { clientsTable } from "./clients";

/** Migracja 0073: „Złote Byczki” — numerowana odznaka (pula 10 trenerów, 100 osób Solo). Jedna aktywna odznaka na konto i rodzaj. */
export const goldenBullsTable = pgTable("golden_bulls", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // 'trainer' | 'solo'
  number: integer("number").notNull(),
  clerkUserId: text("clerk_user_id").notNull(),
  trainerId: integer("trainer_id").references(() => trainersTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  grantedBy: text("granted_by").notNull().default("auto"),
  reason: text("reason"),
  perksUntil: timestamp("perks_until"),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  revokedBy: text("revoked_by"),
}, (t) => [
  uniqueIndex("golden_bulls_kind_number_idx").on(t.kind, t.number),
  uniqueIndex("golden_bulls_clerk_kind_idx").on(t.clerkUserId, t.kind),
]);
export type GoldenBull = typeof goldenBullsTable.$inferSelect;
