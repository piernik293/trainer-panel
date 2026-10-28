-- COFNIĘCIE migracji 0059 (obciążenie stawów). Nie jest częścią migracji; uruchamiaj ręcznie po pg_dump. Przywraca stare wartości z catalogue_joint_backup.
UPDATE exercises e SET joint_stress = b.joint_stress, joint_stress_areas = b.joint_stress_areas, updated_at = now()
FROM catalogue_joint_backup b WHERE b.migration = '0059' AND b.exercise_id = e.id;
