import { pgTable, serial, integer, text, uuid, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { workoutPlanDaysTable } from "./plans";

// Moduł kondycyjny (migration 0054). Słownik celów: tabela plan_element_rules (czytana SQL-em w services/conditioning.ts).
export const planElementRulesTable = pgTable("plan_element_rules", {
  id: serial("id").primaryKey(),
  goal: text("goal").notNull(),
  element: text("element").notNull(),
  mode: text("mode").notNull(),
  perWeekMin: integer("per_week_min"),
  perWeekMax: integer("per_week_max"),
  note: text("note"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("plan_element_rules_goal_element_idx").on(t.goal, t.element)]);

export const conditioningLogsTable = pgTable("conditioning_logs", {
  id: serial("id").primaryKey(),
  clientUuid: uuid("client_uuid").notNull(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  planDayId: integer("plan_day_id").references(() => workoutPlanDaysTable.id, { onDelete: "set null" }),
  loggedOn: date("logged_on").notNull().defaultNow(),
  method: text("method").notNull(),
  tool: text("tool"),
  minutes: integer("minutes").notNull(),
  rpe: integer("rpe"),
  talkTest: text("talk_test"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("conditioning_logs_client_uuid_idx").on(t.clientUuid), index("conditioning_logs_client_idx").on(t.clientId, t.loggedOn)]);

export const conditioningCheckinsTable = pgTable("conditioning_checkins", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  felt: text("felt").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("conditioning_checkins_client_week_idx").on(t.clientId, t.weekStart)]);
