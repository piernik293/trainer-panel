-- 0037: cele dla rozgrzewek i rozciągania (decyzja właściciela 26.10.2026). Tylko UPDATE danych, bez zmian schematu; powtarzalne.
-- Rozgrzewka i rozciąganie są uniwersalne (nie zależą od celu), więc ćwiczenia tych ról bez żadnego celu dostają wszystkie 6 celów.
-- Ćwiczenia, które już mają cele, zostają bez zmian.
UPDATE exercises SET training_goals = ARRAY[
  'Budowa sylwetki', 'Cel sportowy', 'Poprawa kondycji', 'Poprawa sprawności', 'Redukcja tkanki tłuszczowej', 'Zwiększenie siły'
]::text[]
WHERE role IN ('rozgrzewka', 'rozciąganie') AND cardinality(training_goals) = 0;
