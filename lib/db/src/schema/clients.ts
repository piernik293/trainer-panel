import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trainersTable } from "./trainers";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  /** FK to trainers.id — assigned server-side; nullable until migration Step C completes */
  trainerId: integer("trainer_id").references(() => trainersTable.id),
  /**
   * Clerk user ID for the client's own portal account.
   * Nullable — clients without a portal account have no Clerk identity.
   * Set when the client first authenticates through the client portal.
   */
  clerkUserId: text("clerk_user_id").unique(),
  /**
   * Trainer's explicit decision on the adaptive-start recommendation.
   * null    = no decision yet (recommendation pending for eligible clients)
   * pending = recommendation shown, awaiting trainer action
   * accepted = trainer chose adaptive-start generator mode
   * declined = trainer chose the normal generator
   */
  adaptiveStartDecision: text("adaptive_start_decision"),
  /**
   * Forma współpracy — how the trainer works with this client.
   * 'online' | 'in_person' | 'hybrid'. Existing clients default to 'online'
   * (current behavior: client executes the plan alone in the portal).
   */
  cooperationMode: text("cooperation_mode").notNull().default("online"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
