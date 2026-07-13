-- Migration: add avoided-exercise columns to surveys table
-- Added as part of the Client Avoided Exercises feature.
-- Safe to run multiple times (IF NOT EXISTS / idempotent).

ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "avoided_exercise_ids"     integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "avoided_exercise_reasons" jsonb     NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "avoided_exercise_other_text"   text,
  ADD COLUMN IF NOT EXISTS "avoided_exercise_other_reason" text;
