-- Migration: add adaptation fields to exercises table
-- Phase A: Exercise Library adaptation support.
-- Safe to run multiple times (IF NOT EXISTS / idempotent).
--
-- suitable_for_no_activity: marks exercises confirmed safe for "Brak aktywności fizycznej"
--   clients. null = not yet assessed; true = confirmed suitable.
--
-- movement_complexity: human-readable movement complexity tier used by the
--   adaptation filter and plan generator.
--   Allowed values: 'Prosta' | 'Umiarkowana' | 'Złożona'
--   null = not yet assigned.

ALTER TABLE "exercises"
  ADD COLUMN IF NOT EXISTS "suitable_for_no_activity" boolean,
  ADD COLUMN IF NOT EXISTS "movement_complexity"       text;
