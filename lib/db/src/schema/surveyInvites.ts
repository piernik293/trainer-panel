import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
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
});

export type SurveyInvite = typeof surveyInvitesTable.$inferSelect;
