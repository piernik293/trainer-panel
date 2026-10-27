-- 0040: wnioski o konto trenera (blok 6) i proste ustawienia aplikacji (np. automatyczne przyjmowanie). Tylko dodawanie.
CREATE TABLE IF NOT EXISTS trainer_applications (
  id serial PRIMARY KEY,
  clerk_user_id text NOT NULL,
  display_name text,
  email text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamp NOT NULL DEFAULT now(),
  decided_at timestamp,
  decided_by text
);
-- jeden oczekujący wniosek na konto
CREATE UNIQUE INDEX IF NOT EXISTS trainer_applications_pending_idx ON trainer_applications (clerk_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS trainer_applications_user_idx ON trainer_applications (clerk_user_id, created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
