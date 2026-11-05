-- „Wkrótce w Optimatren” (flaga ROADMAP_ENABLED): lista pozycji z głosowaniem „Chcę to”. Addytywnie.
CREATE TABLE IF NOT EXISTS roadmap_items (
  id serial PRIMARY KEY,
  slug text NOT NULL,
  title text NOT NULL,
  blurb text NOT NULL,
  icon text NOT NULL DEFAULT 'star',
  status text NOT NULL DEFAULT 'soon' CHECK (status IN ('soon', 'in_progress', 'done')),
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_items_slug_idx ON roadmap_items (slug);
CREATE TABLE IF NOT EXISTS roadmap_votes (
  id serial PRIMARY KEY,
  item_id integer NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('trener', 'solo', 'podopieczny')),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_votes_item_user_idx ON roadmap_votes (item_id, clerk_user_id);
-- Pozycje startowe (bez dat; „Wkrótce”). Nic z tego nie jest jeszcze zbudowane.
INSERT INTO roadmap_items (slug, title, blurb, icon, sort_order) VALUES
  ('prowadze-trening', 'Prowadzę trening', 'Trener prowadzi trening podopiecznego na żywo z telefonu.', 'dumbbell', 10),
  ('platnosci-blik', 'Płatności BLIK od klientów', 'Podopieczni płacą trenerowi w aplikacji.', 'wallet', 20),
  ('import-ze-zdjecia', 'Import planu ze zdjęcia', 'Zrób zdjęcie kartki z planem — wpiszemy go za Ciebie.', 'camera', 30),
  ('podsumowanie-roku', 'Podsumowanie roku (story)', 'Twój rok treningowy w jednej grafice do udostępnienia.', 'calendar', 40),
  ('rynek-trenerow', 'Rynek trenerów', 'Znajdź trenera albo pozwól, by znaleźli Ciebie.', 'store', 50),
  ('kalkulator-1rm', 'Kalkulator 1RM', 'Szacunek Twojego maksa z serii, ciężar na zadane powtórzenia i talerze na sztangę.', 'calculator', 60),
  ('prognoza-progresu', 'Prognoza progresu', 'Ile kilogramów więcej za ile tygodni — dla Ciebie i w karcie podopiecznego.', 'trending', 70),
  ('bmr-tdee', 'BMR / TDEE i cel wagi', 'Szacunkowe zapotrzebowanie i bezpieczne tempo dojścia do celu.', 'scale', 80),
  ('makroskladniki', 'Makroskładniki i szablony żywienia', 'Szablony od trenera i proste podsumowanie dnia.', 'utensils', 90),
  ('suplementy', 'Suplementy w pigułce', 'Krótko o tym, co ma dowody: białko, kreatyna, witamina D3, omega-3.', 'pill', 100),
  ('plany-nawykow', 'Plany nawyków', 'Sen, kroki i woda połączone z Twoją serią.', 'check', 110),
  ('asystent-ai', 'Asystent AI', 'Odpowiedzi na pytania o trening; limit w wersji darmowej, więcej w Pro.', 'sparkles', 120)
ON CONFLICT (slug) DO NOTHING;
