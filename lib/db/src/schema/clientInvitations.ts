import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { trainersTable } from "./trainers";

export const clientInvitationsTable = pgTable("client_invitations", {
  id: serial("id").primaryKey(),

  /** The client being invited to the portal. */
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),

  /** The trainer who created this invitation (ownership anchor). */
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => trainersTable.id, { onDelete: "cascade" }),

  /**
   * SHA-256 hash of the raw 64-hex-char token.
   * The raw token is returned to the trainer once and never stored.
   */
  tokenHash: text("token_hash").notNull().unique(),

  expiresAt: timestamp("expires_at").notNull(),

  /** Set when the invitation is consumed by the client's Clerk account. */
  usedAt: timestamp("used_at"),

  /** Set when the trainer explicitly revokes the invitation. */
  revokedAt: timestamp("revoked_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientInvitation = typeof clientInvitationsTable.$inferSelect;
