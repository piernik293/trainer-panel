-- Pakiety i licznik sesji (blok 7): addytywnie, bez płatności online.
CREATE TABLE IF NOT EXISTS client_packages (
  id serial PRIMARY KEY,
  trainer_id integer NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Pakiet sesji',
  total_sessions integer NOT NULL CHECK (total_sessions BETWEEN 1 AND 200),
  price_pln numeric(8,2) CHECK (price_pln IS NULL OR price_pln >= 0),
  valid_until date,
  show_to_client boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  closed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
-- najwyżej jeden aktywny pakiet na podopiecznego
CREATE UNIQUE INDEX IF NOT EXISTS client_packages_one_active_idx ON client_packages (client_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS client_packages_trainer_idx ON client_packages (trainer_id, status);

CREATE TABLE IF NOT EXISTS package_sessions (
  id serial PRIMARY KEY,
  package_id integer NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
  held_on date NOT NULL DEFAULT current_date,
  note text,
  voided_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS package_sessions_package_idx ON package_sessions (package_id);
