import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { surveysTable } from "./surveys";
import { specificMusclesTable } from "./muscles";
import { exercisesTable } from "./exercises";

// ─── Guideline versioning ─────────────────────────────────────────────────────
// Each version is immutable once referenced by any plan.

export const volumeGuidelineVersionsTable = pgTable("volume_guideline_versions", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  sourceDescription: text("source_description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Volume targets catalogue (closed list of 11 approved targets) ────────────

export const volumeTargetsTable = pgTable("volume_targets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** 'specific_muscle' for single direct entry; 'muscle_group' for composite */
  targetType: text("target_type").notNull(),
  broadCategory: text("broad_category").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// ─── Target → specific muscle members ────────────────────────────────────────

export const volumeTargetMembersTable = pgTable("volume_target_members", {
  id: serial("id").primaryKey(),
  volumeTargetId: integer("volume_target_id")
    .notNull()
    .references(() => volumeTargetsTable.id, { onDelete: "cascade" }),
  specificMuscleId: integer("specific_muscle_id")
    .notNull()
    .references(() => specificMusclesTable.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("vtm_target_muscle_idx").on(table.volumeTargetId, table.specificMuscleId),
]);

// ─── Volume guidelines (11 targets × 3 levels = 33 rows) ─────────────────────
// numeric used for all volume values to avoid float imprecision in validation.

export const volumeGuidelinesTable = pgTable("volume_guidelines", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id")
    .notNull()
    .references(() => volumeGuidelineVersionsTable.id, { onDelete: "restrict" }),
  experienceLevel: text("experience_level").notNull(),
  volumeTargetId: integer("volume_target_id")
    .notNull()
    .references(() => volumeTargetsTable.id, { onDelete: "restrict" }),
  sessionMin: numeric("session_min", { precision: 5, scale: 2 }).notNull(),
  sessionMax: numeric("session_max", { precision: 5, scale: 2 }).notNull(),
  weeklyPreferredCeiling: numeric("weekly_preferred_ceiling", { precision: 5, scale: 2 }).notNull(),
  weeklyAbsoluteCeiling: numeric("weekly_absolute_ceiling", { precision: 5, scale: 2 }).notNull(),
}, (table) => [
  uniqueIndex("vg_version_level_target_idx").on(
    table.versionId,
    table.experienceLevel,
    table.volumeTargetId,
  ),
]);

// ─── Workout plans ────────────────────────────────────────────────────────────

export const workoutPlansTable = pgTable("workout_plans", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  /** Snapshot reference — ON DELETE RESTRICT keeps plan valid if survey is deleted */
  surveyId: integer("survey_id")
    .notNull()
    .references(() => surveysTable.id, { onDelete: "restrict" }),
  guidelineVersionId: integer("guideline_version_id")
    .notNull()
    .references(() => volumeGuidelineVersionsTable.id, { onDelete: "restrict" }),
  /** Raw value from survey (e.g. "Brak aktywności fizycznej"). Mapped to guideline
   *  level at calculation time (Brak aktywności fizycznej → Początkujący). */
  experienceLevelUsed: text("experience_level_used").notNull(),
  title: text("title").notNull(),
  /** 'draft' | 'active' | 'archived' */
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  activatedAt: timestamp("activated_at"),
}, (table) => [
  index("workout_plans_client_id_idx").on(table.clientId),
]);

// ─── Workout plan days ────────────────────────────────────────────────────────

export const workoutPlanDaysTable = pgTable("workout_plan_days", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => workoutPlansTable.id, { onDelete: "cascade" }),
  dayOrder: integer("day_order").notNull(),
  dayName: text("day_name"),
}, (table) => [
  uniqueIndex("wpd_plan_day_order_idx").on(table.planId, table.dayOrder),
]);

// ─── Workout plan exercises ───────────────────────────────────────────────────

export const workoutPlanExercisesTable = pgTable("workout_plan_exercises", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id")
    .notNull()
    .references(() => workoutPlanDaysTable.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercisesTable.id),
  orderInDay: integer("order_in_day").notNull(),
  workingSets: integer("working_sets").notNull(),
  warmUpSets: integer("warm_up_sets").notNull().default(0),
  repRangeMin: integer("rep_range_min"),
  repRangeMax: integer("rep_range_max"),
  rirOrRpe: text("rir_or_rpe"),
  restSeconds: integer("rest_seconds"),
  notes: text("notes"),
}, (table) => [
  uniqueIndex("wpe_day_order_idx").on(table.dayId, table.orderInDay),
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type VolumeGuidelineVersion = typeof volumeGuidelineVersionsTable.$inferSelect;
export type VolumeTarget = typeof volumeTargetsTable.$inferSelect;
export type VolumeTargetMember = typeof volumeTargetMembersTable.$inferSelect;
export type VolumeGuideline = typeof volumeGuidelinesTable.$inferSelect;
export type WorkoutPlan = typeof workoutPlansTable.$inferSelect;
export type WorkoutPlanDay = typeof workoutPlanDaysTable.$inferSelect;
export type WorkoutPlanExercise = typeof workoutPlanExercisesTable.$inferSelect;
