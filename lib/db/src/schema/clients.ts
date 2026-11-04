import { pgTable, serial, text, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  /** Daily steps goal (migration 0029); null = no goal. Set by the client or the trainer. */
  stepsGoal: integer("steps_goal"),
  /** Portal setting: end the cool-down with one calm breathing exercise (default off; the trainer does not control it). */
  breathingCooldown: boolean("breathing_cooldown").notNull().default(false),
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
  /**
   * Migration 0017: trainer's manual override of the experience level used by
   * the generator. NULL = effective level (client's choice, capped at
   * "Początkujący" when training experience is under 2 years).
   */
  experienceLevelOverride: text("experience_level_override"),
  /**
   * Migracja 0065: od kiedy prowadzący trener widzi dane osoby (wywiady, plany, treningi). NULL = od początku (cała historia).
   * Ustawiane przy akceptacji połączenia, gdy osoba z konta Solo NIE zgodziła się na udostępnienie wcześniejszej historii.
   */
  historyVisibleFrom: timestamp("history_visible_from"),
  /** Migracja 0069: opcjonalny nick (3–20 znaków, unikalny bez względu na wielkość liter) i kolor awatara (klucz z listy w portalu). */
  nick: text("nick"),
  /** Migracja 0071: znormalizowany klucz nicka (bez _ . i cyfr na końcu) — unikalny, blokuje „prawie identyczne” nicki. */
  nickKey: text("nick_key"),
  /** Migracja 0071: kiedy ostatnio zmieniono nick (zmiana najwyżej raz na 30 dni). */
  nickChangedAt: timestamp("nick_changed_at"),
  avatarColor: text("avatar_color"),
  /** Migracja 0070: nazwa wyświetlana w portalu (trener nadal widzi imię i nazwisko). */
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("clients_nick_lower_idx").on(sql`lower(${t.nick})`).where(sql`${t.nick} is not null`),
  uniqueIndex("clients_nick_key_idx").on(t.nickKey).where(sql`${t.nickKey} is not null`),
]);

/** Migracja 0071: stare nicki zablokowane dla innych osób na 30 dni po zmianie. */
export const nickHistoryTable = pgTable("nick_history", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  nick: text("nick").notNull(),
  nickKey: text("nick_key").notNull(),
  blockedUntil: timestamp("blocked_until").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
