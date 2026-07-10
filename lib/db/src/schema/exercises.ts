import { pgTable, serial, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Ćwiczenia — biblioteka ćwiczeń trenera. Zaprojektowana z myślą o przyszłym
// powiązaniu z edytorem planów treningowych, generowaniem planów przez AI,
// zamiennikami ćwiczeń oraz portalem klienta (patrz docs/03-exercise-library.md).
export const exercisesTable = pgTable("exercises", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  mainMuscleGroup: text("main_muscle_group").notNull(),
  secondaryMuscleGroups: text("secondary_muscle_groups").array().notNull().default([]),
  equipment: text("equipment").array().notNull().default([]),
  equipmentOther: text("equipment_other"),
  trainingLocation: text("training_location").array().notNull().default([]),
  difficultyLevel: text("difficulty_level"),
  movementPattern: text("movement_pattern"),
  description: text("description"),
  executionInstructions: text("execution_instructions"),
  commonMistakes: text("common_mistakes"),
  coachingTips: text("coaching_tips"),
  videoUrl: text("video_url"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("exercises_slug_idx").on(table.slug),
]);

export const insertExerciseSchema = createInsertSchema(exercisesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercisesTable.$inferSelect;
