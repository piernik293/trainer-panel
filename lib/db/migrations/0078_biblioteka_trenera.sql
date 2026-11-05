-- Biblioteka trenera (flaga TRAINER_LIBRARY_ENABLED): zgoda na wspólną bibliotekę, status propozycji, opcja „używaj moich w generatorze”, dziennik akcji admina. Addytywnie.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS share_consent boolean NOT NULL DEFAULT false;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS share_consent_at timestamp;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS share_status text NOT NULL DEFAULT 'none' CHECK (share_status IN ('none', 'proposed', 'added', 'rejected'));
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS share_reject_reason text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS shared_copy_exercise_id integer;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS use_own_exercises_in_generator boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS exercise_proposal_log (
  id serial PRIMARY KEY,
  exercise_id integer NOT NULL,
  actor_clerk_user_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('added', 'rejected')),
  reason text,
  copy_exercise_id integer,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exercise_proposal_log_ex_idx ON exercise_proposal_log (exercise_id, created_at);
