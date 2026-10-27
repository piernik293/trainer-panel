-- Skrzynka uwagi (blok 8): próg „kto cichnie” per trener i oznaczanie jako załatwione. Addytywnie; ustawienia w osobnej tabeli
-- (nie ruszamy tabeli trainers, żeby nie kolidować z pracą nad rolami i kontami).
CREATE TABLE IF NOT EXISTS trainer_attention_settings (
  trainer_id integer PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
  silence_days integer NOT NULL DEFAULT 7 CHECK (silence_days IN (7, 10, 14)),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attention_dismissals (
  id serial PRIMARY KEY,
  trainer_id integer NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  -- odniesienie do konkretnego zdarzenia (np. „idKlienta:data ostatniej sesji”) — nowe zdarzenie ponownie pokaże powód
  ref text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attention_dismissals_unique_idx ON attention_dismissals (trainer_id, kind, ref);
