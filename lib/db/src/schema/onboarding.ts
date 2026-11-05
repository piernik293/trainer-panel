import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";

/** Migracja 0079: stan samouczka trenera. Kroki liczone z danych (klient, zaproszenie/wywiad, plan, aktywny plan); tu tylko pominięcie, ukończenie i klient przykładowy. */
export const onboardingStateTable = pgTable("onboarding_state", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id").notNull().references(() => trainersTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  dismissedAt: timestamp("dismissed_at"),
  completedAt: timestamp("completed_at"),
  completedMinutes: integer("completed_minutes"),
  exampleClientId: integer("example_client_id"),
}, (t) => [uniqueIndex("onboarding_state_trainer_idx").on(t.trainerId)]);
