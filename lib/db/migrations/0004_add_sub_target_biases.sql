-- Migration: add sub_target_biases column to exercises
-- Phase 1: Chest, Back, Shoulders sub-target bias weights for exercise selection quality.
--
-- sub_target_biases stores optional relative coaching-bias weights for sub-regions:
--   Chest:     upper_chest | mid_chest | lower_chest
--   Back:      lats | upper_back
--   Shoulders: front_delt | lateral_delt | rear_delt
--
-- Values are normalized proportions (should sum to ~1.0 per exercise).
-- They are NOT scientific measurements — they represent practical coaching bias.
-- null = no bias data; the selection engine falls back to base-score ordering.

ALTER TABLE "exercises"
  ADD COLUMN IF NOT EXISTS "sub_target_biases" jsonb;
