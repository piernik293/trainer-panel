-- Zgoda na przetwarzanie danych o zdrowiu (blok 5d): osobne pola przy wywiadzie, wszystkie nullable.
-- status: NULL = wywiad sprzed zgody / wprowadzony przez trenera (zachowanie bez zmian); 'given' | 'declined' | 'withdrawn'.
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS health_consent_status text;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS health_consent_at timestamp;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS health_consent_version text;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS health_consent_withdrawn_at timestamp;
