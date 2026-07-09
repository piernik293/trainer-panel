import { pgTable, serial, integer, text, timestamp, uniqueIndex, index, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const surveysTable = pgTable("surveys", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  trainingGoal: text("training_goal"),
  experienceLevel: text("experience_level"),
  trainingDuration: text("training_duration"),
  healthLimitations: text("health_limitations"),
  weeklyFrequency: integer("weekly_frequency"),
  desiredWeeklyFrequency: integer("desired_weekly_frequency"),
  sessionDuration: text("session_duration"),
  preferredMuscles: text("preferred_muscles"),
  avoidedMuscles: text("avoided_muscles"),
  avoidedExercises: text("avoided_exercises"),
  favoriteExercises: text("favorite_exercises"),
  advancedMethodsToAvoid: text("advanced_methods_to_avoid").array().notNull().default([]),
  additionalInfo: text("additional_info"),
  // Dane podstawowe
  age: integer("age"),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  heightCm: integer("height_cm"),
  weightKg: integer("weight_kg"),
  // Aktywność fizyczna / regeneracja / stres
  activityLevel: text("activity_level"),
  sleepHours: text("sleep_hours"),
  stressLevel: integer("stress_level"),
  // Preferencje planu
  planStylePreference: text("plan_style_preference"),
  // Priorytetowe partie mięśniowe (ranking); preferredMuscles pozostaje jako legacy wolny tekst
  priorityMuscle1: text("priority_muscle_1"),
  priorityMuscle2: text("priority_muscle_2"),
  priorityMuscle3: text("priority_muscle_3"),
  // Miejsce treningu i sprzęt
  trainingLocation: text("training_location"),
  equipment: text("equipment"),
  // Cardio
  cardioPreference: text("cardio_preference"),
  cardioFrequency: text("cardio_frequency"),
  preferredCardioType: text("preferred_cardio_type"),
  // Czy klient ma przeciwwskazania do metod intensyfikacji (pytanie tak/nie, poprzedzające listę checkboxów)
  avoidsAdvancedMethods: boolean("avoids_advanced_methods"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Speeds up "latest survey per client" lookups (DISTINCT ON client_id ORDER BY created_at desc)
  // used by the client list, dashboard, and training-goals endpoints.
  index("surveys_client_id_created_at_idx").on(table.clientId, table.createdAt.desc()),
]);

export const insertSurveySchema = createInsertSchema(surveysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveysTable.$inferSelect;
