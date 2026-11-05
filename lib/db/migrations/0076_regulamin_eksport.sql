-- Regulamin (zgoda z wersją i datą) oraz dziennik eksportu danych użytkownika („Pobierz moje dane”). Addytywnie.
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id serial PRIMARY KEY,
  clerk_user_id text NOT NULL,
  version text NOT NULL,
  accepted_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS terms_acceptances_user_version_idx ON terms_acceptances (clerk_user_id, version);
CREATE TABLE IF NOT EXISTS data_exports (
  id serial PRIMARY KEY,
  clerk_user_id text NOT NULL,
  role text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_exports_user_idx ON data_exports (clerk_user_id, created_at);
