import { pgTable, serial, text, timestamp, boolean, uniqueIndex, integer, jsonb } from "drizzle-orm/pg-core";
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
  /** equipmentAllOf: every listed item must be available (AND semantics). */
  requiredEquipmentAll: text("required_equipment_all").array().notNull().default([]),
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
  // Section 1 — Basic Information
  exerciseType: text("exercise_type"), // "Złożone" | "Izolowane"

  // Section 2 — Coaching Information
  breathingTips: text("breathing_tips"),
  safetyNotes: text("safety_notes"),
  tempo: text("tempo"),
  rangeOfMotion: text("range_of_motion"),

  // Section 4 — AI Exercise Intelligence
  suitableExperienceLevels: text("suitable_experience_levels").array().notNull().default([]),
  trainingGoals: text("training_goals").array().notNull().default([]),
  movementCategory: text("movement_category"),
  planeOfMotion: text("plane_of_motion"),
  execution: text("execution"), // "Obustronne" | "Jednostronne"
  resistanceType: text("resistance_type"),
  requiresSpotter: boolean("requires_spotter"),
  canBePerformedToFailure: text("can_be_performed_to_failure"), // "Tak" | "Nie" | "Z ostrożnością"
  jointStress: text("joint_stress"), // "Niskie" | "Średnie" | "Wysokie"
  learningDifficulty: integer("learning_difficulty"), // 1–5
  neurologicalFatigue: integer("neurological_fatigue"), // 1–5
  domsPotential: integer("doms_potential"), // 1–5
  exercisePriority: text("exercise_priority"), // "Bardzo wysoki" | "Wysoki" | "Średni" | "Niski"

  // Phase A — Adaptation support
  /** true = confirmed suitable for "Brak aktywności fizycznej" clients (Start adaptacyjny segment) */
  suitableForNoActivity: boolean("suitable_for_no_activity"),
  /** "Prosta" | "Umiarkowana" | "Złożona" — derived from learningDifficulty, overridden for suitableForNoActivity */
  movementComplexity: text("movement_complexity"),

  /**
   * Sub-target bias weights for exercise selection quality (Phase 1: Chest / Back / Shoulders).
   * Shape: { upper_chest?, mid_chest?, lower_chest?, lats?, upper_back?,
   *           front_delt?, lateral_delt?, rear_delt? }
   * Values are relative coaching-bias proportions (should sum to ~1.0 per exercise).
   * null = no data; selection engine falls back to base-score ordering.
   */
  subTargetBiases: jsonb("sub_target_biases"),

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
