-- Metody intensyfikacji (docs/METODY.md): wybór klienta w wywiadzie oraz metoda przy ćwiczeniu planu. Tylko nowe, puste kolumny.
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS preferred_methods text[] NOT NULL DEFAULT '{}';
ALTER TABLE workout_plan_exercises ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE workout_plan_exercises ADD COLUMN IF NOT EXISTS method_group integer;
ALTER TABLE workout_plan_exercises ADD COLUMN IF NOT EXISTS method_note text;
