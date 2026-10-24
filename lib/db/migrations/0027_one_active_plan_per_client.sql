-- 0027: klient ma najwyżej jeden aktywny plan (24.10.2026). Aktywacja archiwizuje poprzedni (kod API).
-- Tylko addytywnie: indeks częściowy. Wymaga wcześniejszego uporządkowania danych (w bazie aplikacji: #69 zarchiwizowany ręcznie).
CREATE UNIQUE INDEX IF NOT EXISTS workout_plans_one_active_per_client ON workout_plans (client_id) WHERE status = 'active';
