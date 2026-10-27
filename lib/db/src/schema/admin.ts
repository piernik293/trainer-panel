import { pgTable, serial, integer, text, timestamp, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";

// Panel administratora (migration 0039).
export const appErrorsTable = pgTable("app_errors", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  /** 'api' | 'panel' | 'portal' */
  source: text("source").notNull(),
  place: text("place").notNull(),
  message: text("message").notNull(),
  occurrences: integer("occurrences").notNull().default(1),
  usersCount: integer("users_count").notNull().default(0),
  /** 'new' | 'reviewed' */
  status: text("status").notNull().default("new"),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
}, (t) => [uniqueIndex("app_errors_fingerprint_idx").on(t.fingerprint), index("app_errors_last_seen_idx").on(t.lastSeen)]);

export const appErrorUsersTable = pgTable("app_error_users", {
  errorId: integer("error_id").notNull().references(() => appErrorsTable.id, { onDelete: "cascade" }),
  userHash: text("user_hash").notNull(),
}, (t) => [primaryKey({ columns: [t.errorId, t.userHash] })]);

/** Nieusuwalny dziennik dostępu administratora do danych podopiecznego (wyzwalacz w bazie blokuje UPDATE i DELETE). */
export const adminAccessLogTable = pgTable("admin_access_log", {
  id: serial("id").primaryKey(),
  adminClerkId: text("admin_clerk_id").notNull(),
  action: text("action").notNull(),
  targetClientId: integer("target_client_id"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("admin_access_log_created_idx").on(t.createdAt)]);
