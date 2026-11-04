-- „Złote Byczki” (kampania, docs/CENNIK.md): numerowana odznaka dla pierwszych trenerów (pula 10) i osób Solo (pula 100). Addytywnie.
CREATE TABLE IF NOT EXISTS golden_bulls (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('trainer', 'solo')),
  number integer NOT NULL,
  clerk_user_id text NOT NULL,
  trainer_id integer REFERENCES trainers(id) ON DELETE SET NULL,
  client_id integer REFERENCES clients(id) ON DELETE SET NULL,
  granted_at timestamp NOT NULL DEFAULT now(),
  granted_by text NOT NULL DEFAULT 'auto',
  reason text,
  -- trener: do kiedy Pro gratis; Solo: do kiedy przyszłe płatne funkcje gratis (od startu osoby)
  perks_until timestamp,
  revoked_at timestamp,
  revoked_reason text,
  revoked_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS golden_bulls_kind_number_idx ON golden_bulls (kind, number);
CREATE UNIQUE INDEX IF NOT EXISTS golden_bulls_clerk_kind_idx ON golden_bulls (clerk_user_id, kind);
