-- Katalog: decyzje właściciela (24.10.2026) dla 10 ćwiczeń potrzebnych do drabinek (szczebel P).
-- Źródło: docs/KATALOG-DO-PRZEGLADU.csv, kolumna potrzebne_do_drabinki; odpowiedź „1–10 tak”.
-- Idempotentne; zmienia tylko pola, które są jeszcze puste. Nazwa chroni przed pomyłką id na innej bazie.

-- 1) suitableForNoActivity: false dla 9 ćwiczeń, true tylko dla 129 (podparcie klatki, niskie obciążenie stawów).
UPDATE exercises e SET suitable_for_no_activity = v.ok, updated_at = now()
FROM (VALUES
  (4,   'Wyciskanie hantli nad głowę',               false),
  (139, 'Wyciskanie hantli siedząc',                 false),
  (117, 'Pompki klasyczne',                          false),
  (92,  'Wypychanie nóg na suwnicy 45°',             false),
  (96,  'Wykrok w tył',                              false),
  (101, 'Martwy ciąg rumuński z hantlami',           false),
  (126, 'Podciąganie na maszynie wspomagającej',     false),
  (129, 'Wiosłowanie hantlami z podparciem klatki',  true),
  (131, 'Wiosłowanie jednorącz hantlem',             false),
  (195, 'Wspięcia na palce jednostronne stojąc',     false)
) AS v(id, name, ok)
WHERE e.id = v.id AND e.name = v.name AND e.suitable_for_no_activity IS NULL;

-- 2) urządzenie szczegółowo
UPDATE exercises e SET equipment_detail = v.detail, updated_at = now()
FROM (VALUES
  (92,  'Wypychanie nóg na suwnicy 45°',         ARRAY['Suwnica 45° (prasa do nóg)']::text[]),
  (126, 'Podciąganie na maszynie wspomagającej', ARRAY['Maszyna wspomagająca (podciąganie/dipy)']::text[])
) AS v(id, name, detail)
WHERE e.id = v.id AND e.name = v.name AND (e.equipment_detail IS NULL OR cardinality(e.equipment_detail) = 0);

-- 3) stawy obciążane: potwierdzone „bez stawu z listy” (pusta tablica zamiast NULL = decyzja, nie brak danych)
UPDATE exercises e SET joint_stress_areas = '{}'::text[], updated_at = now()
FROM (VALUES
  (129, 'Wiosłowanie hantlami z podparciem klatki'),
  (131, 'Wiosłowanie jednorącz hantlem'),
  (195, 'Wspięcia na palce jednostronne stojąc')
) AS v(id, name)
WHERE e.id = v.id AND e.name = v.name AND e.joint_stress_areas IS NULL;

-- 4) status weryfikacji przeliczony tą samą regułą co w 0019, tylko dla tych 10 ćwiczeń
UPDATE exercises
   SET verification_status = 'zweryfikowane', updated_at = now()
 WHERE id IN (4, 139, 117, 92, 96, 101, 126, 129, 131, 195)
   AND verification_status = 'do_weryfikacji'
   AND main_muscle_group IS NOT NULL AND main_muscle_group <> ''
   AND cardinality(equipment) > 0
   AND cardinality(training_location) > 0
   AND movement_pattern IS NOT NULL
   AND difficulty_level IS NOT NULL
   AND learning_difficulty IS NOT NULL
   AND suitable_for_no_activity IS NOT NULL
   AND joint_stress IS NOT NULL
   AND execution_instructions IS NOT NULL AND execution_instructions <> ''
   AND role IS NOT NULL;
