-- Własny plan w Solo: ćwiczenia własne osoby (nieaktywne i ukryte — nie trafiają do katalogu, generatora ani list trenerów). Addytywnie, nullable.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS created_by_client_id integer REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS exercises_created_by_client_idx ON exercises (created_by_client_id) WHERE created_by_client_id IS NOT NULL;
