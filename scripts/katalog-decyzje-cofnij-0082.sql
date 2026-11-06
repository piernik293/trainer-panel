-- COFNIĘCIE migracji 0082 (decyzje 52–54): przywraca zapisane wartości. Uruchamiaj ręcznie po pg_dump. Nic nie usuwa.
UPDATE exercises e SET suitable_for_no_activity = b.suitable_for_no_activity, reviewed_by_trainer = b.reviewed_by_trainer, verification_status = b.verification_status,
  hidden = b.hidden, difficulty_level = b.difficulty_level, joint_stress_areas = b.joint_stress_areas, updated_at = now()
FROM catalogue_decision_backup b WHERE b.migration = '0082' AND b.exercise_id = e.id;
UPDATE exercise_ladder_steps s SET level = b.ladder_level FROM catalogue_decision_backup b WHERE b.migration = '0082' AND b.exercise_id = s.exercise_id AND b.ladder_level IS NOT NULL;
-- po cofnięciu usuń kopie, żeby ponowne uruchomienie migracji mogło zadziałać (opcjonalnie): DELETE FROM catalogue_decision_backup WHERE migration = '0082';
