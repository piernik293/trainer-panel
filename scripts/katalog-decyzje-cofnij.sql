-- COFNIĘCIE migracji 0057 (katalog po decyzjach właściciela). Nie jest częścią migracji (nie uruchamia się automatycznie); uruchamiaj ręcznie po pg_dump.
-- Przywraca stare wartości z catalogue_decision_backup, a 11 dodanych ćwiczeń ukrywa i dezaktywuje (nic nie usuwa).
UPDATE exercises e SET suitable_for_no_activity = b.suitable_for_no_activity, reviewed_by_trainer = b.reviewed_by_trainer, verification_status = b.verification_status,
  hidden = b.hidden, difficulty_level = b.difficulty_level, updated_at = now()
FROM catalogue_decision_backup b WHERE b.migration = '0057' AND b.exercise_id = e.id;
UPDATE exercises SET hidden = true, is_active = false, updated_at = now() WHERE review_batch = 'katalog-decyzje-0057';
