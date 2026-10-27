-- 0038: link i kod trenera, prośby o dołączenie, historia połączeń (blok 2). Tylko dodawanie.
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS join_code text;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS join_code_created_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS trainers_join_code_idx ON trainers (join_code) WHERE join_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS trainer_join_requests (
  id serial PRIMARY KEY,
  trainer_id integer NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamp NOT NULL DEFAULT now(),
  decided_at timestamp
);
-- jedna oczekująca prośba na parę trener–osoba
CREATE UNIQUE INDEX IF NOT EXISTS trainer_join_requests_pending_idx ON trainer_join_requests (trainer_id, client_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS trainer_join_requests_trainer_idx ON trainer_join_requests (trainer_id, status);

-- historia połączeń z trenerem (kto, kiedy); nic nie jest usuwane
CREATE TABLE IF NOT EXISTS client_link_events (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id integer REFERENCES trainers(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('joined', 'disconnected')),
  by_side text NOT NULL CHECK (by_side IN ('trainer', 'client')),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_link_events_client_idx ON client_link_events (client_id, created_at);
