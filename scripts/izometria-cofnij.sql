-- Cofnięcie 0063 (dane): przywraca stare powtórzenia w planach i zdejmuje oznaczenie „na czas”. Kolumn i wyzwalacza nie usuwamy (zasada: schemat tylko addytywnie).
-- Najpierw wyłączamy wyzwalacz tylko na czas przywracania.
ALTER TABLE workout_plan_exercises DISABLE TRIGGER workout_plan_exercises_timed_trg;
UPDATE workout_plan_exercises pe SET rep_type = b.old_rep_type, reps_exact = b.old_reps_exact, rep_range_min = b.old_rep_range_min,
  rep_range_max = b.old_rep_range_max, rep_time_seconds = b.old_rep_time_seconds
FROM isometry_backup b WHERE b.plan_exercise_id = pe.id;
UPDATE exercises SET is_timed = false WHERE is_timed;
ALTER TABLE workout_plan_exercises ENABLE TRIGGER workout_plan_exercises_timed_trg;
