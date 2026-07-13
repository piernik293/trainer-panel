-- Migration: add plan draft generator fields to workout_plans
-- Added as part of the Workout Plan Draft Generator (Phase 1).
-- Safe to run multiple times (IF NOT EXISTS / idempotent).
--
-- split_type: canonical training-split identifier (application-level validation).
--   Allowed values: full_body | full_body_ab | upper_lower | upper_lower_full_body |
--                   push_pull_legs | push_pull_lower_full_body | specialization | custom
--   null = plan was created before the generator feature was introduced.
--
-- block_duration_weeks: mesocycle length in weeks (4–12, default 6).
--   null on existing rows is treated as 6 by application code.

ALTER TABLE "workout_plans"
  ADD COLUMN IF NOT EXISTS "split_type"           text,
  ADD COLUMN IF NOT EXISTS "block_duration_weeks" integer DEFAULT 6;
