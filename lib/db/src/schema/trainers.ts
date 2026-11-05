import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const trainersTable = pgTable("trainers", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name"),
  email: text("email"),
  /** Kod/link do dołączenia podopiecznych (migration 0038); NULL = jeszcze nie wygenerowany. Nowy kod unieważnia stary. */
  joinCode: text("join_code"),
  joinCodeCreatedAt: timestamp("join_code_created_at"),

  /** Migracja 0078: generator może używać WŁASNYCH, kompletnych ćwiczeń trenera (domyślnie nie). */
  useOwnExercisesInGenerator: boolean("use_own_exercises_in_generator").notNull().default(false),

  /** Blokada konta przez administratora (migration 0039); NULL = konto aktywne. */
  blockedAt: timestamp("blocked_at"),
  /** Migracja 0066: okres próbny (14 dni z pełnym dostępem); po nim obowiązuje plan trenera (domyślnie Free). */
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Trainer = typeof trainersTable.$inferSelect;
export type InsertTrainer = typeof trainersTable.$inferInsert;
