-- Klient przykładowy samouczka (flaga ONBOARDING_ENABLED): nie liczy się do limitów, statystyk ani pulpitu. Addytywnie.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_example boolean NOT NULL DEFAULT false;
