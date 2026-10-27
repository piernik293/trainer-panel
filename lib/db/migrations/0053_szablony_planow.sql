-- Szablony planów trenera (blok 9: import z Excela jako szablon). Addytywnie; treść jako JSON (dni i ćwiczenia po id).
CREATE TABLE IF NOT EXISTS plan_templates (
  id serial PRIMARY KEY,
  trainer_id integer NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  title text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_templates_trainer_idx ON plan_templates (trainer_id, created_at);
