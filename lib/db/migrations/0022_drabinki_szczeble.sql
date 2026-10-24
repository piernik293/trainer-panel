-- Drabinki progresji (etap 2b): tabela szczebli + zasiew z docs/DRABINKI-DO-PRZEGLADU.csv tylko dla ćwiczeń istniejących w bazie.
-- Szczeble „do uzupełnienia” nie są zasiewane. Addytywne, idempotentne (nazwa chroni przed pomyłką id na innej bazie).
CREATE TABLE IF NOT EXISTS exercise_ladder_steps (
  id serial PRIMARY KEY,
  pattern text NOT NULL,
  step_order integer NOT NULL,
  level text NOT NULL,
  exercise_id integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ladder_pattern_exercise_idx ON exercise_ladder_steps (pattern, exercise_id);
CREATE INDEX IF NOT EXISTS ladder_pattern_order_idx ON exercise_ladder_steps (pattern, step_order);

INSERT INTO exercise_ladder_steps (pattern, step_order, level, exercise_id)
SELECT v.pattern, v.step_order, v.level, e.id FROM (VALUES
  ('Przysiad', 1, 'Brak aktywności fizycznej', 90, 'Przysiad do skrzyni z masą własnego ciała'),
  ('Przysiad', 4, 'Początkujący', 88, 'Przysiad goblet z hantlem'),
  ('Przysiad', 5, 'Początkujący', 92, 'Wypychanie nóg na suwnicy 45°'),
  ('Przysiad', 6, 'Średniozaawansowany', 3, 'Przysiad ze sztangą'),
  ('Przysiad', 7, 'Średniozaawansowany', 93, 'Przysiad na suwnicy Smitha'),
  ('Przysiad', 8, 'Zaawansowany', 191, 'Przysiad ze sztangą z przodu'),
  ('Przysiad', 9, 'Zaawansowany', 225, 'Przysiad na jednej nodze (Pistol Squat)'),
  ('Zawias biodrowy', 1, 'Brak aktywności fizycznej', 105, 'Glute bridge'),
  ('Zawias biodrowy', 2, 'Początkujący', 101, 'Martwy ciąg rumuński z hantlami'),
  ('Zawias biodrowy', 3, 'Początkujący', 103, 'Martwy ciąg z kettlebell'),
  ('Zawias biodrowy', 4, 'Średniozaawansowany', 100, 'Martwy ciąg rumuński ze sztangą'),
  ('Zawias biodrowy', 5, 'Średniozaawansowany', 102, 'Martwy ciąg z trap barem'),
  ('Zawias biodrowy', 6, 'Zaawansowany', 182, 'Martwy ciąg konwencjonalny'),
  ('Zawias biodrowy', 7, 'Zaawansowany', 192, 'Martwy ciąg sumo'),
  ('Wykrok', 1, 'Brak aktywności fizycznej', 260, 'Wejście na niskie podwyższenie z podparciem'),
  ('Wykrok', 2, 'Brak aktywności fizycznej', 95, 'Przysiad wykroczny z podparciem'),
  ('Wykrok', 4, 'Początkujący', 96, 'Wykrok w tył'),
  ('Wykrok', 5, 'Średniozaawansowany', 97, 'Wykroki chodzone'),
  ('Wykrok', 6, 'Zaawansowany', 94, 'Przysiad bułgarski'),
  ('Pchanie poziome', 1, 'Brak aktywności fizycznej', 322, 'Pompki ścienne'),
  ('Pchanie poziome', 2, 'Brak aktywności fizycznej', 115, 'Wyciskanie na maszynie siedząc'),
  ('Pchanie poziome', 3, 'Początkujący', 116, 'Pompki na podwyższeniu'),
  ('Pchanie poziome', 4, 'Początkujący', 118, 'Pompki na kolanach'),
  ('Pchanie poziome', 5, 'Początkujący', 117, 'Pompki klasyczne'),
  ('Pchanie poziome', 6, 'Średniozaawansowany', 170, 'Wyciskanie hantli leżąc'),
  ('Pchanie poziome', 7, 'Średniozaawansowany', 1, 'Wyciskanie sztangi leżąc'),
  ('Pchanie poziome', 8, 'Zaawansowany', 171, 'Wyciskanie sztangi na ławce skośnej ujemnej'),
  ('Pchanie poziome', 9, 'Zaawansowany', 220, 'Pompki na kółkach gimnastycznych'),
  ('Pchanie pionowe', 1, 'Brak aktywności fizycznej', 137, 'Wyciskanie na maszynie nad głowę'),
  ('Pchanie pionowe', 2, 'Początkujący', 139, 'Wyciskanie hantli siedząc'),
  ('Pchanie pionowe', 3, 'Początkujący', 4, 'Wyciskanie hantli nad głowę'),
  ('Pchanie pionowe', 4, 'Średniozaawansowany', 138, 'Arnold press'),
  ('Pchanie pionowe', 5, 'Zaawansowany', 186, 'Wyciskanie sztangą nad głowę'),
  ('Przyciąganie poziome', 1, 'Brak aktywności fizycznej', 134, 'Wiosłowanie gumą oporową'),
  ('Przyciąganie poziome', 2, 'Brak aktywności fizycznej', 130, 'Wiosłowanie na maszynie'),
  ('Przyciąganie poziome', 3, 'Początkujący', 131, 'Wiosłowanie jednorącz hantlem'),
  ('Przyciąganie poziome', 4, 'Początkujący', 129, 'Wiosłowanie hantlami z podparciem klatki'),
  ('Przyciąganie poziome', 6, 'Średniozaawansowany', 132, 'Wiosłowanie T-bar z podparciem klatki'),
  ('Przyciąganie poziome', 7, 'Średniozaawansowany', 180, 'Wiosłowanie sztangą w opadzie'),
  ('Przyciąganie pionowe', 1, 'Brak aktywności fizycznej', 123, 'Ściąganie drążka wyciągu górnego chwytem neutralnym'),
  ('Przyciąganie pionowe', 3, 'Początkujący', 126, 'Podciąganie na maszynie wspomagającej'),
  ('Przyciąganie pionowe', 6, 'Zaawansowany', 127, 'Podciąganie na drążku chwytem neutralnym'),
  ('Przyciąganie pionowe', 7, 'Zaawansowany', 2, 'Podciąganie na drążku'),
  ('Core i antyrotacja', 1, 'Brak aktywności fizycznej', 159, 'Dead bug'),
  ('Core i antyrotacja', 2, 'Brak aktywności fizycznej', 160, 'Bird dog'),
  ('Core i antyrotacja', 3, 'Początkujący', 5, 'Plank'),
  ('Core i antyrotacja', 4, 'Początkujący', 161, 'Plank boczny'),
  ('Core i antyrotacja', 5, 'Początkujący', 162, 'Pallof press'),
  ('Core i antyrotacja', 6, 'Średniozaawansowany', 197, 'Hollow body hold'),
  ('Core i antyrotacja', 8, 'Zaawansowany', 166, 'Ab wheel rollout'),
  ('Łydki', 1, 'Brak aktywności fizycznej', 259, 'Wspięcia na palce obunóż stojąc'),
  ('Łydki', 2, 'Początkujący', 195, 'Wspięcia na palce jednostronne stojąc'),
  ('Łydki', 3, 'Średniozaawansowany', 109, 'Wspięcia na palce stojąc'),
  ('Łydki', 4, 'Średniozaawansowany', 110, 'Wspięcia na palce siedząc')
) AS v(pattern, step_order, level, exercise_id, name)
JOIN exercises e ON e.id = v.exercise_id AND e.name = v.name
ON CONFLICT DO NOTHING;
