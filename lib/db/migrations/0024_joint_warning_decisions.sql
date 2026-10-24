-- 0024: decyzje trenera „Dodaj mimo to” przy ćwiczeniu obciążającym zgłoszony staw (24.10.2026). Tylko addytywnie.
CREATE TABLE IF NOT EXISTS joint_warning_decisions (
  id serial PRIMARY KEY,
  trainer_id integer NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_id integer,
  plan_exercise_id integer,
  exercise_id integer NOT NULL,
  exercise_name_snapshot text NOT NULL,
  joints text[] NOT NULL,
  decision text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS joint_warning_decisions_client_idx ON joint_warning_decisions (client_id, created_at);
