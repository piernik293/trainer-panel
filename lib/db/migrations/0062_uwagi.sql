-- 0062: „Zgłoś uwagę” (blok 4, za flagą FEEDBACK_ENABLED). Tylko dodawanie: nowa tabela i indeks.
-- Treść jest oczyszczana przed zapisem (jak dziennik błędów); bez zrzutów ekranu; autor tylko jako skrót.
CREATE TABLE IF NOT EXISTS user_feedback (
  id serial PRIMARY KEY,
  created_at timestamp NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('panel', 'portal')),
  author_role text NOT NULL CHECK (author_role IN ('trener', 'klient')),
  category text NOT NULL CHECK (category IN ('blad', 'pomysl', 'niejasne')),
  message text NOT NULL,
  page text NOT NULL,
  app_version text NOT NULL,
  author_hash text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
  read_at timestamp
);
CREATE INDEX IF NOT EXISTS user_feedback_status_created_idx ON user_feedback (status, created_at);
CREATE INDEX IF NOT EXISTS user_feedback_author_created_idx ON user_feedback (author_hash, created_at);
