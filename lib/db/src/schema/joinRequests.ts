import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { trainersTable } from "./trainers";
import { clientsTable } from "./clients";

// Prośby o dołączenie do trenera (migration 0038). Kod/link trenera: kolumny trainers.join_code (patrz trainers.ts).
export const trainerJoinRequestsTable = pgTable("trainer_join_requests", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id").notNull().references(() => trainersTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  /** 'pending' | 'accepted' | 'rejected' */
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
}, (t) => [
  uniqueIndex("trainer_join_requests_pending_idx").on(t.trainerId, t.clientId).where(sql`status = 'pending'`),
  index("trainer_join_requests_trainer_idx").on(t.trainerId, t.status),
]);

export const clientLinkEventsTable = pgTable("client_link_events", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  trainerId: integer("trainer_id").references(() => trainersTable.id, { onDelete: "set null" }),
  /** 'joined' | 'disconnected' */
  kind: text("kind").notNull(),
  /** 'trainer' | 'client' */
  bySide: text("by_side").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("client_link_events_client_idx").on(t.clientId, t.createdAt)]);
