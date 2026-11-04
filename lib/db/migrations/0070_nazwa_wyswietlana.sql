-- Nowy wygląd portalu: nazwa wyświetlana w „Ty” (osobno od imienia, które widzi trener). Addytywnie, nullable.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS display_name text;
