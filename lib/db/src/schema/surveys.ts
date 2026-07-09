import { pgTable, serial, integer, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const surveysTable = pgTable("surveys", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .unique()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  trainingGoal: text("training_goal"),
  experienceLevel: text("experience_level"),
  trainingDuration: text("training_duration"),
  healthLimitations: text("health_limitations"),
  weeklyFrequency: integer("weekly_frequency"),
  sessionDuration: text("session_duration"),
  preferredMuscles: text("preferred_muscles"),
  avoidedMuscles: text("avoided_muscles"),
  avoidedExercises: text("avoided_exercises"),
  favoriteExercises: text("favorite_exercises"),
  advancedMethodsToAvoid: text("advanced_methods_to_avoid").array().notNull().default([]),
  additionalInfo: text("additional_info"),
  // Dane podstawowe
  age: integer("age"),
  gender: text("gender"),
  heightCm: integer("height_cm"),
  weightKg: integer("weight_kg"),
  // Aktywność fizyczna / regeneracja / stres
  activityLevel: text("activity_level"),
  sleepHours: text("sleep_hours"),
  stressLevel: integer("stress_level"),
  // Preferencje planu
  planStylePreference: text("plan_style_preference"),
  // Czy klient ma przeciwwskazania do metod intensyfikacji (pytanie tak/nie, poprzedzające listę checkboxów)
  avoidsAdvancedMethods: boolean("avoids_advanced_methods"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSurveySchema = createInsertSchema(surveysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveysTable.$inferSelect;
