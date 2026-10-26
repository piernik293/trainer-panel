-- Moduł kondycyjny (blok 12): jeden plan z typami dni; wszystko addytywne i nullable. Domyślnie wyłączony przełącznikiem CONDITIONING_ENABLED.
ALTER TABLE workout_plan_days ADD COLUMN IF NOT EXISTS day_type text;            -- NULL / 'silowy' | 'kondycyjny'
ALTER TABLE workout_plan_days ADD COLUMN IF NOT EXISTS conditioning jsonb;       -- { method, tool, startsOn?, weeks: [...] } dla dni kondycyjnych

-- Tabela celów jako słownik edytowalny (administrator): cel × typ elementu planu
CREATE TABLE IF NOT EXISTS plan_element_rules (
  id serial PRIMARY KEY,
  goal text NOT NULL,
  element text NOT NULL CHECK (element IN ('opor', 'pliometria', 'kondycja', 'kroki')),
  mode text NOT NULL CHECK (mode IN ('wymagany', 'opcjonalny', 'brak')),
  per_week_min integer,
  per_week_max integer,
  note text,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_element_rules_goal_element_idx ON plan_element_rules (goal, element);

CREATE TABLE IF NOT EXISTS conditioning_logs (
  id serial PRIMARY KEY,
  client_uuid uuid NOT NULL,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_day_id integer REFERENCES workout_plan_days(id) ON DELETE SET NULL,
  logged_on date NOT NULL DEFAULT current_date,
  method text NOT NULL,
  tool text,
  minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 300),
  rpe integer CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
  talk_test text CHECK (talk_test IS NULL OR talk_test IN ('zdania', 'pojedyncze_slowa', 'wcale')),
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conditioning_logs_client_uuid_idx ON conditioning_logs (client_uuid);
CREATE INDEX IF NOT EXISTS conditioning_logs_client_idx ON conditioning_logs (client_id, logged_on);

-- cotygodniowy check-in (tylko podopieczny trenera)
CREATE TABLE IF NOT EXISTS conditioning_checkins (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  felt text NOT NULL CHECK (felt IN ('lekko', 'w_sam_raz', 'ciezko')),
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conditioning_checkins_client_week_idx ON conditioning_checkins (client_id, week_start);

-- zasiew słownika (tabela zatwierdzona przez właściciela 25.10.2026); powtarzalne
INSERT INTO plan_element_rules (goal, element, mode, per_week_min, per_week_max, note) VALUES
 ('Zwiększenie siły','opor','wymagany',null,null,'główny, ciężkie wielostawowe'),
 ('Zwiększenie siły','pliometria','brak',null,null,'trener może dodać'),
 ('Zwiększenie siły','kondycja','opcjonalny',1,1,'lekka, regeneracyjna'),
 ('Zwiększenie siły','kroki','opcjonalny',null,null,null),
 ('Budowa sylwetki','opor','wymagany',null,null,'główny'),
 ('Budowa sylwetki','pliometria','brak',null,null,null),
 ('Budowa sylwetki','kondycja','opcjonalny',1,1,null),
 ('Budowa sylwetki','kroki','opcjonalny',null,null,null),
 ('Redukcja tkanki tłuszczowej','opor','wymagany',null,null,null),
 ('Redukcja tkanki tłuszczowej','pliometria','brak',null,null,null),
 ('Redukcja tkanki tłuszczowej','kondycja','wymagany',1,2,null),
 ('Redukcja tkanki tłuszczowej','kroki','wymagany',null,null,'z celem'),
 ('Poprawa kondycji','opor','wymagany',null,null,'całe ciało, obwody'),
 ('Poprawa kondycji','pliometria','opcjonalny',null,null,'tylko niska, od Ś'),
 ('Poprawa kondycji','kondycja','wymagany',2,3,'główny element'),
 ('Poprawa kondycji','kroki','wymagany',null,null,null),
 ('Poprawa sprawności','opor','wymagany',null,null,'całe ciało'),
 ('Poprawa sprawności','pliometria','opcjonalny',null,null,'tylko niska, od Ś'),
 ('Poprawa sprawności','kondycja','wymagany',1,2,'marszobieg → bieg / interwały'),
 ('Poprawa sprawności','kroki','wymagany',null,null,null),
 ('Cel sportowy','opor','wymagany',null,null,null),
 ('Cel sportowy','pliometria','opcjonalny',null,null,'wg doświadczenia'),
 ('Cel sportowy','kondycja','wymagany',1,2,'interwały i sprinty'),
 ('Cel sportowy','kroki','opcjonalny',null,null,null)
ON CONFLICT (goal, element) DO NOTHING;
