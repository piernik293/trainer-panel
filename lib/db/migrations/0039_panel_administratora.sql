-- 0039: panel administratora (blok 3): blokada konta trenera, dziennik błędów, dziennik dostępu do danych. Tylko dodawanie.
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS blocked_at timestamp;

-- własny dziennik błędów (bez płatnych usług); opis jest oczyszczany przed zapisem, retencja 90 dni (czyszczenie w kodzie)
CREATE TABLE IF NOT EXISTS app_errors (
  id serial PRIMARY KEY,
  fingerprint text NOT NULL,
  source text NOT NULL CHECK (source IN ('api', 'panel', 'portal')),
  place text NOT NULL,
  message text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  users_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed')),
  first_seen timestamp NOT NULL DEFAULT now(),
  last_seen timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS app_errors_fingerprint_idx ON app_errors (fingerprint);
CREATE INDEX IF NOT EXISTS app_errors_last_seen_idx ON app_errors (last_seen);

-- różni użytkownicy błędu: tylko skrót (nie identyfikator konta)
CREATE TABLE IF NOT EXISTS app_error_users (
  error_id integer NOT NULL REFERENCES app_errors(id) ON DELETE CASCADE,
  user_hash text NOT NULL,
  PRIMARY KEY (error_id, user_hash)
);

-- dziennik dostępu administratora do danych podopiecznego: kto, kiedy, co, po co; nieusuwalny (wyzwalacz blokuje zmiany)
CREATE TABLE IF NOT EXISTS admin_access_log (
  id serial PRIMARY KEY,
  admin_clerk_id text NOT NULL,
  action text NOT NULL,
  target_client_id integer,
  reason text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_access_log_created_idx ON admin_access_log (created_at);

CREATE OR REPLACE FUNCTION admin_access_log_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'Dziennik dostępu jest nieusuwalny i niezmienny.';
END
$fn$ LANGUAGE plpgsql;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'admin_access_log_immutable_trg') THEN
    CREATE TRIGGER admin_access_log_immutable_trg BEFORE UPDATE OR DELETE ON admin_access_log
      FOR EACH ROW EXECUTE FUNCTION admin_access_log_immutable();
  END IF;
END
$do$;
