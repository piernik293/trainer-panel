-- 0025: historia zmian planu (kto, kiedy, co na co) — np. zamiana ćwiczenia na zgłoszony staw (24.10.2026). Tylko addytywnie.
CREATE TABLE IF NOT EXISTS plan_change_log (
  id serial PRIMARY KEY,
  plan_id integer NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  trainer_id integer REFERENCES trainers(id) ON DELETE SET NULL,
  kind text NOT NULL,
  plan_exercise_id integer,
  from_exercise_id integer,
  from_exercise_name text,
  to_exercise_id integer,
  to_exercise_name text,
  details text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_change_log_plan_idx ON plan_change_log (plan_id, created_at);
