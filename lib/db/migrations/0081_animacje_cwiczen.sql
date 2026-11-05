-- Animacje ćwiczeń (flaga EXERCISE_ANIMATIONS_ENABLED — nigdy nie włączana bez zgody właściciela). Dane animacji (kąty stawów w klatkach) przy ćwiczeniu + status zatwierdzenia. Addytywnie.
CREATE TABLE IF NOT EXISTS exercise_animations (
  id serial PRIMARY KEY,
  exercise_id integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  spec jsonb NOT NULL,
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('draft', 'review', 'approved')),
  review_note text,
  approved_by text,
  approved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exercise_animations_exercise_idx ON exercise_animations (exercise_id);
