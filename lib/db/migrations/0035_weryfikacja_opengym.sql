-- 0035: weryfikacja ćwiczeń z paczki openGym wg decyzji właściciela (26.10.2026). Tylko UPDATE; powtarzalne.
-- „tak” = reviewed_by_trainer + status zweryfikowane; „tak + dla nieaktywnych” = dodatkowo suitableForNoActivity (i poziom Brak aktywności).
UPDATE exercises SET reviewed_by_trainer = true, verification_status = 'zweryfikowane' WHERE source_id IN (
  'OG_3239','OG_2398','OG_2300','OG_2805','OG_3544','OG_3016','OG_3147','OG_0974','OG_0983','OG_1013','OG_1254','OG_3124','OG_1004','OG_1009',
  'OG_1022','OG_1017','OG_3006','OG_0980','OG_1490','OG_0300','OG_3021','OG_3011','OG_1346');
-- dla nieaktywnych (10 zielonych światełek z listy + odmiana pompek łopatkowych i rozciąganie)
UPDATE exercises SET suitable_for_no_activity = true,
  suitable_experience_levels = ARRAY['Brak aktywności fizycznej','Początkujący','Średniozaawansowany','Zaawansowany']::text[]
WHERE source_id IN ('OG_3544','OG_3016','OG_3147','OG_0974','OG_1254','OG_3124','OG_1004','OG_1009','OG_1022','OG_1017','OG_3006','OG_3011','OG_1346');
-- spójnie z wcześniejszą decyzją (pkt 5): poziom BA także dla ćwiczeń z flagą dla nieaktywnych dodanych wtedy
UPDATE exercises SET suitable_experience_levels = ARRAY['Brak aktywności fizycznej','Początkujący','Średniozaawansowany','Zaawansowany']::text[]
WHERE suitable_for_no_activity IS TRUE AND NOT ('Brak aktywności fizycznej' = ANY(suitable_experience_levels))
  AND source_id IN ('Side_Leg_Raises','WLASNE_Side_Lying_Hip_Adduction','WLASNE_Towel_Curl','Elbow_to_Knee','Seated_Band_Hamstring_Curl',
    'Shoulder_Press_-_With_Bands','Band_Hip_Adductions','WLASNE_Band_Biceps_Curl','Machine_Bicep_Curl','Machine_Triceps_Extension','Standing_Leg_Curl');
-- poprawki opisów
UPDATE exercises SET execution_instructions = 'Połóż się pod stabilnym drążkiem zamocowanym nisko i chwyć go nachwytem. Ugnij kolana, stopy zostaw na podłodze, ciało w linii od kolan do głowy. Przyciągnij klatkę do drążka i opuść się powoli.',
  safety_notes = 'Użyj tylko stabilnego drążka, który udźwignie Twój ciężar. Wykonuj w komfortowym zakresie, w spokojnym tempie. Przy bólu przerwij ćwiczenie.'
WHERE source_id = 'OG_2300';
UPDATE exercises SET execution_instructions = 'Usiądź na podłodze, kolana ugięte, dłonie za biodrami, palce skierowane do przodu. Unieś biodra i zginaj łokcie w małym zakresie, po czym wypchnij się w górę.'
WHERE source_id = 'OG_1399';
