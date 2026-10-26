-- 0034: dwa nowe mięśnie szczegółowe na zamkniętej liście (decyzja właściciela 26.10.2026) i ich przypisanie. Tylko dopisanie/UPDATE.
-- Powtarzalne. Na bazie aplikacji dostają identyfikatory 29 i 30 (jak w catalogueSeed.ts); baza testowa może mieć już inny wiersz pod 29,
-- dlatego identyfikator nadaje sekwencja, a wszystko dalej szuka mięśni po nazwie.
INSERT INTO specific_muscles (name, broad_category) VALUES
  ('Mięsień piszczelowy przedni', 'Łydki'),
  ('Mięsień zębaty przedni', 'Klatka piersiowa')
ON CONFLICT (name) DO NOTHING;
SELECT setval('specific_muscles_id_seq', (SELECT MAX(id) FROM specific_muscles));

-- Tibialis raise: główny piszczelowy przedni (wcześniej płaszczkowaty jako najbliższy).
UPDATE exercise_muscle_assignments SET specific_muscle_id = (SELECT id FROM specific_muscles WHERE name = 'Mięsień piszczelowy przedni')
 WHERE exercise_id IN (SELECT id FROM exercises WHERE source_id = 'OG_1396')
   AND specific_muscle_id = (SELECT id FROM specific_muscles WHERE name = 'Mięsień płaszczkowaty') AND is_primary;

-- Pompki łopatkowe (+ odmiana na podwyższeniu): główny zębaty przedni; dotychczasowy główny (mniejszy piersiowy) zostaje pomocniczy.
UPDATE exercise_muscle_assignments SET specific_muscle_id = (SELECT id FROM specific_muscles WHERE name = 'Mięsień zębaty przedni')
 WHERE exercise_id IN (SELECT id FROM exercises WHERE source_id IN ('OG_3021','OG_3011'))
   AND specific_muscle_id = (SELECT id FROM specific_muscles WHERE name = 'Mięsień piersiowy mniejszy') AND is_primary;
INSERT INTO exercise_muscle_assignments (exercise_id, specific_muscle_id, is_primary, coefficient)
SELECT e.id, (SELECT id FROM specific_muscles WHERE name = 'Mięsień piersiowy mniejszy'), false, 0.5
  FROM exercises e WHERE e.source_id IN ('OG_3021','OG_3011')
ON CONFLICT (exercise_id, specific_muscle_id) DO NOTHING;

-- Pompki plus: główny zębaty przedni; większy piersiowy zostaje pomocniczy (0,5).
UPDATE exercise_muscle_assignments SET is_primary = false, coefficient = 0.5
 WHERE exercise_id IN (SELECT id FROM exercises WHERE source_id = 'OG_3145')
   AND specific_muscle_id = (SELECT id FROM specific_muscles WHERE name = 'Mięsień piersiowy większy') AND is_primary;
INSERT INTO exercise_muscle_assignments (exercise_id, specific_muscle_id, is_primary, coefficient)
SELECT e.id, (SELECT id FROM specific_muscles WHERE name = 'Mięsień zębaty przedni'), true, 1
  FROM exercises e WHERE e.source_id = 'OG_3145'
ON CONFLICT (exercise_id, specific_muscle_id) DO NOTHING;
