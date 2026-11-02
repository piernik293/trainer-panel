-- 0066: okres próbny trenera (14 dni z pełnym dostępem po akceptacji wniosku). Tylko dodawanie kolumn.
--  * trainers.trial_started_at / trial_ends_at — start i koniec okresu próbnego (NULL = brak okresu: konto starszego typu albo administrator)
-- Obecni trenerzy dostają okres próbny liczony od dnia pierwszego uruchomienia tej migracji (wiersze, które nie mają jeszcze daty startu).
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS trial_started_at timestamp;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS trial_ends_at timestamp;
UPDATE trainers SET trial_started_at = now(), trial_ends_at = now() + interval '14 days' WHERE trial_started_at IS NULL;
