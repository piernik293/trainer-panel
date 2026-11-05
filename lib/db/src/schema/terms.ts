import { pgTable, serial, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/** Migracja 0076: akceptacja Regulaminu (wersja + data) i dziennik eksportów danych użytkownika (limit + ślad; bez treści). */
export const termsAcceptancesTable = pgTable("terms_acceptances", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  version: text("version").notNull(),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("terms_acceptances_user_version_idx").on(t.clerkUserId, t.version)]);

export const dataExportsTable = pgTable("data_exports", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("data_exports_user_idx").on(t.clerkUserId, t.createdAt)]);
