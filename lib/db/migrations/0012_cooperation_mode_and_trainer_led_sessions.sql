-- Cooperation mode per client + trainer-led session metadata.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "cooperation_mode" text NOT NULL DEFAULT 'online';

ALTER TABLE "workout_sessions"
  ADD COLUMN IF NOT EXISTS "performed_by" text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS "session_mode" text NOT NULL DEFAULT 'self_directed',
  ADD COLUMN IF NOT EXISTS "performed_by_trainer_id" integer REFERENCES "trainers"("id") ON DELETE SET NULL;
