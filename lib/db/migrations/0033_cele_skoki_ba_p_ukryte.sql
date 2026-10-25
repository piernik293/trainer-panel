-- 0033: decyzje właściciela z 25.10.2026 (tylko UPDATE danych, bez zmian schematu; powtarzalne).

-- (3) Cele ćwiczeń: stare nazwy → 6 celów z bazy.
--   Masa mięśniowa, Hipertrofia → Budowa sylwetki;  Siła → Zwiększenie siły;  Kondycja, Wytrzymałość siłowa → Poprawa kondycji;
--   Zdrowie ogólne, Stabilizacja → Poprawa sprawności (ogólna sprawność, stabilizacja, mobilność).
UPDATE exercises SET training_goals = (
  SELECT COALESCE(array_agg(DISTINCT m ORDER BY m), '{}'::text[]) FROM (
    SELECT CASE g
      WHEN 'Masa mięśniowa' THEN 'Budowa sylwetki' WHEN 'Hipertrofia' THEN 'Budowa sylwetki'
      WHEN 'Siła' THEN 'Zwiększenie siły'
      WHEN 'Kondycja' THEN 'Poprawa kondycji' WHEN 'Wytrzymałość siłowa' THEN 'Poprawa kondycji'
      WHEN 'Zdrowie ogólne' THEN 'Poprawa sprawności' WHEN 'Stabilizacja' THEN 'Poprawa sprawności'
      ELSE g END AS m
    FROM unnest(training_goals) AS g) t)
WHERE training_goals && ARRAY['Masa mięśniowa','Hipertrofia','Siła','Kondycja','Wytrzymałość siłowa','Zdrowie ogólne','Stabilizacja']::text[];

-- (3) Ćwiczenia główne i pomocnicze bez celów dostają cele wg reguł (opis: docs/GENERATOR-PRIORYTETY.md, „Cele w katalogu”).
UPDATE exercises e SET training_goals = ARRAY(
  SELECT g FROM (VALUES
    ('Budowa sylwetki', true),
    ('Zwiększenie siły', e.exercise_type = 'Złożone' AND e.exercise_priority IN ('Wysoki','Bardzo wysoki')
        AND e.equipment && ARRAY['Sztanga','Hantle','Kettlebell','Maszyna','Wyciąg','Landmine','Talerz obciążeniowy']::text[]),
    ('Redukcja tkanki tłuszczowej', e.exercise_type = 'Złożone'),
    ('Poprawa kondycji', e.exercise_type = 'Złożone'
        AND (e.main_muscle_group = 'Całe ciało' OR (e.equipment && ARRAY['Masa własnego ciała','Kettlebell','TRX','Piłka lekarska','Gumy oporowe']::text[]
             AND e.movement_pattern IN ('Przysiad','Wykrok','Zawias biodrowy','Pchanie poziome','Przyciąganie poziome','Lokomocja')))),
    ('Poprawa sprawności', (e.exercise_type = 'Złożone' AND (e.unilateral IS TRUE OR e.movement_pattern IN ('Wykrok','Stabilizacja tułowia','Anti-ekstensja','Anti-rotacja','Rotacja','Lokomocja')))
        OR e.movement_pattern IN ('Stabilizacja tułowia','Anti-ekstensja','Anti-rotacja','Rotacja')),
    ('Cel sportowy', e.intensity IS NOT NULL OR (e.exercise_type = 'Złożone' AND e.neurological_fatigue >= 4))
  ) AS r(g, ok) WHERE ok)
WHERE cardinality(e.training_goals) = 0 AND e.role IN ('główne','pomocnicze');

-- (4) Początkujący: niskie skoki tylko Skoki pogo (249) i Skip A (1098).
UPDATE exercises SET difficulty_level = 'Początkujący', intensity = 'niska', reviewed_by_trainer = true, verification_status = 'zweryfikowane',
  suitable_experience_levels = ARRAY['Początkujący','Średniozaawansowany','Zaawansowany']::text[]
WHERE id = 249 AND name = 'Skoki pogo';
UPDATE exercises SET difficulty_level = 'Początkujący', intensity = 'niska', reviewed_by_trainer = true, verification_status = 'zweryfikowane',
  suitable_experience_levels = ARRAY['Początkujący','Średniozaawansowany','Zaawansowany']::text[]
WHERE source_id = 'Fast_Skipping';

-- (5) Brakujące ćwiczenia dla BA/P: zweryfikowane; BA (suitableForNoActivity) tylko tam, gdzie lista mówiła BA.
UPDATE exercises SET reviewed_by_trainer = true, verification_status = 'zweryfikowane'
WHERE source_id IN ('Side_Leg_Raises','WLASNE_Side_Lying_Hip_Adduction','WLASNE_Towel_Curl','WLASNE_Plank_Shoulder_Tap','Elbow_to_Knee',
  'Seated_Band_Hamstring_Curl','Shoulder_Press_-_With_Bands','Band_Hip_Adductions','WLASNE_Band_Biceps_Curl','Machine_Bicep_Curl',
  'Machine_Triceps_Extension','Standing_Leg_Curl','Crunches','Scapular_Pull-Up');
UPDATE exercises SET suitable_for_no_activity = true
WHERE source_id IN ('Side_Leg_Raises','WLASNE_Side_Lying_Hip_Adduction','WLASNE_Towel_Curl','Elbow_to_Knee','Seated_Band_Hamstring_Curl',
  'Shoulder_Press_-_With_Bands','Band_Hip_Adductions','WLASNE_Band_Biceps_Curl','Machine_Bicep_Curl','Machine_Triceps_Extension','Standing_Leg_Curl');

-- (9) Ukrycie (hidden = true, nic nie jest usuwane): drille sprinterskie, niszowe odmiany, niszowe „nowe”.
UPDATE exercises SET hidden = true WHERE source_id IN (
  'Kneeling_Arm_Drill','Linear_3-Part_Start_Technique','Linear_Acceleration_Wall_Drill','Moving_Claw_Series','Single-Cone_Sprint_Drill',
  'Side_Hop-Sprint','Bench_Sprint','Return_Push_from_Stance','Drop_Push','Incline_Push-Up_Depth_Jump','Dumbbell_Seated_Box_Jump',
  'Vertical_Swing','Quick_Leap','Frog_Hops','Stride_Jump_Crossover','Single_Leg_Push-off',
  'Barbell_Curls_Lying_Against_An_Incline','Calf_Raise_On_A_Dumbbell','One-Arm_High-Pulley_Cable_Side_Bends','Supine_Chest_Throw',
  'Weighted_Bench_Dip','Kneeling_Cable_Crunch_With_Alternating_Oblique_Twists',
  'Finger_Curls','Body_Tricep_Press','Cross_Over_-_With_Bands','WLASNE_Towel_Curl');
