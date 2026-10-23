# Trening podopiecznego (tor C) — inwentarz (C1, 23.10.2026)

Stan kodu na `main` (`bae5e39`) przed zmianami toru C. Nic w tym kroku nie zmieniono.

## 1. Plan w bazie (`lib/db/src/schema/plans.ts`)
- `workout_plans` (klient, tytuł, cel, status `draft`/`active`, `experience_level_used`, `trainer_notes`, `split_type`, `cardio_recommendation`).
- `workout_plan_days` (`day_order`, `day_name`, `subtitle`, `estimated_duration_minutes`, `trainer_notes`).
- `workout_plan_exercises`: `order_in_day`, `working_sets`, `warm_up_sets`, powtórzenia (`rep_type`, `reps_exact`, `rep_range_min/max`, czas, dystans), obciążenie (`load_type/value/instruction`), `rir`, `rpe`, `tempo`, **`rest_seconds`** (pole przerwy już jest; w bazie dev puste: 0 z 0 ćwiczeń planów), `notes`, `client_instructions`.
- Nie ma pola „dzień tygodnia”: dni planu są uporządkowane (`day_order`), nie przypięte do dat.

## 2. Co klient widzi dziś (portal `client-landing`, `pages/plan.tsx`, 1996 linii)
- Plan z dniami i ćwiczeniami (`GET /client-portal/plan`), zapis wykonania **per ćwiczenie**: jedno pole „serie”, jedno „powtórzenia”, jeden „ciężar”, RIR (0–10), notatka, „zrobione” (`ExerciseLogRow`). „Poprzednio” z ostatniej sesji tego ćwiczenia (`formatPrevious`).
- Sesja: `POST /client-portal/sessions[/open]`, `PATCH …/sessions/:id` (ukończenie, notatka, ocena trudności 1–10, `hadPain` tak/nie, `energyLevel`), historia (`/client-portal/history`), podgląd sesji.
- Rozgrzewka: **statyczny szablon RAMP** (`services/rampWarmup.ts`, typ dnia upper/lower/full z grup mięśniowych) — `GET …/sessions/:id/warmup`. Nie korzysta z katalogu ćwiczeń. Brak schłodzenia.
- Nie ma ekranu „Dziś”, zapisu pojedynczych serii, zgłoszenia bólu (jest tylko flaga `hadPain`), trybu offline, manifestu PWA ani service workera (w `public/` są tylko ikony i `robots.txt`).

## 3. Tabele wykonania, które już istnieją
- `workout_sessions` (klient, plan, dzień planu, data, `is_completed`, `completed_at`, `notes`, `difficulty_rating`, `had_pain`, `energy_level`, `performed_by`, `session_mode`, `performed_by_trainer_id`). Indeks częściowy: jedna niezakończona sesja na klienta i dzień planu (`ws_one_active_per_client_day`). Bez kolumn: start, status „przerwany”, `client_uuid`, ocena „za lekko/w sam raz/za ciężko”.
- `exercise_execution_logs`: **jeden wiersz na ćwiczenie** (suma serii, jedna liczba powtórzeń/ciężaru/RIR) + migawka zalecenia (`exercise_id`, nazwa, planowane serie/powtórzenia/RIR). Nie ma danych per seria.
- Dane: w bazie dev 0 sesji, 0 logów (test: tylko fikstury testowe).
- Trener: `GET /clients/:id/workout-sessions[/:sessionId]`, sesje prowadzone przez trenera (`/clients/:id/trainer-sessions/…`, `performed_by = 'trainer'`).

**Wniosek:** nazwa `workout_sessions` z zadania już istnieje i ma dane o innej strukturze. Nie tworzymy drugiej tabeli o tej samej nazwie — rozszerzamy istniejącą (kolumny nullable) i dodajemy `set_logs`, `pain_reports`. Szczegóły w C2.

## 4. Katalog ćwiczeń (`exercises`, 158 aktywnych)
- Sprzęt: `equipment text[]` (+ `required_equipment_all`, `equipment_other`): Hantle 40, Masa własnego ciała 36, Sztanga 30, Wyciąg 29, Maszyna 22, Kettlebell 7, Gumy 6, Ławka 4, Inny 4, Drążek 3, Poręcze 2, TRX 1. Brak ćwiczeń bez sprzętu w polu.
- Złożone/Izolowane: `exercise_type` (87/71) — podstawa podziału „główne/pomocnicze” dla przerw.
- Metadane bezpieczeństwa: `suitable_for_no_activity`, `learning_difficulty`, `suitable_experience_levels`.
- **Ćwiczenia rozgrzewkowe/rozciągające: praktycznie brak.** Jedno ćwiczenie („Rozciąganie gum przed klatką (Band Pull-Apart)”, grupa Barki) i brak pola oznaczającego rolę (rozgrzewka / schłodzenie). → wymaga STOP-5 (lista do akceptacji) przy C4.

## 5. Luki względem zadania
| Wymaganie | Stan |
|---|---|
| Ekran „Dziś” | brak |
| Zapis per seria, poprzedni wynik per seria | brak (tylko agregat per ćwiczenie) |
| Skok ciężaru wg sprzętu | brak (sprzęt jest w katalogu) |
| Zgłoszenie bólu | tylko flaga `had_pain` |
| Ocena „za lekko/w sam raz/za ciężko” | jest `difficulty_rating` 1–10 (inna skala) |
| Rekordy | brak |
| Przerwy wg poziomu | `rest_seconds` w planie jest, bez domyślnych |
| Offline / PWA | brak |

## 6. Propozycja ćwiczeń rozgrzewkowych i rozciągających (STOP-5 — do Twojej akceptacji)
**Nie dodano do bazy.** Standard pól: `docs/KATALOG-STANDARD.md` (rola, ilość i status wymagają nowych kolumn — decyzja tamże). Wszystkie pozycje: sprzęt „Masa własnego ciała” (chyba że podano inaczej), miejsce Siłownia/Dom/Plener, `joint_stress` Niskie, bez asekuracji, poziom Brak aktywności fizycznej (dopuszczone dla wszystkich poziomów), `suitableForNoActivity = true` i `learningDifficulty = 1`, o ile nie napisano inaczej. „Ilość” jest informacją, nie minutnikiem.

### Rozgrzewka (rola: rozgrzewka)
| # | Nazwa | Partie | Wzorzec | Ilość | Uwagi |
|---|---|---|---|---|---|
| 1 | Marsz w miejscu | Całe ciało | Lokomocja | 60 s | |
| 2 | Krążenia ramion | Barki | Mobilizacja | 10 × w każdą stronę | |
| 3 | Krążenia bioder | Pośladki, Odwodziciele | Mobilizacja | 10 × w każdą stronę | |
| 4 | Skręty tułowia | Brzuch, Plecy | Mobilizacja | 10 × na stronę | |
| 5 | Krążenia nadgarstków i łokci | Przedramiona | Mobilizacja | 10 × w każdą stronę | |
| 6 | Kot–krowa | Plecy | Mobilizacja | 10 × | |
| 7 | Przysiad powitalny (bez obciążenia) | Mięśnie czworogłowe uda, Pośladki | Przysiad | 10 × | `learningDifficulty` 2 |
| 8 | Wykroki chodzone (bez obciążenia) | Mięśnie czworogłowe uda, Pośladki | Wykrok | 8 × na nogę | `learningDifficulty` 2; do weryfikacji dla nieaktywnych (równowaga) |
| 9 | Mostek pośladkowy | Pośladki, Mięśnie dwugłowe uda | Zawias biodrowy | 12 × | |
| 10 | Ściąganie łopatek z gumą (Band Pull-Apart) | Barki, Plecy | Aktywacja | 15 × | sprzęt: Gumy oporowe; istnieje już w katalogu pod inną nazwą — dopisać rolę, nie dublować |
| 11 | Rotacje zewnętrzne z gumą | Barki | Aktywacja | 12 × na stronę | sprzęt: Gumy oporowe; `learningDifficulty` 2 |
| 12 | Pompki ścienne | Klatka piersiowa, Triceps | Pchanie poziome | 10 × | |
| 13 | Deska na przedramionach | Brzuch | Stabilizacja tułowia | 20 s | `learningDifficulty` 2 |
| 14 | Wspięcia na palce | Łydki | Wspięcie na palce | 15 × | |
| 15 | Rowerek stacjonarny (lekki) | Całe ciało | Lokomocja | 3–5 min | sprzęt: Maszyna (rower); tylko Siłownia/Dom z rowerem |

### Rozciąganie / schłodzenie (rola: rozciąganie)
| # | Nazwa | Partie | Ilość |
|---|---|---|---|
| 16 | Rozciąganie klatki przy ścianie | Klatka piersiowa | 30 s na stronę |
| 17 | Rozciąganie barku (ramię w poprzek) | Barki | 30 s na stronę |
| 18 | Rozciąganie tricepsa (za głową) | Triceps | 30 s na stronę |
| 19 | Rozciąganie bicepsa przy ścianie | Biceps | 30 s na stronę |
| 20 | Pozycja dziecka | Plecy | 40 s |
| 21 | Rozciąganie czworogłowego (stojąc, przy ścianie) | Mięśnie czworogłowe uda | 30 s na nogę |
| 22 | Rozciąganie tylnej części uda (siad, noga wyprostowana) | Mięśnie dwugłowe uda | 30 s na nogę |
| 23 | Rozciąganie pośladka (leżąc, noga „czwórką”) | Pośladki | 30 s na nogę |
| 24 | Rozciąganie łydki przy ścianie | Łydki | 30 s na nogę |
| 25 | Rozciąganie przywodzicieli (siad skrzyżny) | Przywodziciele | 30 s |
| 26 | Skłon boczny stojąc | Brzuch, Plecy | 20 s na stronę |
| 27 | Rozciąganie zginaczy biodra (wykrok klęczny) | Mięśnie czworogłowe uda, Pośladki | 30 s na nogę; `learningDifficulty` 2 |

Reguły doboru (po akceptacji): rozgrzewka = 1 pozycja ogólna (nr 1, 15) + 2–3 pozycje na partie mięśniowe dnia + 1 aktywacja; schłodzenie = 3–4 rozciągania partii dnia. Dla klientów nieaktywnych i początkujących tylko pozycje z `suitableForNoActivity = true` i `learningDifficulty` ≤ 2. Do czasu akceptacji działa statyczny szablon RAMP (rozgrzewka) i krótki statyczny szablon schłodzenia.
