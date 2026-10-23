-- 0018: trening podopiecznego (tor C) — additive only.
-- workout_sessions gets nullable columns (the table already exists with data of
-- the older per-exercise flow); set_logs and pain_reports are new tables.
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS trainer_id integer REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS started_at timestamp;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS ended_at timestamp;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS session_rating text;
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ws_client_uuid_idx ON workout_sessions (client_uuid) WHERE client_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS ws_trainer_idx ON workout_sessions (trainer_id);

CREATE TABLE IF NOT EXISTS set_logs (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  plan_exercise_id integer REFERENCES workout_plan_exercises(id) ON DELETE SET NULL,
  exercise_id integer NOT NULL,
  exercise_name_snapshot text,
  set_number integer NOT NULL,
  weight_kg numeric(6,2),
  reps integer,
  rir integer,
  skipped boolean NOT NULL DEFAULT false,
  client_uuid uuid NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT set_logs_rir_range CHECK (rir IS NULL OR rir BETWEEN 0 AND 4),
  CONSTRAINT set_logs_values_nonneg CHECK ((weight_kg IS NULL OR weight_kg >= 0) AND (reps IS NULL OR reps >= 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS set_logs_client_uuid_idx ON set_logs (client_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS set_logs_session_exercise_set_idx ON set_logs (session_id, exercise_id, set_number);
CREATE INDEX IF NOT EXISTS set_logs_exercise_idx ON set_logs (exercise_id);

CREATE TABLE IF NOT EXISTS pain_reports (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  exercise_id integer,
  exercise_name_snapshot text,
  area text NOT NULL,
  severity integer NOT NULL,
  description text,
  client_uuid uuid NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  read_by_trainer_at timestamp,
  CONSTRAINT pain_reports_severity_range CHECK (severity BETWEEN 1 AND 5),
  CONSTRAINT pain_reports_description_len CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT pain_reports_area CHECK (area IN ('Kolano','Biodro','Plecy — dół','Bark','Łokieć','Nadgarstek','Inne'))
);
CREATE UNIQUE INDEX IF NOT EXISTS pain_reports_client_uuid_idx ON pain_reports (client_uuid);
CREATE INDEX IF NOT EXISTS pain_reports_client_idx ON pain_reports (client_id, created_at);
