-- Nowy wygląd portalu: opcjonalny nick (unikalny bez względu na wielkość liter) i kolor awatara. Addytywnie, nullable.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nick text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_color text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_nick_lower_idx ON clients (lower(nick)) WHERE nick IS NOT NULL;
