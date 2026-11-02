-- 0064: „Mój trening” — każdy obecny trener dostaje własny profil podopiecznego (bez osobnego trenera prowadzącego), żeby przełącznik
-- [Mój trening] [Podopieczni] był zawsze widoczny. Tylko dodawanie wierszy i uzupełnienie pustego trainer_id; nic nie jest usuwane ani zmieniane.
-- Osoba, która ma już konto podopiecznego u innego trenera, nie jest ruszana. Idempotentna (db-setup uruchamia wszystkie migracje przy każdym przebiegu).
INSERT INTO clients (first_name, last_name, email, trainer_id, clerk_user_id)
SELECT 'Mój trening', '', t.email, t.id, t.clerk_user_id
FROM trainers t
WHERE t.clerk_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.clerk_user_id = t.clerk_user_id)
ON CONFLICT DO NOTHING;

UPDATE clients c SET trainer_id = t.id, updated_at = now()
FROM trainers t
WHERE c.clerk_user_id = t.clerk_user_id AND c.trainer_id IS NULL;
