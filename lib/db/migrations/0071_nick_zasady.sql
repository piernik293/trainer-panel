-- Zasady nicka: klucz „prawie identycznych” nicków (unikalny), data ostatniej zmiany (max raz na 30 dni) i blokada starych nicków na 30 dni. Addytywnie.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nick_key text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nick_changed_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS clients_nick_key_idx ON clients (nick_key) WHERE nick_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS nick_history (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nick text NOT NULL,
  nick_key text NOT NULL,
  blocked_until timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nick_history_key_idx ON nick_history (nick_key, blocked_until);
