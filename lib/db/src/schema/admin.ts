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

/** „Zgłoś uwagę” (migracja 0062, za flagą FEEDBACK_ENABLED). Treść oczyszczona; bez zrzutów ekranu; autor tylko jako skrót. */
export const userFeedbackTable = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** 'panel' | 'portal' */
  source: text("source").notNull(),
  /** 'trener' | 'klient' */
  authorRole: text("author_role").notNull(),
  /** 'blad' | 'pomysl' | 'niejasne' */
  category: text("category").notNull(),
  message: text("message").notNull(),
  /** ścieżka strony bez parametrów */
  page: text("page").notNull(),
  appVersion: text("app_version").notNull(),
  authorHash: text("author_hash").notNull(),
  /** 'new' | 'read' */
  status: text("status").notNull().default("new"),
  readAt: timestamp("read_at"),
}, (t) => [index("user_feedback_status_created_idx").on(t.status, t.createdAt), index("user_feedback_author_created_idx").on(t.authorHash, t.createdAt)]);
