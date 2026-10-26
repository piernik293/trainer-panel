-- 0032: pytanie wywiadu o doświadczenie ze skokami (tylko przy celu „Cel sportowy”), 25.10.2026. Tylko addytywnie, kolumna nullable.
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS jump_experience text;
