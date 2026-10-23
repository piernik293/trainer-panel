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

## 7. Zrealizowane (C2–C6) — stan na gałęzi `feature/trening`

### Model danych (migracja 0018, tylko addytywna)
- `workout_sessions` (rozszerzona o nullable): `trainer_id`, `started_at`, `ended_at`, `status` (`in_progress` / `completed` / `aborted`; NULL = starszy zapis), `session_rating` (`too_easy` / `just_right` / `too_hard`), `client_uuid` (unikalny, idempotencja). Notatka dla trenera = istniejące `notes`.
- Przerwana sesja ma `is_completed = true` i `status = 'aborted'` (indeks częściowy „jedna aktywna sesja na dzień” nie blokuje kolejnej próby). **Do „ukończony” używaj `status`, nie `is_completed`.**
- `set_logs`: wynik serii (kg `numeric(6,2)`, powtórzenia, RIR 0–4 — 4 = „4+”, `skipped`, `client_uuid` unikalny; unikalność `(sesja, ćwiczenie, nr serii)` — poprawka serii zastępuje wpis).
- `pain_reports`: miejsce (7 wartości, CHECK w bazie), siła 1–5, opis ≤ 500, `read_by_trainer_at`.
- Stare `exercise_execution_logs` nietknięte; u trenera widoczne jako „Starszy zapis”. Stary zapis po stronie klienta (`plan.tsx`) usunięty — ekran planu tylko do podglądu.

### Reguły (`api-server/src/services/training.ts`, testy w `__tests__/training.test.ts`)
- **Skok ciężaru wg sprzętu:** sztanga 2,5 kg; maszyna/wyciąg 2,5 kg; hantle i kettlebell 1 kg; masa ciała (bez sprzętu obciążającego) — pole ciężaru ukryte, „dodatkowe obciążenie” opcjonalne. Przy kilku wartościach sprzętu: Sztanga > Maszyna/Wyciąg > Hantle/Kettlebell.
- **Rola ćwiczenia (dla przerw):** z `exercise_type` — Złożone = główne, Izolowane = pomocnicze; „moc/siła maks.” = ćwiczenie złożone z planowanymi powtórzeniami ≤ 5 (katalog nie ma osobnego pola; wymaga decyzji, patrz „Do decyzji”).
- **Przerwy (informacja, bez minutnika)** wg poziomu efektywnego planu (`workout_plans.experience_level_used`, czyli już po regule 2 lat): brak aktywności 60–90 s / 60–90 s; początkujący 60–90 s / 1,5–2 min; średniozaawansowany 1–2 min / 2–3 min / moc 3 min; zaawansowany 1,5–2 min / 3–4 min / moc 3–5 min. Trening ≤ 1 h: pomocnicze maks. 1,5 min, główne 2 min, moc maks. 3 min. **Przerwa wpisana przez trenera w planie (`rest_seconds`) zawsze wygrywa.** Dla poziomów bez wartości „moc” używana jest wartość „główne”.
- **Rekord:** seria jest rekordem, gdy jej ciężar jest wyższy niż najlepszy ciężar kiedykolwiek podniesiony przy tej samej lub większej liczbie powtórzeń (z poprzednich sesji, także starego zapisu). Pierwsze wykonanie ćwiczenia nie jest rekordem (brak punktu odniesienia). Przyrost = nowy ciężar − poprzedni najlepszy. Telefon liczy to samo z skompresowanej historii (najcięższy ciężar na liczbę powtórzeń), więc działa offline.
- **Dobór dnia:** następny dzień planu po ostatnio ukończonym (cyklicznie); „trening X z N” = pozycja dnia w planie; „X z Y w tym tygodniu” = ukończone od poniedziałku / liczba dni planu. Po ukończeniu treningu dziś ekran „Dziś” pokazuje najbliższy trening i ostatni wykonany.
- **Rozgrzewka / schłodzenie:** na razie statyczne szablony (RAMP wg typu dnia; krótki szablon rozciągania `services/cooldown.ts`). Lista do katalogu czeka na akceptację (sekcja 6), a standard opisu ćwiczenia w `docs/KATALOG-STANDARD.md`.
- **Wartość startowa serii:** poprzednia seria z tego samego treningu → ta sama seria z poprzedniej sesji (lub jej ostatnia) → plan (dolna granica powtórzeń, ciężar pusty).

### Offline i PWA (`client-landing`)
- Każdy zapis ma UUID z telefonu; kolejka w `localStorage` (`optimatren-trening-queue:v1`) wysyła po kolei, serwer odpowiada `duplicate` przy ponowieniu. Błędy sieci i 5xx/401/408/429 → ponowienie; pozostałe 4xx → odrzucenie bez blokowania reszty. Poprawka nie wysłanej serii zastępuje poprzednią w kolejce.
- Plan dnia jest kopiowany do pamięci telefonu przy otwarciu „Dziś”; rozpoczęty trening można dokończyć bez sieci, także po zimnym starcie (poza Clerk, który offline się nie ładuje).
- Manifest + service worker (`public/sw.js`): cache powłoki i zasobów, `/api` nigdy nie cache’owane. **Service worker rejestruje się tylko w buildzie produkcyjnym** — `scripts/dev-gcp.sh` uruchamia Vite w trybie dev, więc tam PWA nie działa (sprawdzone na `vite preview`).

### Widok trenera
- Profil klienta → zakładka „Treningi” (zastępuje „Historię treningów”; stary komponent `WorkoutHistoryTab.tsx` usunięty 23.10.2026 za zgodą właściciela): zgłoszenia bólu (Nowe/Przeczytane, „Oznacz jako przeczytane”), rekordy, sesje z ukończeniem/przerwaniem, oceną, notatką i seriami; starszy zapis oznaczony.
- Pulpit → „Wymaga Twojej uwagi”: „Zgłoszony ból” (najwyższy priorytet) → „Odpowiedz” → zakładka Treningi.

### Zmiany 23.10.2026 (po decyzjach właściciela)
- **Rozgrzewka skrócona do 5 ćwiczeń (ok. 7 min):** 1 ogólne (2 min), 2 aktywacje (po 1,5 min), 1 mobilizacja (1 min), 1 potencjacja (1 min) z szablonu RAMP typu dnia (`services/rampWarmup.ts`, `buildShortWarmup`). Filtry bezpieczeństwa jak dla generatora: „Brak aktywności fizycznej” — tylko proste (trudność uczenia ≤ 2), bez skoków i bez potencjacji; „Początkujący” — trudność uczenia ≤ 2; pozostali — wszystko. Brak kandydatów w fazie → uzupełnienie z aktywacji, mobilizacji, rozgrzewki ogólnej. Szablon nie ma własnych metadanych, więc trudność i skoki opisuje tabela `ITEM_META` (nieznane ćwiczenie nigdy nie trafia do początkujących). Ekran „Dziś” pokazuje minuty z serwera.
- **Nowe pola katalogu (migracja 0019, tylko nullable, `pg_dump` przed):** `role`, `verification_status`, `joint_stress_areas`, `equipment_detail`, `default_reps`, `default_duration_seconds`, `per_side`. Uzupełnione z danych: `role` z `exercise_type` (87 główne, 71 pomocnicze); `verification_status`: 32 „zweryfikowane”, **126 „do_weryfikacji”** (prawie zawsze brakuje `suitable_for_no_activity`). Reguła „do weryfikacji = niedopuszczone dla początkujących i nieaktywnych” **nie jest jeszcze włączona w generatorze**: wykluczyłaby 126 z 158 ćwiczeń (generator już dziś odrzuca brak `learning_difficulty` i wymaga `suitable_for_no_activity` dla nieaktywnych). Wymaga Twojej decyzji (STOP-5): najpierw uzupełnić `suitable_for_no_activity`, potem włączyć.

### 23.10.2026 (wieczór): lista rozgrzewki zatwierdzona i wdrożona
- **Katalog:** 28 pozycji w `seeds/warmupCatalogueData.ts` (seed `seedWarmupCatalogue`, idempotentny, uruchamiany przy starcie API; `pg_dump` przed). Poprawki właściciela: obciążenie stawów — kolano 7, 8, 20, 27; bark 2, 12; nadgarstek 12; plecy — dół 4, 26; dodane nr 28 „Wymachy nóg (w przód i w bok)” (rozgrzewka, mięśnie dwugłowe uda, biodra jako pośladki/odwodziciele, 10 × na nogę, z podparciem o ścianę, `suitableForNoActivity` tak, trudność 1); nr 10 to istniejące ćwiczenie „Band Pull-Apart” (id 209) — dostało rolę rozgrzewka i ilość, bez duplikatu.
- **Uwaga: kolizja nazwy.** W katalogu już istniało główne ćwiczenie „Wykroki chodzone” (id 97). Pozycja nr 8 ma więc nazwę **„Wykroki chodzone (rozgrzewka)”** (inny slug); seed nigdy nie nadpisuje zwykłych ćwiczeń (`WHERE role IN (...)`). Podobnie „Glute bridge” (id 105) to osobne, zwykłe ćwiczenie obok „Mostka pośladkowego” (nr 9).
- **Dobór (zastępuje szablon RAMP):** rozgrzewka = 1 ogólne (marsz, a rowerek tylko gdy klient ma rower) + 2–3 na partie dnia + 1 aktywacja (wzorzec ruchu „Aktywacja”: mostek, ściąganie łopatek, rotacje z gumą); schłodzenie = 3–4 rozciągania partii dnia. Nieaktywni i początkujący: tylko `suitableForNoActivity` = true, trudność ≤ 2, bez „do weryfikacji”. Guma i rower tylko, gdy klient je ma; miejsce treningu respektowane. Statyczny szablon RAMP zostaje wyłącznie jako zapas przy pustym katalogu (baza testowa bez seedu).
- **Ból stawu:** ćwiczenie ze stawem zgłoszonym przez klienta nie jest dobierane — z opisu w wywiadzie (słowa: kolano/kolan, bark, nadgarstek, lędźwie/kręgosłup, biodro, łokieć) oraz ze zgłoszeń „Coś boli?” z ostatnich 30 dni. Zgłoszenie w trakcie treningu od razu usuwa z schłodzenia rozciągania obciążające ten staw (telefon filtruje po `joints`); w kolejnym „Dziś” działa już po stronie serwera.
- **Poza planami głównymi:** role „rozgrzewka” i „rozciąganie” są odfiltrowane z pul generatora i rekomendacji (`lib/exerciseRoles.ts`) — ćwiczenia ze względu na brak przypisań mięśniowych i tak nie przechodziły sprawdzenia kompletności, filtr jest dodatkowym zabezpieczeniem.
