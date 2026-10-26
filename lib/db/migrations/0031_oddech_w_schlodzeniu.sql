-- 0031: przełącznik podopiecznego „Kończ schłodzenie minutą spokojnego oddechu” (25.10.2026). Tylko addytywnie; domyślnie wyłączony.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS breathing_cooldown boolean NOT NULL DEFAULT false;
