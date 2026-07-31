-- Migration 0009: structured restriction confirmation on surveys
--
-- Stores the trainer's confirmed restrictions as a JSON array.
-- Each element: { bodyArea, movementPattern, action }.
-- The raw healthLimitations free-text remains unchanged.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS confirmed_restrictions TEXT;
