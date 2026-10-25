-- 0029: kroki wpisywane ręcznie (25.10.2026). Tylko addytywnie: nowa tabela + kolumna nullable.
-- Unikalność (client_id, day) — ponowny wpis (np. z kolejki offline) nadpisuje wartość z tego dnia.
CREATE TABLE IF NOT EXISTS daily_steps (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  day date NOT NULL,
  steps integer NOT NULL CHECK (steps >= 0 AND steps <= 100000),
  source text NOT NULL DEFAULT 'ręcznie',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_steps_client_day_idx ON daily_steps (client_id, day);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS steps_goal integer;
