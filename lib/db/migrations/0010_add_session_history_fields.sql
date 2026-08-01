-- 0010: workout history — session feedback + execution-log snapshots
-- All columns nullable; no data backfill required.

ALTER TABLE "workout_sessions"
  ADD COLUMN IF NOT EXISTS "difficulty_rating" integer,
  ADD COLUMN IF NOT EXISTS "had_pain" boolean,
  ADD COLUMN IF NOT EXISTS "energy_level" text;

ALTER TABLE "exercise_execution_logs"
  ADD COLUMN IF NOT EXISTS "exercise_id" integer,
  ADD COLUMN IF NOT EXISTS "exercise_name_snapshot" text,
  ADD COLUMN IF NOT EXISTS "planned_sets" integer,
  ADD COLUMN IF NOT EXISTS "planned_rep_min" integer,
  ADD COLUMN IF NOT EXISTS "planned_rep_max" integer,
  ADD COLUMN IF NOT EXISTS "planned_rir" integer;

-- Fast previous-result lookup by client + exercise.
CREATE INDEX IF NOT EXISTS "eel_exercise_idx" ON "exercise_execution_logs" ("exercise_id");
