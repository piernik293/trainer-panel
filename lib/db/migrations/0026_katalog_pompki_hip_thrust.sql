-- Katalog: decyzje właściciela (24.10.2026). Tylko dopisanie / ustawienie wartości; idempotentne; nazwa chroni przed pomyłką id.
-- 1) Pompki na podwyższeniu (116) i na kolanach (118): stawy Bark i Nadgarstek — spójnie z pompkami ściennymi (322) i klasycznymi (117).
UPDATE exercises e SET joint_stress_areas = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(e.joint_stress_areas, '{}'::text[]) || ARRAY['Bark', 'Nadgarstek']::text[]) x ORDER BY x)), updated_at = now()
FROM (VALUES (116, 'Pompki na podwyższeniu'), (118, 'Pompki na kolanach')) AS v(id, name)
WHERE e.id = v.id AND e.name = v.name
  AND NOT (COALESCE(e.joint_stress_areas, '{}'::text[]) @> ARRAY['Bark', 'Nadgarstek']::text[]);

-- 2) Hip thrust (104): poziom Początkujący — spójnie z listą suitable_experience_levels (zawiera Początkujący).
UPDATE exercises SET difficulty_level = 'Początkujący', updated_at = now()
WHERE id = 104 AND name = 'Hip thrust' AND difficulty_level IS DISTINCT FROM 'Początkujący';
