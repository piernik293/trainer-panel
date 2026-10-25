-- 0028: odmiany ćwiczeń i status weryfikacji (25.10.2026). Tylko addytywnie: kolumny nullable lub z wartością domyślną.
-- parent_exercise_id: odmiana -> ćwiczenie główne (NULL dla głównych). reviewed_by_trainer: import = false (ustawiany w kodzie importu),
-- ręcznie dodane przez trenera i istniejące 'own' = true (domyślnie). hidden: ukryte nie trafia do generatora, nic nie jest usuwane.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS parent_exercise_id integer REFERENCES exercises(id);
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS variant_grip text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS variant_position text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS unilateral boolean;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS reviewed_by_trainer boolean NOT NULL DEFAULT true;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS intensity text;
CREATE INDEX IF NOT EXISTS exercises_parent_exercise_id_idx ON exercises (parent_exercise_id) WHERE parent_exercise_id IS NOT NULL;
