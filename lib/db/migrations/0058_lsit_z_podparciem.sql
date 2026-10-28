-- „L-sit z podparciem” (decyzja właściciela 28.10.2026: wypadł z pliku przeglądu przez błąd, dodać jak pozostałe 11, od Ś, do drabinki core).
-- Addytywnie: jedno nowe ćwiczenie, przypisanie mięśni skopiowane od „L-sit na podłodze” (id 1640), wiersz drabinki. Powtórne uruchomienie niczego nie dubluje.
INSERT INTO exercises (name, slug, main_muscle_group, secondary_muscle_groups, equipment, required_equipment_all, equipment_other, training_location, difficulty_level, movement_pattern,
  description, execution_instructions, common_mistakes, coaching_tips, exercise_type, safety_notes, suitable_experience_levels, training_goals, execution, requires_spotter,
  can_be_performed_to_failure, joint_stress, learning_difficulty, exercise_priority, suitable_for_no_activity, movement_complexity, is_active, role, verification_status,
  joint_stress_areas, source, review_batch, reviewed_by_trainer, hidden, unilateral, movement_category, plane_of_motion, neurological_fatigue, doms_potential, resistance_type, default_duration_seconds)
SELECT 'L-sit z podparciem', 'l-sit-z-podparciem', 'Brzuch', ARRAY['Barki','Triceps','Mięśnie czworogłowe uda']::text[], ARRAY['Poręcze','Masa własnego ciała']::text[], ARRAY[]::text[],
  'Poręcze, kółka, dwa stabilne podwyższenia lub równe klocki pod dłonie', ARRAY['Siłownia','Dom','Plener']::text[], 'Średniozaawansowany', 'Stabilizacja tułowia',
  'Siad kątowy na poręczach lub na podłodze z dłońmi na podwyższeniach i lekko ugiętymi nogami. Krok przed pełnym L-sitem.',
  'Oprzyj dłonie o poręcze lub podwyższenia na szerokość barków i wyprostuj ręce. Odepchnij się w dół tak, by uniosły się biodra, i oderwij stopy od podłogi z lekko ugiętymi kolanami. Utrzymaj pozycję 5–15 sekund.',
  'Barki wciągnięte do uszu, zaokrąglone plecy, wstrzymywanie oddechu, zbyt długie próby bez kontroli.',
  'Odpychaj się mocno od podłoża, łopatki w dół. Zacznij od krótkich serii i dokładaj sekundy. Łatwiej: jedna noga uniesiona na zmianę.',
  'Izolowane', 'Duże obciążenie nadgarstków i barków. Użyj stabilnego podparcia, wykonuj w komfortowym zakresie, przy bólu nadgarstka lub barku przerwij.',
  ARRAY['Średniozaawansowany','Zaawansowany']::text[], ARRAY['Poprawa sprawności','Zwiększenie siły']::text[], 'Obustronne', false, 'Nie', 'Średnie', 3, 'Średni', false, 'Umiarkowana', true,
  'pomocnicze', 'zweryfikowane', ARRAY['Nadgarstek','Bark']::text[], 'own', 'katalog-decyzje-0058', true, false, false, 'Core', 'Strzałkowa', 2, 2, 'Masa własnego ciała', 10
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE slug = 'l-sit-z-podparciem');
INSERT INTO exercise_muscle_assignments (exercise_id, specific_muscle_id, is_primary, coefficient)
SELECT n.id, a.specific_muscle_id, a.is_primary, a.coefficient FROM exercises n JOIN exercise_muscle_assignments a ON a.exercise_id = 1640
WHERE n.slug = 'l-sit-z-podparciem' AND NOT EXISTS (SELECT 1 FROM exercise_muscle_assignments z WHERE z.exercise_id = n.id);
INSERT INTO exercise_ladder_steps (pattern, step_order, level, exercise_id)
SELECT 'Kalistenika: core', 6, 'Średniozaawansowany', id FROM exercises WHERE slug = 'l-sit-z-podparciem'
ON CONFLICT (pattern, exercise_id) DO NOTHING;
