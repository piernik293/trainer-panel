-- Migration 0007: Add adaptive_start_decision to clients
--
-- Stores the trainer's explicit decision on the adaptive-start recommendation
-- for clients classified as beginners or sedentary:
--   NULL     — no decision yet (recommendation pending)
--   pending  — recommendation shown, awaiting trainer action (same as NULL for display)
--   accepted — trainer chose adaptive-start generator mode
--   declined — trainer chose the normal generator
--
-- The constraint is advisory; application-level validation enforces the enum.

ALTER TABLE clients
  ADD COLUMN adaptive_start_decision TEXT
    CHECK (adaptive_start_decision IN ('pending', 'accepted', 'declined'));
