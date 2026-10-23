-- 0019: catalogue standard fields (docs/KATALOG-STANDARD.md) — additive, nullable only.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS joint_stress_areas text[];
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS equipment_detail text[];
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS default_reps integer;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS default_duration_seconds integer;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS per_side boolean;

-- Backfill of the NEW columns only (idempotent: touches rows where the value is still empty).
UPDATE exercises
   SET role = CASE exercise_type WHEN 'Złożone' THEN 'główne' WHEN 'Izolowane' THEN 'pomocnicze' END
 WHERE role IS NULL;

-- A required field missing = "do weryfikacji" (not allowed for beginners / inactive clients once the rule is switched on).
UPDATE exercises
   SET verification_status = CASE
         WHEN main_muscle_group IS NOT NULL AND main_muscle_group <> ''
          AND cardinality(equipment) > 0
          AND cardinality(training_location) > 0
          AND movement_pattern IS NOT NULL
          AND difficulty_level IS NOT NULL
          AND learning_difficulty IS NOT NULL
          AND suitable_for_no_activity IS NOT NULL
          AND joint_stress IS NOT NULL
          AND execution_instructions IS NOT NULL AND execution_instructions <> ''
          AND role IS NOT NULL
         THEN 'zweryfikowane' ELSE 'do_weryfikacji' END
 WHERE verification_status IS NULL;
