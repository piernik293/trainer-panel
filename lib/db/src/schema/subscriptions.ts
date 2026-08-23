import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clientsTable } from "./clients";
import { trainersTable } from "./trainers";

export const trainerSubscriptionsTable = pgTable(
  "trainer_subscriptions",
  {
    trainerId: integer("trainer_id")
      .primaryKey()
      .references(() => trainersTable.id, { onDelete: "cascade" }),
    planCode: text("plan_code").notNull().default("FREE"),
    status: text("status").notNull().default("active"),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("trainer_subscriptions_plan_code_check", sql`${table.planCode} IN ('FREE', 'PRO', 'UNLIMITED')`),
    check(
      "trainer_subscriptions_status_check",
      sql`${table.status} IN ('active', 'trialing', 'past_due', 'canceled')`,
    ),
  ],
);

export const trainerGenerationSessionsTable = pgTable(
  "trainer_generation_sessions",
  {
    id: uuid("id").primaryKey(),
    trainerId: integer("trainer_id")
      .notNull()
      .references(() => trainersTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    expectedDayCount: integer("expected_day_count").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("trainer_generation_sessions_period_idx").on(table.trainerId, table.periodStart),
    check(
      "trainer_generation_sessions_day_count_check",
      sql`${table.expectedDayCount} BETWEEN 1 AND 7`,
    ),
    check(
      "trainer_generation_sessions_status_check",
      sql`${table.status} IN ('active', 'completed')`,
    ),
  ],
);

export const trainerGenerationSessionDaysTable = pgTable(
  "trainer_generation_session_days",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => trainerGenerationSessionsTable.id, { onDelete: "cascade" }),
    dayIndex: integer("day_index").notNull(),
    requestHash: text("request_hash").notNull(),
    outputExerciseIds: integer("output_exercise_ids").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.dayIndex] }),
    check("trainer_generation_session_days_index_check", sql`${table.dayIndex} BETWEEN 0 AND 6`),
  ],
);

export type TrainerSubscription = typeof trainerSubscriptionsTable.$inferSelect;
export type TrainerGenerationSession = typeof trainerGenerationSessionsTable.$inferSelect;