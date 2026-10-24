import { sql } from "drizzle-orm";
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
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { trainersTable } from "./trainers";
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

  // ── Generator fields (Phase 1) ────────────────────────────────────────────
  /** Training split canonical key — null for plans created before the generator.
   *  Allowed: full_body | full_body_ab | upper_lower | upper_lower_full_body |
   *           push_pull_legs | push_pull_lower_full_body | specialization | custom */
  splitType: text("split_type"),
  /** Mesocycle length in weeks (4–12). Null treated as 6 in application code. */
  blockDurationWeeks: integer("block_duration_weeks").default(6),
  /** JSON-serialized cardio recommendation — null until the trainer saves a recommendation */
  cardioRecommendation: text("cardio_recommendation"),
}, (table) => [
  index("workout_plans_client_id_idx").on(table.clientId),
  // A client has at most one active plan (activation archives the previous one) — migration 0027.
  uniqueIndex("workout_plans_one_active_per_client").on(table.clientId).where(sql`status = 'active'`),
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

// ─── Workout sessions (client execution layer) ───────────────────────────────
// One row per training day a client actually performs.

export const workoutSessionsTable = pgTable("workout_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => workoutPlansTable.id, { onDelete: "cascade" }),
  planDayId: integer("plan_day_id")
    .notNull()
    .references(() => workoutPlanDaysTable.id, { onDelete: "cascade" }),
  /** ISO date string YYYY-MM-DD */
  sessionDate: date("session_date").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  /** Optional client note for the whole session */
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  // ── Optional post-workout feedback (nullable, never blocks completion) ────
  /** Perceived difficulty 1–10 */
  difficultyRating: integer("difficulty_rating"),
  /** Whether the client reported pain during this session */
  hadPain: boolean("had_pain"),
  /** 'low' | 'medium' | 'high' */
  energyLevel: text("energy_level"),
  // ── Who ran the session (trainer-led vs self-directed) ────────────────────
  /** 'client' (default) | 'trainer' — who entered the results */
  performedBy: text("performed_by").notNull().default("client"),
  /** 'self_directed' (default) | 'in_person' */
  sessionMode: text("session_mode").notNull().default("self_directed"),
  /** Trainer who ran the session — set only when performedBy = 'trainer'. */
  performedByTrainerId: integer("performed_by_trainer_id").references(
    () => trainersTable.id,
    { onDelete: "set null" },
  ),
  // ── Tor C (trening podopiecznego), migration 0018 — all nullable ──────────
  /** Denormalised owner trainer (the client's trainer at session start); for isolation checks. */
  trainerId: integer("trainer_id").references(() => trainersTable.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  /** 'in_progress' | 'completed' | 'aborted'. NULL on rows created before 0018 (read via isCompleted). */
  status: text("status"),
  /** 'too_easy' | 'just_right' | 'too_hard' ("Jak było?"). Whole-session note for the trainer = `notes`. */
  sessionRating: text("session_rating"),
  /** Offline-sync idempotency key generated on the phone. */
  clientUuid: uuid("client_uuid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ws_client_uuid_idx").on(table.clientUuid).where(sql`${table.clientUuid} is not null`),
  index("ws_trainer_idx").on(table.trainerId),
  index("ws_client_plan_idx").on(table.clientId, table.planId),
  // Mirrors migration 0011: one active (not completed) session per client per plan day.
  uniqueIndex("ws_one_active_per_client_day")
    .on(table.clientId, table.planDayId)
    .where(sql`${table.isCompleted} = false`),
]);

// ─── Exercise execution logs ──────────────────────────────────────────────────
// One row per exercise within a session (upserted on every client save).

export const exerciseExecutionLogsTable = pgTable("exercise_execution_logs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => workoutSessionsTable.id, { onDelete: "cascade" }),
  // Nullable + SET NULL so deleting a plan exercise never wipes workout
  // history — the snapshot columns below keep the log readable.
  planExerciseId: integer("plan_exercise_id")
    .references(() => workoutPlanExercisesTable.id, { onDelete: "set null" }),
  setsCompleted: integer("sets_completed"),
  repsCompleted: integer("reps_completed"),
  weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
  rir: integer("rir"),
  note: text("note"),
  isCompleted: boolean("is_completed").notNull().default(false),
  // ── Snapshot of the prescription at execution time ────────────────────────
  // Keeps history readable even if the trainer later edits/removes the
  // plan exercise. exerciseId also enables previous-load matching by
  // clientId + exerciseId across plan changes.
  exerciseId: integer("exercise_id"),
  exerciseNameSnapshot: text("exercise_name_snapshot"),
  plannedSets: integer("planned_sets"),
  plannedRepMin: integer("planned_rep_min"),
  plannedRepMax: integer("planned_rep_max"),
  plannedRir: integer("planned_rir"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("eel_session_exercise_idx").on(table.sessionId, table.planExerciseId),
  // Mirrors migration 0010.
  index("eel_exercise_idx").on(table.exerciseId),
]);

// ─── Set logs (one row per performed set) ─────────────────────────────────────
// Per-set results from the "Trening" flow. exercise_execution_logs keeps the
// per-exercise aggregate used by the older plan screen.

export const setLogsTable = pgTable("set_logs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => workoutSessionsTable.id, { onDelete: "cascade" }),
  planExerciseId: integer("plan_exercise_id")
    .references(() => workoutPlanExercisesTable.id, { onDelete: "set null" }),
  exerciseId: integer("exercise_id").notNull(),
  exerciseNameSnapshot: text("exercise_name_snapshot"),
  setNumber: integer("set_number").notNull(),
  /** kg; NULL for bodyweight exercises (extra load optional) */
  weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
  reps: integer("reps"),
  /** 0–4, where 4 means "4+" */
  rir: integer("rir"),
  skipped: boolean("skipped").notNull().default(false),
  /** Idempotency key from the phone (offline queue retries never duplicate). */
  clientUuid: uuid("client_uuid").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("set_logs_client_uuid_idx").on(table.clientUuid),
  uniqueIndex("set_logs_session_exercise_set_idx").on(table.sessionId, table.exerciseId, table.setNumber),
  index("set_logs_exercise_idx").on(table.exerciseId),
  check("set_logs_rir_range", sql`${table.rir} is null or ${table.rir} between 0 and 4`),
  check("set_logs_values_nonneg", sql`(${table.weightKg} is null or ${table.weightKg} >= 0) and (${table.reps} is null or ${table.reps} >= 0)`),
]);

// ─── Pain reports ("Coś boli?") ───────────────────────────────────────────────

export const PAIN_AREAS = ["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek", "Inne"] as const;

export const painReportsTable = pgTable("pain_reports", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => workoutSessionsTable.id, { onDelete: "cascade" }),
  /** Denormalised so the trainer's inbox can filter without joining sessions. */
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id"),
  exerciseNameSnapshot: text("exercise_name_snapshot"),
  /** One of PAIN_AREAS */
  area: text("area").notNull(),
  /** 1–5 */
  severity: integer("severity").notNull(),
  /** optional, max 500 characters */
  description: text("description"),
  clientUuid: uuid("client_uuid").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** NULL = not yet read by the trainer */
  readByTrainerAt: timestamp("read_by_trainer_at"),
}, (table) => [
  uniqueIndex("pain_reports_client_uuid_idx").on(table.clientUuid),
  index("pain_reports_client_idx").on(table.clientId, table.createdAt),
  check("pain_reports_severity_range", sql`${table.severity} between 1 and 5`),
  check("pain_reports_description_len", sql`${table.description} is null or char_length(${table.description}) <= 500`),
  check("pain_reports_area", sql`${table.area} in ('Kolano','Biodro','Plecy — dół','Bark','Łokieć','Nadgarstek','Inne')`),
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type VolumeGuidelineVersion = typeof volumeGuidelineVersionsTable.$inferSelect;
export type VolumeTarget = typeof volumeTargetsTable.$inferSelect;
export type VolumeTargetMember = typeof volumeTargetMembersTable.$inferSelect;
export type VolumeGuideline = typeof volumeGuidelinesTable.$inferSelect;
export type WorkoutPlan = typeof workoutPlansTable.$inferSelect;
export type WorkoutPlanDay = typeof workoutPlanDaysTable.$inferSelect;
export type WorkoutPlanExercise = typeof workoutPlanExercisesTable.$inferSelect;
export type WorkoutSession = typeof workoutSessionsTable.$inferSelect;
export type ExerciseExecutionLog = typeof exerciseExecutionLogsTable.$inferSelect;
export type SetLog = typeof setLogsTable.$inferSelect;
export type PainReport = typeof painReportsTable.$inferSelect;
