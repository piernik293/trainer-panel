-- Poprawki właściciela do uzupełnienia stawów (28.10.2026). Migracja DANYCH, addytywna i odwracalna (kopia w catalogue_joint_backup, migration '0060'; cofnięcie: scripts/stawy-poprawki-cofnij.sql).
-- 1) wszystkie dipy: Bark, Łokieć, Nadgarstek, poziom Wysokie; 2) ćwiczenia w zwisie: dodany Bark (poziom bez zmian); 3) sześć ćwiczeń: poziom Średnie.
-- Jednorazowość: stosujemy tylko do id bez kopii 0060 (db-setup uruchamia wszystkie migracje za każdym razem).
CREATE TABLE IF NOT EXISTS catalogue_joint_backup (
  id serial PRIMARY KEY,
  migration text NOT NULL,
  exercise_id integer NOT NULL,
  joint_stress text,
  joint_stress_areas text[],
  saved_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_joint_backup_idx ON catalogue_joint_backup (migration, exercise_id);

CREATE TEMP TABLE joint_fix_todo AS
SELECT id FROM exercises
WHERE (id IN (175, 176, 1093, 1178, 1267, 1321, 1629, 165, 1089, 1102, 1262, 1393, 103, 1314, 137, 115, 1202, 1203)
  OR slug IN ('negatywy-dipow', 'dipy-z-guma', 'dipy-z-obciazeniem', 'zwis-na-drazku', 'toes-to-bar')) -- nowe ćwiczenia z 0057 mają w różnych bazach różne id, więc po slug
  AND id NOT IN (SELECT exercise_id FROM catalogue_joint_backup WHERE migration = '0060');
INSERT INTO catalogue_joint_backup (migration, exercise_id, joint_stress, joint_stress_areas)
SELECT '0060', id, joint_stress, joint_stress_areas FROM exercises WHERE id IN (SELECT id FROM joint_fix_todo)
ON CONFLICT (migration, exercise_id) DO NOTHING;

-- dipy (po nazwie także te dodane później): Bark, Łokieć, Nadgarstek, Wysokie
UPDATE exercises SET joint_stress = 'Wysokie', joint_stress_areas = ARRAY['Bark','Łokieć','Nadgarstek']::text[], updated_at = now()
WHERE id IN (SELECT id FROM joint_fix_todo) AND name ~* 'dip(y|ów|ach)';
-- zwis: dodaj Bark (jeśli go nie ma)
UPDATE exercises SET joint_stress_areas = array_append(joint_stress_areas, 'Bark'), updated_at = now()
WHERE id IN (SELECT id FROM joint_fix_todo) AND name ~* 'zwis|toes to bar|hanging' AND name !~* 'dip(y|ów|ach)' AND NOT ('Bark' = ANY(joint_stress_areas));
-- poziom Średnie
UPDATE exercises SET joint_stress = 'Średnie', updated_at = now() WHERE id IN (SELECT id FROM joint_fix_todo) AND id IN (103, 1314, 137, 115, 1202, 1203);
