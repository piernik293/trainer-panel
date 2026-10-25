-- 0030: decyzje właściciela po imporcie (25.10.2026). Tylko UPDATE danych, bez zmian schematu; bezpieczne przy ponownym uruchomieniu.
-- 2a) rolowanie: zweryfikowane, nie dla brak aktywności
UPDATE exercises SET reviewed_by_trainer = true, suitable_for_no_activity = false
 WHERE equipment = ARRAY['Roller']::text[] AND name LIKE 'Rolowanie%';
-- 2b) ćwiczenia oddechowe: zweryfikowane, dla brak aktywności; generator ich sam nie dodaje (przełącznik klienta)
UPDATE exercises SET reviewed_by_trainer = true, suitable_for_no_activity = true
 WHERE movement_pattern = 'Oddychanie';
-- 2c) pliometria 249–258: intensywność; 256 = przygotowanie do skoków, bez intensywności
UPDATE exercises SET intensity = v.i FROM (VALUES
  ('Skoki pogo','niska'), ('Skok z zamachem','średnia'), ('Skok w dal z miejsca','średnia'),
  ('Zeskok z natychmiastowym wybiciem','wysoka'), ('Wskok na podwyższenie','średnia'), ('Skoki boczne jednonóż','wysoka'),
  ('Skok jednonóż','wysoka'), ('Skok boczny z zatrzymaniem','średnia'), ('Przeskoki boczne z nogi na nogę','niska')
) AS v(n, i) WHERE exercises.name = v.n AND exercises.id BETWEEN 249 AND 258;
UPDATE exercises SET role = 'przygotowanie do skoków', intensity = NULL
 WHERE name = 'Nauka lądowania' AND id BETWEEN 249 AND 258;
-- 2d) worek i młot: własny sprzęt zamiast „Inny”
UPDATE exercises SET equipment = ARRAY['Worek bokserski']::text[]
 WHERE source_id = 'Heavy_Bag_Thrust';
UPDATE exercises SET equipment = ARRAY['Młot i opona']::text[]
 WHERE source_id = 'Sledgehammer_Swings';
