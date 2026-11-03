-- Solo: zamiany ćwiczenia w planie („Zamień na inne”), limit 3 na tydzień. Tylko nowa tabela.
CREATE TABLE IF NOT EXISTS solo_exercise_swaps (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_exercise_id integer,
  from_exercise_id integer NOT NULL,
  to_exercise_id integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solo_exercise_swaps_client_idx ON solo_exercise_swaps (client_id, created_at);
