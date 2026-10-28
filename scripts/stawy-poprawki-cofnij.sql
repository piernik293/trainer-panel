-- COFNIĘCIE migracji 0060 (poprawki właściciela do stawów). Nie jest częścią migracji; uruchamiaj ręcznie po pg_dump.
UPDATE exercises e SET joint_stress = b.joint_stress, joint_stress_areas = b.joint_stress_areas, updated_at = now()
FROM catalogue_joint_backup b WHERE b.migration = '0060' AND b.exercise_id = e.id;
