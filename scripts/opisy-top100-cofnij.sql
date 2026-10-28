-- COFNIĘCIE migracji 0061 (opisy i wskazówki): przywraca stare teksty z catalogue_text_backup. Nie jest częścią migracji; uruchamiaj ręcznie po pg_dump.
UPDATE exercises e SET description = b.description, execution_instructions = b.execution_instructions, coaching_tips = b.coaching_tips, common_mistakes = b.common_mistakes, updated_at = now()
FROM catalogue_text_backup b WHERE b.migration = '0061' AND b.exercise_id = e.id;
