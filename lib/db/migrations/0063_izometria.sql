-- 0063: ćwiczenia izometryczne na czas (plank, hollow body hold, krzesełko, L-sit, V-sit, zwis na drążku). Tylko dodawanie.
--  * exercises.is_timed — oznaczenie ćwiczeń, które w planie mają czas (sekundy), nie powtórzenia
--  * set_logs.duration_seconds — czas wykonanej serii zapisany przez klienta w portalu
--  * wyzwalacz na workout_plan_exercises: ćwiczenie z is_timed zawsze dostaje typ „time” i sekundy według poziomu planu
--    (Brak aktywności 15 s, Początkujący 20 s, Średniozaawansowany 30 s, Zaawansowany 45 s; L-sit/V-sit nie więcej niż ich domyślny czas)
--  * istniejące wiersze planów są przeliczone jednorazowo, stare wartości w isometry_backup (cofnięcie: scripts/izometria-cofnij.sql)
-- Lista ćwiczeń: docs/IZOMETRIA.csv. Migracja jest idempotentna (db-setup uruchamia wszystkie migracje przy każdym przebiegu).
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_timed boolean NOT NULL DEFAULT false;
ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS duration_seconds integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'set_logs_duration_nonneg') THEN
    ALTER TABLE set_logs ADD CONSTRAINT set_logs_duration_nonneg CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 3600);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS isometry_backup (
  plan_exercise_id integer PRIMARY KEY,
  old_rep_type text,
  old_reps_exact integer,
  old_rep_range_min integer,
  old_rep_range_max integer,
  old_rep_time_seconds integer,
  backed_up_at timestamp NOT NULL DEFAULT now()
);

UPDATE exercises SET is_timed = true
WHERE name IN ('Plank', 'Plank boczny', 'Plank boczny na podwyższeniu', 'Hollow body hold', 'Krzesełko przy ścianie (wall sit)',
               'L-sit na podłodze', 'L-sit z podparciem', 'V-sit na podłodze', 'Zwis na drążku')
  AND is_timed = false;

CREATE OR REPLACE FUNCTION timed_prescription() RETURNS trigger AS $f$
DECLARE
  cap integer;
  lvl text;
  secs integer;
  found_timed boolean;
BEGIN
  IF NEW.exercise_id IS NULL THEN RETURN NEW; END IF;
  SELECT true, e.default_duration_seconds INTO found_timed, cap FROM exercises e WHERE e.id = NEW.exercise_id AND e.is_timed;
  IF found_timed IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.rep_type = 'time' AND NEW.rep_time_seconds IS NOT NULL AND NEW.rep_time_seconds > 0 THEN RETURN NEW; END IF;
  SELECT p.experience_level_used INTO lvl FROM workout_plan_days d JOIN workout_plans p ON p.id = d.plan_id WHERE d.id = NEW.day_id;
  secs := CASE lvl WHEN 'Brak aktywności fizycznej' THEN 15 WHEN 'Początkujący' THEN 20 WHEN 'Średniozaawansowany' THEN 30 WHEN 'Zaawansowany' THEN 45 ELSE 20 END;
  IF cap IS NOT NULL AND cap <= 15 THEN secs := LEAST(secs, cap); END IF;
  NEW.rep_type := 'time';
  NEW.rep_time_seconds := secs;
  NEW.reps_exact := NULL;
  NEW.rep_range_min := NULL;
  NEW.rep_range_max := NULL;
  NEW.rep_distance_meters := NULL;
  NEW.rep_open_instruction := NULL;
  RETURN NEW;
END;
$f$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'workout_plan_exercises_timed_trg') THEN
    CREATE TRIGGER workout_plan_exercises_timed_trg BEFORE INSERT OR UPDATE ON workout_plan_exercises
      FOR EACH ROW EXECUTE FUNCTION timed_prescription();
  END IF;
END $$;

-- jednorazowe przeliczenie istniejących planów (kopia starych wartości; powtórne uruchomienie nic nie zmienia)
INSERT INTO isometry_backup (plan_exercise_id, old_rep_type, old_reps_exact, old_rep_range_min, old_rep_range_max, old_rep_time_seconds)
SELECT pe.id, pe.rep_type, pe.reps_exact, pe.rep_range_min, pe.rep_range_max, pe.rep_time_seconds
FROM workout_plan_exercises pe JOIN exercises e ON e.id = pe.exercise_id
WHERE e.is_timed AND (pe.rep_type IS DISTINCT FROM 'time' OR pe.rep_time_seconds IS NULL OR pe.rep_time_seconds <= 0)
ON CONFLICT (plan_exercise_id) DO NOTHING;

UPDATE workout_plan_exercises SET rep_type = rep_type WHERE id IN (SELECT plan_exercise_id FROM isometry_backup);
