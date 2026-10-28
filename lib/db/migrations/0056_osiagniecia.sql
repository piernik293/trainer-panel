-- Osiągnięcia (blok 4, docs/OSIAGNIECIA.md): dwie nowe tabele, nic w istniejących. Domyślnie nieużywane (przełącznik ACHIEVEMENTS_ENABLED).
-- Unikalność (client_id, kind, key) zapewnia idempotencję: ponowne liczenie i zdublowane sesje nie tworzą drugiego osiągnięcia.
CREATE TABLE IF NOT EXISTS client_achievements (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('week_streak', 'record', 'milestone', 'first_month', 'ladder_step', 'steps_week', 'month_challenge')),
  key text NOT NULL,
  title text NOT NULL,
  body text,
  earned_at timestamp NOT NULL DEFAULT now(),
  session_id integer REFERENCES workout_sessions(id) ON DELETE SET NULL,
  seen_at timestamp,
  detail jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS client_achievements_unique_idx ON client_achievements (client_id, kind, key);
CREATE INDEX IF NOT EXISTS client_achievements_client_idx ON client_achievements (client_id, earned_at);

-- Urlop / choroba: tygodnie w okresie są neutralne dla serii (nie zaliczają, nie przerywają, nie zużywają ochrony).
CREATE TABLE IF NOT EXISTS client_pauses (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('urlop', 'choroba', 'inne')),
  set_by text NOT NULL CHECK (set_by IN ('client', 'trainer')),
  created_at timestamp NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS client_pauses_client_idx ON client_pauses (client_id, start_date);
