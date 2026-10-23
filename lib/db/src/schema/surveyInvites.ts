import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";
import { clientsTable } from "./clients";

export const surveyInvitesTable = pgTable("survey_invites", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => trainersTable.id, { onDelete: "cascade" }),
  /**
   * When set, this invitation is tied to a pre-existing client created by the
   * trainer.  The public survey submission will attach the completed interview
   * to this client rather than creating a new one.
   */
  clientId: integer("client_id")
    .references(() => clientsTable.id, { onDelete: "set null" }),
  /** SHA-256 hash of the raw token. The raw token is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  /** Optional pre-filled email shown to the client on the survey page. */
  intendedEmail: text("intended_email"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /**
   * Soft-archive timestamp set when a trainer removes the invite from their
   * UI via "Usuń z widoku".  The row is never deleted — it remains in the DB
   * for audit purposes and is filtered out of the trainer list endpoint.
   */
  archivedAt: timestamp("archived_at"),

  // ── Migration 0016: "Zaproś klienta" details (all nullable) ──────────────
  /** Client's first name typed by the trainer (shown in the list and the e-mail). */
  clientName: text("client_name"),
  /** 'email' (sent by the app) | 'link' (trainer copies the link). */
  channel: text("channel"),
  /** Optional personal message shown in the e-mail. */
  trainerMessage: text("trainer_message"),
  /** First time the client opened the link (set by the public endpoint). */
  openedAt: timestamp("opened_at"),
  /** Last e-mail sent for this invitation (invite, resend or reminder). */
  lastSentAt: timestamp("last_sent_at"),
  /** Last reminder — at most one per 24 h. */
  remindedAt: timestamp("reminded_at"),
  /** Hash of the link before the last resend/reminder; that link keeps working. */
  previousTokenHash: text("previous_token_hash"),
}, (table) => [
  index("survey_invites_previous_token_hash_idx").on(table.previousTokenHash),
]);

export type SurveyInvite = typeof surveyInvitesTable.$inferSelect;
