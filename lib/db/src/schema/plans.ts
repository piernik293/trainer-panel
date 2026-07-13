import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  numeric,
  date,
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
  /** Training goal for this plan (free text, separate from survey goal) */
  goal: text("goal"),
  /** Plan description / overview */
  description: text("description"),
  /** Plan start date (ISO date string YYYY-MM-DD) */
  startDate: date("start_date"),
  /** Plan end date (ISO date string YYYY-MM-DD) */
  endDate: date("end_date"),
  /** Private trainer notes — must not be shown to client */
  trainerNotes: text("trainer_notes"),
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
  /** Short subtitle, e.g. "Góra ciała" */
  subtitle: text("subtitle"),
  /** Optional day description */
  description: text("description"),
  /** Estimated session duration in minutes */
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  /** Private trainer notes for this day */
  trainerNotes: text("trainer_notes"),
}, (table) => [
  // Changed from uniqueIndex to index to allow safe bulk reordering.
  // Application code maintains order integrity.
  index("wpd_plan_day_order_idx").on(table.planId, table.dayOrder),
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

  // ── Repetition prescription ───────────────────────────────────────────────
  /** 'exact' | 'range' | 'time' | 'distance' | 'open' */
  repType: text("rep_type"),
  /** For repType='exact': number of reps */
  repsExact: integer("reps_exact"),
  /** For repType='range': min reps (also used as legacy min) */
  repRangeMin: integer("rep_range_min"),
  /** For repType='range': max reps (also used as legacy max) */
  repRangeMax: integer("rep_range_max"),
  /** For repType='time': duration in seconds */
  repTimeSeconds: integer("rep_time_seconds"),
  /** For repType='distance': distance in metres */
  repDistanceMeters: integer("rep_distance_meters"),
  /** For repType='open': free text instruction (e.g. 'AMRAP') */
  repOpenInstruction: text("rep_open_instruction"),

  // ── Load prescription ─────────────────────────────────────────────────────
  /** 'fixed' | 'percent_1rm' | 'bodyweight' | 'bw_plus' | 'assisted' | 'custom' */
  loadType: text("load_type"),
  /** Numeric load value (kg, %, extra kg) stored as text for flexibility */
  loadValue: text("load_value"),
  /** Free text instruction for loadType='custom' */
  loadInstruction: text("load_instruction"),

  // ── Intensity ─────────────────────────────────────────────────────────────
  /** Reps in Reserve (0–5) */
  rir: integer("rir"),
  /** Rate of Perceived Exertion (1–10, stored as text for half-values) */
  rpe: text("rpe"),
  /** Legacy combined RIR/RPE free text (kept for backward compat) */
  rirOrRpe: text("rir_or_rpe"),

  // ── Technique ─────────────────────────────────────────────────────────────
  /** Four-part tempo notation, e.g. "3-1-1-0" */
  tempo: text("tempo"),
  /** Rest between sets in seconds */
  restSeconds: integer("rest_seconds"),

  // ── Notes ─────────────────────────────────────────────────────────────────
  /** Private trainer notes */
  notes: text("notes"),
  /** Client-facing instructions — shown to client in the future portal */
  clientInstructions: text("client_instructions"),
}, (table) => [
  // Changed from uniqueIndex to index to allow safe bulk reordering.
  index("wpe_day_order_idx").on(table.dayId, table.orderInDay),
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type VolumeGuidelineVersion = typeof volumeGuidelineVersionsTable.$inferSelect;
export type VolumeTarget = typeof volumeTargetsTable.$inferSelect;
export type VolumeTargetMember = typeof volumeTargetMembersTable.$inferSelect;
export type VolumeGuideline = typeof volumeGuidelinesTable.$inferSelect;
export type WorkoutPlan = typeof workoutPlansTable.$inferSelect;
export type WorkoutPlanDay = typeof workoutPlanDaysTable.$inferSelect;
export type WorkoutPlanExercise = typeof workoutPlanExercisesTable.$inferSelect;
