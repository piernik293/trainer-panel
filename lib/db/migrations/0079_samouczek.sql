-- Samouczek trenera (flaga ONBOARDING_ENABLED): stan na koncie (pominięcie, ukończenie, klient przykładowy). Addytywnie.
CREATE TABLE IF NOT EXISTS onboarding_state (
  id serial PRIMARY KEY,
  trainer_id integer NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  started_at timestamp NOT NULL DEFAULT now(),
  dismissed_at timestamp,
  completed_at timestamp,
  completed_minutes integer,
  example_client_id integer
);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_state_trainer_idx ON onboarding_state (trainer_id);
