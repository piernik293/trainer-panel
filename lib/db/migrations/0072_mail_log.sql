-- Dziennik maili wysyłanych automatycznie (okres próbny, pakiety): jeden wpis na (rodzaj, odniesienie), żeby ten sam mail nie wyszedł dwa razy. Addytywnie.
CREATE TABLE IF NOT EXISTS mail_log (
  id serial PRIMARY KEY,
  kind text NOT NULL,
  ref text NOT NULL,
  sent_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_log_kind_ref_idx ON mail_log (kind, ref);
