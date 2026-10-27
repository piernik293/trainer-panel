import { pgTable, serial, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Wnioski o konto trenera i ustawienia aplikacji (migration 0040).
export const trainerApplicationsTable = pgTable("trainer_applications", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  displayName: text("display_name"),
  email: text("email"),
  note: text("note"),
  /** 'pending' | 'accepted' | 'rejected' */
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  decidedBy: text("decided_by"),
}, (t) => [
  uniqueIndex("trainer_applications_pending_idx").on(t.clerkUserId).where(sql`status = 'pending'`),
  index("trainer_applications_user_idx").on(t.clerkUserId, t.createdAt),
]);

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
