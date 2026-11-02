-- 0065: Solo jako podstawa konta. Tylko dodawanie kolumn (nullable / z domyślną wartością); nic nie jest usuwane ani zmieniane.
--  * workout_plans.created_by — 'solo' dla planów ułożonych automatycznie dla osoby bez trenera (limit planów Solo, archiwizacja po planie trenera)
--  * clients.history_visible_from — od kiedy trener widzi dane osoby; NULL = cała historia (osoba zgodziła się albo nie była wcześniej Solo)
--  * trainer_join_requests.share_history — zgoda osoby na udostępnienie trenerowi wywiadu i historii treningów (domyślnie NIE)
ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS history_visible_from timestamp;
ALTER TABLE trainer_join_requests ADD COLUMN IF NOT EXISTS share_history boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS workout_plans_created_by_idx ON workout_plans (client_id, created_by, created_at);
