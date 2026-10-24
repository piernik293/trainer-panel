-- Pochodzenie ćwiczeń (import z paczek): addytywnie, kolumny nullable.
-- Istniejące ćwiczenia dostają source = 'own' (wartość domyślna). Unikalność (source, source_id) tylko tam, gdzie jest source_id.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source text DEFAULT 'own';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS imported_at timestamp;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS review_batch text;
CREATE UNIQUE INDEX IF NOT EXISTS exercises_source_source_id_idx ON exercises (source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS exercises_review_batch_idx ON exercises (review_batch) WHERE review_batch IS NOT NULL;
