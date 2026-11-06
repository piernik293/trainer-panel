-- Decyzje właściciela 52–54 (06.11.2026), docs/PRZEGLAD-KATALOGU.csv: migracja DANYCH, addytywna i odwracalna (cofnięcie: scripts/katalog-decyzje-cofnij-0082.sql).
-- Kopia starych wartości w catalogue_decision_backup (migration = '0082'). Nie zmienia nazw, nic nie usuwa („ukryj” = hidden=true, ćwiczenie zostaje w bazie).
-- Odwzorowanie decyzji: zatwierdź = suitable_for_no_activity true; tylko od P = false i trudność Początkujący; tylko od Ś = false i trudność Średniozaawansowany; ukryj = hidden.
-- Jednorazowość: tylko dla id bez kopii „0082” (późniejsze zmiany właściciela nie zostaną nadpisane przy kolejnym uruchomieniu db-setup).
ALTER TABLE catalogue_decision_backup ADD COLUMN IF NOT EXISTS joint_stress_areas text[];
ALTER TABLE catalogue_decision_backup ADD COLUMN IF NOT EXISTS ladder_level text;

CREATE TEMP TABLE katalog_0082_todo AS
SELECT id FROM exercises WHERE id IN (
  140, 190, 149, 189, 144, 146, 99, 106, 107, 150, 193, 89, 154, 143, 187, 141, 145, 147, 155, 153,   -- A: zatwierdź (także BA)
  227, 163, 164, 108,                                                                                    -- zostają „tylko od P”
  198, 1110, 1319, 1260, 200, 1281, 1094, 1093, 1629, 1180, 1314, 1538,                                  -- B
  197, 1092, 1099, 1252,                                                                                 -- C: „tylko od Ś” → „tylko od P”
  169, 201, 1084, 319, 1089, 1202, 1203, 1261, 1618,                                                     -- reszta: zgodnie z PROPOZYCJĄ pliku
  (SELECT id FROM exercises WHERE slug = 'pistol-z-podparciem')                                          -- D: Pistol z podparciem → szczebel Ś (po slugu — numery różnią się między bazami)
) AND id NOT IN (SELECT exercise_id FROM catalogue_decision_backup WHERE migration = '0082');

INSERT INTO catalogue_decision_backup (migration, exercise_id, suitable_for_no_activity, reviewed_by_trainer, verification_status, hidden, difficulty_level, joint_stress_areas, ladder_level)
SELECT '0082', e.id, e.suitable_for_no_activity, e.reviewed_by_trainer, e.verification_status, e.hidden, e.difficulty_level, e.joint_stress_areas,
       (SELECT s.level FROM exercise_ladder_steps s WHERE s.exercise_id = e.id ORDER BY s.step_order LIMIT 1)
FROM exercises e WHERE e.id IN (SELECT id FROM katalog_0082_todo)
ON CONFLICT (migration, exercise_id) DO NOTHING;

-- A + pajacyki + reszta „zatwierdź”: dostępne od BA
UPDATE exercises SET reviewed_by_trainer = true, verification_status = 'zweryfikowane', suitable_for_no_activity = true, updated_at = now()
WHERE id IN (140, 190, 149, 189, 144, 146, 99, 106, 107, 150, 193, 89, 154, 143, 187, 141, 145, 147, 155, 153, 1538, 319, 1089, 1202, 1203, 1261, 1618)
  AND id IN (SELECT id FROM katalog_0082_todo);
-- „tylko od P”: bez dostępu dla BA, od P wzwyż (trudność Początkujący)
UPDATE exercises SET reviewed_by_trainer = true, verification_status = 'zweryfikowane', suitable_for_no_activity = false, updated_at = now()
WHERE id IN (227, 163, 164, 108, 198, 1110, 1319, 1260, 200, 1281, 1094, 1093, 1629, 1180, 1314, 197, 1092, 1099, 1252)
  AND id IN (SELECT id FROM katalog_0082_todo);
UPDATE exercises SET difficulty_level = 'Początkujący', updated_at = now()
WHERE id IN (1629, 197, 1092, 1099, 1252) AND id IN (SELECT id FROM katalog_0082_todo);
-- dipy: flaga „Bark” (obciążenie przodu barku) — dopisywana tylko, jeśli jej nie ma
UPDATE exercises SET joint_stress_areas = array_append(COALESCE(joint_stress_areas, ARRAY[]::text[]), 'Bark'), updated_at = now()
WHERE id IN (1093, 1629) AND id IN (SELECT id FROM katalog_0082_todo) AND NOT ('Bark' = ANY(COALESCE(joint_stress_areas, ARRAY[]::text[])));
-- „ukryj” wg PROPOZYCJI (i tak blokowane w generatorze): hidden, nic nie jest usuwane
UPDATE exercises SET hidden = true, updated_at = now() WHERE id IN (169, 201, 1084) AND id IN (SELECT id FROM katalog_0082_todo);
-- D: „Pistol z podparciem” — wersja ułatwiona, szczebel Ś (wcześniej Z)
UPDATE exercises SET difficulty_level = 'Średniozaawansowany', updated_at = now() WHERE slug = 'pistol-z-podparciem' AND id IN (SELECT id FROM katalog_0082_todo);
UPDATE exercise_ladder_steps SET level = 'Średniozaawansowany' WHERE exercise_id IN (SELECT id FROM katalog_0082_todo WHERE id IN (SELECT id FROM exercises WHERE slug = 'pistol-z-podparciem'));
