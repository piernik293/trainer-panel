# Postęp — dziennik etapów

## 24.10.2026 — Etap 1: analiza zewnętrznej bazy ćwiczeń (feature/baza-cwiczen-analiza)
- Źródło: free-exercise-db (Unlicense), 876 pozycji; OpenGym/exercises-dataset odrzucone (licencja). Zdjęć i tekstów nie używamy.
- Wynik: 121 nowych, 131 duplikatów, 179 wariantów, 3 do decyzji, 442 pominięte. Szczegóły: `docs/BAZA-ANALIZA.md`, `docs/BAZA-KANDYDACI.csv`, `docs/BAZA-CELE-NASZE.csv`.
- Nic nie wprowadzono do bazy ani seedu. Etap 0 (krok A/B katalogu, `KATALOG-DO-PRZEGLADU.csv`) pominięty — brak treści kroków i pliku na serwerze.

## 24.10.2026 — aktualizacja po decyzjach właściciela
- Baza zewnętrzna (feature/baza-cwiczen-analiza): druga kontrola duplikatów, 12 podstaw pliometrii, 29 wariantów-zamienników, tabela celów, paczki do przeglądu `docs/BAZA-PACZKA-01…05.csv` (91 ćwiczeń). Import czeka na przegląd.
- Katalog (feature/katalog-metadane): krok A wdrożony (migracja danych 0020: flagi stawów 109, `suitableForNoActivity=false` 29; kopia bazy w `~/backups/`), krok B → `docs/KATALOG-DO-PRZEGLADU.csv`; opis: `docs/KATALOG-KROK-A.md`.
- Drabinki (feature/drabinki): propozycja `docs/DRABINKI.md` + CSV; STOP-5 przed wdrożeniem.
- Progresja (feature/progresja): projekt `docs/PROGRESJA.md`; nic nie wdrożono.

## 24.10.2026 — Faza 1, bloki 1–2
- Blok 1: dobór ćwiczeń głównych nie wykluczał ćwiczeń wg zgłoszonego stawu (dziura). Naprawione: `services/jointExclusion.ts`, testy 48 (21 + 27), opis w `docs/PRZEGLAD-BLEDOW.md`.
- Blok 2: scalono `fix/flagi-stawow-generator` i `feature/katalog-metadane` (krok A, migracja 0020) do `main`. Przed scaleniem: `pg_dump` w `~/backups/`; API 2388/2388, panel 739/739, portal 197/197, bezpieczeństwo generatora 101/101, typecheck i build OK, test dymny 131/0.

## 24.10.2026 — Faza 1, bloki 3–7 (gałęzie, bez merge do main)
- Blok 3: `docs/KATALOG-DO-PRZEGLADU.csv` (drabinki na początku, kolumna `potrzebne_do_drabinki`), `BAZA-PACZKA-06.csv`, „Piłka lekarska” (`feature/pilka-lekarska`).
- Blok 4: narzędzie importu `scripts/baza/import-paczka.ts` + migracja 0021 (`feature/import-cwiczen`); nie uruchomione na bazie aplikacji.
- Blok 5: `docs/ROADMAP.md` (`docs/roadmapa`).
- Blok 6–7: drabinki 2b (migracja 0022), zasada „brak aktywności” (`docs/BRAK-AKTYWNOSCI.md`) na `feature/drabinki`. API 2404/2404, panel 742/742, bezpieczeństwo generatora 101/101, typecheck OK.

## 24.10.2026 — Faza 1, decyzje 1–5 i A/B/D (stan do kontynuacji po /clear)
- **Decyzja 1:** parametry progresji (`docs/PROGRESJA.md`, gałąź `feature/progresja`) ZATWIERDZONE — wdrożenie dopiero po starcie bety. Nic nie zmieniono.
- **Decyzja 2 — scalone do `main` (lokalnie, BEZ push):** `feature/pilka-lekarska`, `docs/roadmapa`, `feature/import-cwiczen` (0021), `feature/drabinki` (0022). Po każdym: pełne testy, bezpieczeństwo generatora 101/101, typecheck, build, test dymny 131/0. Końcowo API 2442, panel 742, portal 197. `pg_dump` przed 0021 i 0022 w `~/backups/`. Dodatkowo na `main`: `mockup-sandbox` — domyślne PORT/BASE_PATH (build całego repo padał poza Replit).
- **Katalog — 10 ćwiczeń drabinek (odpowiedź „1–10 tak”):** gałąź `feature/katalog-drabinki-decyzje`, migracja danych 0023 (sNA false ×9, true tylko 129; urządzenie 92/126; stawy „bez stawu” 129/131/195; status zweryfikowane). ZASTOSOWANA na bazie aplikacji i testowej.
- **Gałęzie czekające na zgodę na merge (każda: pełne testy zielone, test dymny 131/0):**
  - `feature/ostrzezenie-staw` (decyzja 3): ostrzeżenie przy ręcznym dodaniu na zgłoszony staw, [Anuluj]/[Dodaj mimo to], tabela `joint_warning_decisions` (migracja 0024 — ZASTOSOWANA na bazie aplikacji i testowej).
  - `feature/sprzet-talerz-uchwyty-kolka` (decyzja 4): 3 pozycje sprzętu (API, import, formularz, normalizator).
  - `feature/rir-podpowiedz` (decyzja 5): szary tekst „Cel: RIR 3–4 / 2–3” w kreatorze i edytorze.
  - `feature/import-miesnie` (B): kolumny `mięśnie_główne/pomocnicze` w paczkach 1–6 (zawiera merge `feature/baza-cwiczen-analiza`), walidacja, zapis przypisań; mapowanie w `docs/IMPORT-LOG.md`.
  - `feature/audyt-stawow` (A, zbudowana NA `feature/ostrzezenie-staw`): `docs/AUDYT-PLANOW.md` (1 przypadek, bez zamiennika), ostrzeżenie w planie + „Zamień na: …”.
  - `docs/wdrozenie-plan` (D): `docs/WDROZENIE-PLAN.md`.
- **Kolejność merge (proponowana):** katalog-drabinki-decyzje → ostrzezenie-staw → audyt-stawow → sprzet → rir-podpowiedz → import-miesnie (po sprzęcie: 122/122 wierszy paczek przechodzi walidację) → wdrozenie-plan.
- **UWAGA baza:** baza aplikacji ma tabelę `joint_warning_decisions` (0024), której `main` jeszcze nie zna. NIE uruchamiaj `scripts/db-setup-gcp.sh` na `main` przed scaleniem `feature/ostrzezenie-staw` — `drizzle-kit push` proponuje usunięcie tabeli (bez TTY odmawia; z TTY nie potwierdzaj). Ten sam mechanizm wystąpił przy 0022 (rozwiązany scaleniem).
- **Nic nie wypchnięto na GitHub** (main i nowe gałęzie lokalnie). Usługi dev działają z `main`.

## 24.10.2026 — scalenie wszystkiego do `main`, db-setup tylko addytywny, plan demo
- **db-setup-gcp.sh (PILNE, stała zasada w CLAUDE.md):** na istniejącej bazie `drizzle-kit push` NIE jest uruchamiany (wcześniej przy każdym uruchomieniu po cichu usuwał indeksy/klucze z migracji — np. `survey_invites_trainer_id_idx`, odtwarzany przez API przy starcie). Pusta baza: push tylko gdy plan bez DROP/RENAME/TRUNCATE/DELETE/zmiany typu. Migracje z instrukcją niszczącą odrzucane (wyjątek 0011). `--check` = plan bez wykonania. Test: `scripts/test-db-setup.sh` (OK).
- **Scalone do `main` (po każdym pełne testy, bezpieczeństwo 101/101, typecheck, build, test dymny 131/0):** fix/db-setup-bez-drop, katalog-drabinki-decyzje (0023), ostrzezenie-staw (0024), audyt-stawow (0025 `plan_change_log` — potwierdzenie zamiany + historia planu), sprzet-talerz-uchwyty-kolka (+ Kółka gimnastyczne, Uchwyty do pompek w wywiadzie), rir-podpowiedz (konflikt w PlanEditor rozwiązany), import-miesnie, docs/wdrozenie-plan. Jedno czerwone (typecheck testu audytu) — poprawione osobnym commitem, weryfikacja powtórzona. Końcowo: API 2474, panel 751, portal 198.
- **Migracje 0023–0025 zastosowane** na bazie aplikacji i testowej (`pg_dump` przed każdą w `~/backups/`).
- **Plan demo (klient #224, poziom Początkujący, zgłoszony bark z 23.10):** nowy plan #101 wygenerowany generatorem (3 × full body, ten sam przebieg co kreator) — **szkic, nieaktywny**: aktywacja odrzuca triceps 4,5 > 4 serii (balance-week nie zmniejsza ćwiczeń wielostawowych — pompki 3 × 3 serie). Sprawdzenie: żadne ćwiczenie powyżej szczebla klienta, żadne z tagiem „Bark”. Uwagi: Hip thrust (104) ma `difficulty_level` Średniozaawansowany, ale `suitable_experience_levels` zawiera Początkujący; pompki 116/118 bez tagów stawów (117 ma Bark, Nadgarstek). Stary plan #69 nadal aktywny (ma 2 sesje).
- **Eksport (na prośbę):** `~/BAZA-KANDYDACI.csv` (876), `~/NASZE-CWICZENIA.csv` (185) — poza repo.
- **Do decyzji:** aktywacja planu #101 (np. pompki dzień C 3 → 2 serie) i poprawka balance-week vs aktywacja; tagi stawów pompek 116/118; Hip thrust — poziom.
- **Push (zgoda 24.10):** `main` i wszystkie gałęzie lokalne na GitHubie (bez force), żadna nie odstaje od `origin`. Sesja została raz przerwana po scaleniu `docs/wdrozenie-plan` — stan sprawdzony (brak scalania w połowie, weryfikacja po ostatnim scaleniu zielona: API 2474, bezpieczeństwo 101, panel 751, portal 198, build, test dymny 131/0). Plan #101 ponownie sprawdzony w bazie: 0/18 ćwiczeń z tagiem „Bark”, 0 ze szczebla ponad poziom.
- **Następny krok:** decyzje z listy „Do decyzji” wyżej (aktywacja planu #101 / balance-week, tagi stawów 116/118, poziom Hip thrust); import paczek po wypełnieniu `decyzja_trenera`.

## 24.10.2026 — wyrównanie objętości, katalog 0026, plan demo (gałąź `fix/balance-week-limit`, NIE scalona)
- **Wyrównanie tygodnia (balance-week):** przyczyna planu #101 — pętla kończyła się, gdy najbardziej przekroczona partia była na minimum serii, więc triceps (pośrednio z pompek, 4,5 > 4) zostawał ponad limitem; do tego liczenie sumą współczynników zamiast max (jak aktywacja). Teraz `services/weekBalance.ts`: liczy `computeVolumeCore` tak jak aktywacja (ta sama wersja wytycznych i poziom), partia zablokowana nie zatrzymuje pozostałych, faza 2 do 1 serii, w obrębie grupy najpierw ćwiczenie z największą liczbą serii; nadwyżka (`residual`) i błąd wyrównania pokazywane w kreatorze. Test: 200 losowych szkiców porównanych z regułą aktywacji.
- **Migracja danych 0026** (pg_dump przed, baza aplikacji i testowa): pompki 116 i 118 — Bark, Nadgarstek; Hip thrust (104) — poziom Początkujący.
- **Plan demo #103** (klient #224): wygenerowany po poprawce, **aktywacja 200**, 0 ostrzeżeń stawowych, 0 ćwiczeń z tagiem Bark, 0 ponad poziom/szczebel (15 ćwiczeń; pompki wypadły przez bark). Dzień 1 mocno przycięty (ćwiczenia „regresji” redukowane najpierw — zasada bez zmian). Do generowania demo-trener (FREE, limit 1/mies.) był na chwilę przełączony na PRO i przywrócony na FREE. Pośredni #102 zarchiwizowany; #69 (stary) nadal aktywny, #101 szkic. Aktywacja nie wyłącza innych aktywnych planów klienta (stan istniejący).
- **Pełne testy na końcu:** API 2481, bezpieczeństwo 101/101, panel 752, portal 198, typecheck, build, test dymny 131/0, test db-setup OK.
- **Do decyzji:** scalenie i push `fix/balance-week-limit`; czy aktywacja ma archiwizować poprzedni aktywny plan klienta (#69 i #103 aktywne jednocześnie).

## 24.10.2026 — jeden aktywny plan, STOP 7 (gałąź `feature/jeden-aktywny-plan`, NIE scalona)
- `fix/balance-week-limit` scalona do `main` i wypchnięta (drzewo identyczne z wcześniej zweryfikowaną gałęzią).
- **Aktywacja archiwizuje poprzedni aktywny plan klienta** (transakcja; nic nie usuwane, sesje/serie zostają przy starym planie). Indeks `workout_plans_one_active_per_client` (migracja 0027, pg_dump przed). Panel: „Aktywny plan {nazwa} zostanie zarchiwizowany. Historia treningów zostaje.” [Anuluj] [Aktywuj].
- **Dane:** plan #69 (klient #224, 2 sesje) zarchiwizowany; aktywny #103.
- **CLAUDE.md, STOP 7:** bez zgody nie zmieniać pakietów, uprawnień ani danych kont — także kont testowych i demo; gdy limit blokuje test: zapytaj albo użyj `trainer_panel_test` (treść potwierdzona przez właściciela).
- **Testy:** API 2484, bezpieczeństwo 101/101, panel 754, portal 198, typecheck, build, test dymny 131/0.
- Scalone do `main` i wypchnięte (zgoda 24.10).

## 25.10.2026 — gałąź `feature/import-odmiany` (z `main`, NIE scalona)
**Blok 1 + 2A/2D (zgoda właściciela na STOP-2 i `--apply`):**
- Migracja **0028** (pg_dump `~/backups/trainer_panel_przed_0028_20261025-1738.sql`; baza aplikacji i testowa): `exercises.parent_exercise_id` (FK, indeks częściowy), `variant_grip`, `variant_position`, `unilateral`, `reviewed_by_trainer` (NOT NULL, domyślnie true — istniejące `own` = true), `hidden` (domyślnie false), `intensity`. Wyłącznie addytywnie.
- Nowy sprzęt na zamkniętych listach: **Roller**, **Landmine** (importer, panel, normalizator; „Roller” także w wywiadzie klienta — potrzebne do schłodzenia, blok 5).
- Generator (`isGeneratorSafe` w `lib/exerciseRoles.ts`, podpięty w generate-day, day-recommendations, recommendations): ukryte nigdy; niezweryfikowane tylko dla poziomu efektywnego średniozaawansowany/zaawansowany; pliometria (intensity) nigdy BA/P, „wysoka” tylko zaawansowany. Ręczne dodawanie przez trenera bez zmian. Test: `isGeneratorSafe.test.ts`.
- Importer (`paczkaImport.ts`, tryb `--odmiany`): kolumny `odmiana_id` (numer albo `=źródło_id`), `chwyt`, `pozycja`, `jednostronne`, `intensywnosc`, `nie_duplikat`; pusta decyzja = tak; `suitableForNoActivity` zawsze false; `reviewed_by_trainer` = false; odmiana porównywana tylko dokładną nazwą/slugiem (nie rozmyciem); rodzic zapisywany przed odmianą. Test: `paczka-import-odmiany.test.ts` (+48 istniejących zielone).
- Dane: `scripts/baza/import_2a.py` składa paczki 1–6 z decyzjami `BAZA-KANDYDACI.csv` → `docs/BAZA-IMPORT-2A.csv`. **Zaimportowano 121** (91 głównych + 30 odmian). Poprawki z pkt D: Chin-Up → średniozaawansowany; Bench Dips + staw Bark; Natural GHR → odmiana Floor GHR (nie 141); Split Squats → mięsień czworogłowy, po porównaniu z 95 zapisany jako **odmiana 95** (ten sam ruch, bez podparcia).
- Uwagi do właściciela: (a) `Dumbbell_Raise` (duplikat 146) pominięty; (b) w 4 odmianach `nasze_id` w CSV nie zgadzał się z numerem w opisie powodu — wzięto numer z opisu: Cable_Lying_Triceps_Extension 156→157, Reverse_Cable_Curl 153→204, Smith_Machine_Close-Grip_Bench_Press 173→158, Ring_Dips 220→175; (c) pliometria z „nowych” (Box Skip, Fast Skipping, Carioca, Butt Kick, Star Jump, Split Jump, Jump Squat) dostała intensywność i poziom min. średniozaawansowany; (d) Bodyweight Squat oznaczony `nie_duplikat` (przysiad do skrzyni 90 to inne ćwiczenie); (e) Seated_Cable_Shoulder_Press (odmiana 137) i Cable_Shoulder_Press (nowe) są do siebie bardzo podobne — do oceny w „Do weryfikacji”.

### 25.10.2026 — bloki 2B i 2C (plik `~/POMINIETE-POSORTOWANE.csv`)
- **2B:** 146 odmian pod wskazane ćwiczenia główne (`scripts/baza/import_2b.py` + własne opisy `odmiany_opisy_{1,2,3}.tsv`; metadane — wzorzec, mięśnie, stawy, rola, uwaga bezpieczeństwa — dziedziczone z ćwiczenia głównego w bazie). Wszystkie 146 zapisane z `parent_exercise_id`.
- **2C:** 64 ćwiczenia z grup (`scripts/baza/import_2c.py` + `grupy_2c.tsv`): G1 kettlebell 8 + własny „Swing kettlebell oburącz” (jednorącz = odmiana), G2 olimpijskie 3 (tylko zaawansowany, cel sportowy), G3 pliometria 29, G3b piłka lekarska 5, G5 roller 6, G6 landmine 5, G7 kalistenika 4 (zaawansowany), G8 wiosłowanie do brody 2 (sztanga + odmiana na wyciągu, staw Bark, min. średniozaawansowany), G9 szyja 2. G4 cardio — nie importowane (moduł kondycyjny, blok 7).
- G3 bez duplikatów: pominięto Rocket_Jump (= 250/1103), Scissors_Jump (= 1104), Front_Cone_Hops_or_hurdle_hops (= Hurdle_Hops). Intensywność: niska (technika biegu), średnia (obunóż, boczne, pompki z wybiciem), wysoka (jednonóż, zeskoki, bounds); wszystko od poziomu średniozaawansowanego, „wysoka” tylko zaawansowany.
- G6: pominięto Bent_Over_Two-Arm_Long_Bar_Row (= 132); One-Arm_Long_Bar_Row zapisane jako odmiana Bent_Over_One-Arm_Long_Bar_Row (to samo ćwiczenie).
- Importer: nowa rola **„technika biegu”** (wyłączona z puli planu głównego jak rozgrzewka/rozciąganie); kolumna `cele` → `training_goals` (nazwy celów klienta, np. „Cel sportowy”); walidacja „najwyżej jeden mięsień główny” (baza: indeks `ema_one_primary_per_exercise_idx`); sprzęt „Inny” → tylko siłownia.
- G5 rolowanie: rola `rozciąganie` (to jest dziś pula schłodzenia), wzorzec „Mobilizacja”, sprzęt Roller.
- Wszystkie importowane: `suitableForNoActivity = false`, `reviewed_by_trainer = false`. Testy: import 56→60 + `isGeneratorSafe` 4, razem 164 zielone w obszarze; typecheck OK.
- Uwagi: istniejące pliometryczne 249–258 nie mają `intensity` (dane trenera, nie ruszane) — zalecam nadać (np. 256 niska, 253/251/250/258/249 średnia, 252/254/255/257 wysoka); ze względu na regułę „pliometria nigdy BA/P” 256 „Nauka lądowania” (poziom Początkujący) po nadaniu intensywności zniknęłby z planów początkujących — **do decyzji**. Ćwiczenia z wyposażeniem spoza listy (Heavy_Bag_Thrust, Sledgehammer_Swings: „Inny”) generator pominie.

### 25.10.2026 — blok 4: miejsce treningu, audyt pokrycia
- **4a Sprzęt wg miejsca (zgoda STOP-5):** stare → nowe. **Siłownia:** było — pełna lista tylko gdy klient nie zaznaczył nic, inaczej tylko zaznaczone pozycje; jest — zawsze pełny katalog (+ Sztanga łamana, Piłka lekarska, Piłka stabilizacyjna, Roller, Landmine, Rower/orbitrek) **plus** to, co klient zaznaczył (kółka, uchwyty). **Siłownia plenerowa:** było — tylko zaznaczone; jest — zaznaczone **+ gumy oporowe**. **Dom:** bez zmian (zaznaczone + masa ciała). Kod: `expandEquipmentForLocation` (`equipmentNormalizer.ts`), użyte w `effectiveClientEquipment` (generator, rekomendacje, zapis ręczny) i w `planDraftInputService`. Testy: `equipment-empty-fallback.test.ts` zaktualizowany do nowej reguły; 533 testy sprzętu/bezpieczeństwa zielone.
- **4c Audyt:** `scripts/baza/pokrycie.ts` → `docs/POKRYCIE.md` (wzorzec × miejsce × poziom, zweryfikowane/wszystkie) i `docs/POKRYCIE-DZIURY-BA-P.md` (lista do przeglądu trenera z kandydatami do zatwierdzenia).
- **4d Dziury:** dla Ś/Z (0 ćwiczeń) dopisano 6 WŁASNYCH ćwiczeń (niezweryfikowane, opisy własne, `source = wlasne-uzupelnienie`): pompki pike (dom, pchanie pionowe), przywodzenie nogi leżąc na boku (dom), uginanie ramion z ręcznikiem (dom), deska z dotknięciem barku (anti-rotacja, dom), uginanie ramion z gumą i Pallof press z gumą (plener). Dla BA/P decyduje trener — lista w `POKRYCIE-DZIURY-BA-P.md`; jedyna dziura bez żadnego kandydata: **dom bez sprzętu — pchanie pionowe (BA, P)**.

### 25.10.2026 — blok 5 (schłodzenie) i blok 6 (kroki)
- **Blok 5:** do puli schłodzenia weszły rolowanie (G5, tylko gdy klient ma Roller w sprzęcie albo trenuje na siłowni; najwyżej jedno rolowanie na schłodzenie), rozciągania z odmian, rozciąganie szyi i **3 własne ćwiczenia oddechowe** (oddech przeponowy leżąc, oddech pudełkowy siedząc 4-4-4-4, wydłużony wydech; opis „Spokojny oddech na koniec treningu”, bez obietnic zdrowotnych). Jedno ćwiczenie oddechowe zamyka każde schłodzenie (3 rozciągania + 1). Ukryte nigdy; niezweryfikowane tylko dla Ś/Z; BA/P nadal tylko `suitableForNoActivity = true` i trudność ≤ 2 — **ćwiczenia oddechowe i rolowania są niezweryfikowane, więc BA/P ich nie dostaną, dopóki trener ich nie zatwierdzi (do decyzji)**. Dodano czasy (30 s / 60–90 s) i „na stronę” do importowanych rozciągań (data update 35 wierszy; backup `przed_czasami-rozciagan`). Nowy wzorzec „Oddychanie”. Testy: `warmupSelection.test.ts` +4.
- **Blok 6 (kroki), migracja 0029** (pg_dump `przed_0029_20261025-1808`): tabela `daily_steps` (klient, dzień, kroki 0–100000, źródło „ręcznie”, unikalne (klient, dzień)) + `clients.steps_goal`. API: portal `GET/PUT /client-portal/steps`, `PUT /client-portal/steps-goal`; trener `GET /clients/:id/steps`, `PUT /clients/:id/steps-goal`. Okno wpisu: dziś i 6 dni wstecz. Portal: kafelek „Kroki dziś” (pole numeryczne, pasek do celu, 7 słupków, średnia tygodnia, cel 6 000 / 8 000 / 10 000 lub brak; tekst „Wpisz kroki z telefonu lub zegarka.”), kolejka offline jak przy seriach (jedna wartość na dzień, wysyłka po powrocie sieci). Panel: karta „Kroki” w zakładce treningów klienta (średnia, realizacja celu, ustawienie celu). Testy: API 11 (walidacja, nadpisanie, izolacja klient A/B i trener A/B), portal +9, panel +3. Apple Health / Health Connect — w ROADMAP.

### 25.10.2026 — blok 3 (panel: „Do weryfikacji”, odmiany w edytorze)
- **Lista „Do weryfikacji”** (`/exercises/review`, przycisk w bibliotece ćwiczeń): niezweryfikowane ćwiczenia z filtrami (poziom, wzorzec, sprzęt), kolumny: nazwa, **odmiana czego**, poziom, sprzęt, stawy, opis. **Zweryfikuj** (`reviewed_by_trainer = true`, status zweryfikowane — NIE ustawia `suitableForNoActivity`), **Ukryj** (ukryte nie trafia do generatora, nic nie jest usuwane; zakładka „Ukryte” z „Przywróć”). Osobny przycisk **„Dla braku aktywności…”** z własnym potwierdzeniem (API: `/exercises/:id/no-activity`, wymaga `confirm`, zweryfikowanego ćwiczenia i oceny trudności nauki; okno potwierdzenia mówi, że ćwiczenie zostanie też zweryfikowane). Uprawnienia jak przy edycji: ćwiczenia z katalogu publicznego zmienia administrator katalogu (zwykły trener widzi listę bez przycisków).
- **Edytor planu:** przy ćwiczeniu rozwijana lista „Odmiany (N)” ze sprzętem (rodzina: dla głównego jego odmiany, dla odmiany — ćwiczenie główne i rodzeństwo), „Zamień” zachowuje dawkowanie i zapisuje się w historii planu (`POST /plans/:id/exercises/:planExerciseId/variant-replacement`, rodzaj `zamiana_odmiana`).
- **Generator:** domyślnie ćwiczenie główne; odmiana tylko gdy główne nie przechodzi filtrów (sprzęt miejsca, staw, poziom, ukryte) — `preferMainOverVariants` w trzech trasach puli. Wszystkie filtry (sprzęt/miejsce/staw/poziom/ukryte/niezweryfikowane) działają na odmianach jak na zwykłych ćwiczeniach, bo to wiersze katalogu.
- Testy: API `exercise-review` 7, `plan-variant-replacement` 3, `isGeneratorSafe` +3; panel `exercise-review` 5, `variant-picker` 3.

### 25.10.2026 — weryfikacja końcowa gałęzi `feature/import-odmiany` (NIE scalona do `main`)
- Pełne testy: API 2530 (po dostosowaniu 3 fikstur do nowej reguły „siłownia = pełny katalog”: sprzęt spoza katalogu siłowni, np. kółka gimnastyczne, albo miejsce Dom — asercje bez osłabienia), bezpieczeństwo generatora 101/101, panel 765, portal 208, typecheck OK, build OK, test dymny 131 OK / 0 błędów.
- Baza aplikacji: migracje 0028 i 0029 (pg_dump przed każdą w `~/backups/`); import: 121 + 146 + 64 ćwiczeń z plików + 6 własnych na dziury + 3 oddechowe; wszystkie importowane `suitableForNoActivity = false`, `reviewed_by_trainer = false`; ćwiczenia „own” (185) bez zmian.
- Do decyzji właściciela: patrz raport (lista na końcu sesji) — m.in. merge do `main`, zatwierdzanie ćwiczeń BA/P (`docs/POKRYCIE-DZIURY-BA-P.md`), intensywność istniejących 249–258, KONDYCJA.md.

## 25.10.2026 — gałąź `feature/dom-kondycja` (decyzje po imporcie)

### Blok 1 — scalenie
- `feature/import-odmiany` scalona do `main` (commit 4e9600a, bez force) i wypchnięta. Nowa gałąź robocza: `feature/dom-kondycja`.

### Blok 2 — dane katalogu (migracja danych 0030, pg_dump `przed-0030-20261025-1952.dump`)
- Tylko UPDATE-y, bez zmian schematu; powtarzalne. Zastosowana na bazie aplikacji i testowej.
- 2a) rolowanie (6): zweryfikowane, `suitableForNoActivity = false`. 2b) oddechowe (3): zweryfikowane, `suitableForNoActivity = true` (generator ich sam nie dodaje — blok 3b).
- 2c) pliometria: Skoki pogo i Przeskoki boczne — niska; Skok z zamachem, Skok w dal z miejsca, Wskok na podwyższenie, Skok boczny z zatrzymaniem — średnia; Zeskok z wybiciem, Skoki boczne jednonóż, Skok jednonóż — wysoka. 256 „Nauka lądowania”: rola „przygotowanie do skoków” (poza pulą zwykłego planu), bez intensywności, poziom od Początkującego, nie dla brak aktywności.
- 2d) Heavy_Bag_Thrust → sprzęt „Worek bokserski”, Sledgehammer_Swings → „Młot i opona” (nie ukryte, cele i poziom bez zmian: sprawność, cel sportowy, od Ś). Nowy sprzęt dodany do zamkniętych list (importer, normalizator, walidacja ćwiczeń, panel); „Worek bokserski” wchodzi do pełnego wyposażenia siłowni.

### Blok 3 — schłodzenie i oddech (migracja 0031, pg_dump `przed-0031-20261025-*.dump`)
- **3a Ekran „Dziś”:** Rozgrzewka, Trening i Schłodzenie to trzy osobne kafelki, każdy z własnym przyciskiem i otwierany osobno (`RampFlow` dla rozgrzewki i schłodzenia, `TrainingFlow` tylko dla ćwiczeń). Schłodzenie ma opis „można pominąć”; po zakończeniu treningu zostaje na ekranie „Dziś” do końca dnia (zapisane lokalnie, działa offline, bez ćwiczeń obciążających zgłoszony staw). Kafelek pokazuje „Zrobione”. Starsze, zapisane treningi (etap rozgrzewki/schłodzenia) wczytują się poprawnie. Nawigacji portalu nie zmieniałem.
- **3b Oddech:** kolumna `clients.breathing_cooldown` (domyślnie `false`), przełącznik „Kończ schłodzenie minutą spokojnego oddechu” w „Moje konto” (portal). API: `GET/PUT /client-portal/settings` (tylko sam podopieczny; trener nie ma endpointu). Generator sam oddechu NIE dodaje — dopiero po włączeniu jest jedno ćwiczenie na końcu każdego schłodzenia. Oddechowe i rolowanie dostały `verification_status = zweryfikowane` (migracja 0030), żeby BA/P mogły dostać oddech.
- **3c Rolowanie:** tylko w dwóch dniach tygodnia planu (pierwszy dzień i środkowy: `rollerDayIndexes`), nie więcej niż jedno w schłodzeniu; tylko z Rollerem lub na siłowni; brak dla BA i P (rolowanie `suitableForNoActivity = false`).
- **3d Testy:** `warmupSelection` (domyślnie brak oddechu, po włączeniu na końcu dla każdego poziomu, rolowanie ≤ 2 dni dla planów 1–7 dni, BA bez rolowania), `client-settings` (4: domyślnie, włącz/wyłącz, izolacja klientów, trener/niezalogowany), portal: `BreathingSetting` 2, `RampFlow` 2, `TodayCard` 2, przepisany przebieg treningu i `run`.

### Blok 4 — trening w domu i sprzęt
- **4a/4b Wywiad (teksty pod listą sprzętu):** dom + „Brak sprzętu” → „Bez sprzętu część ćwiczeń nie będzie możliwa…”; dom + zaznaczona tylko guma i poziom efektywny Brak aktywności/Początkujący → „Guma wystarczy na start…”. Poziom wywiad zna już na tym ekranie (pytanie o poziom jest wcześniej), więc przypadek „poziom nieznany” obsłużony tylko w funkcji (`equipmentHint`: bez poziomu tekst widzą wszyscy z samą gumą). Teksty nie blokują przejścia dalej. Reguły w `lib/survey-config` (`equipmentHint`).
- **4d Sprzęt wg celu:** „Worek bokserski” na liście tylko w domu, „Młot i opona” w domu i na siłowni plenerowej — oba tylko przy celach Poprawa sprawności i Cel sportowy (przy innych ukryte, odpowiedź czyszczona przy zmianie celu). Siłownia ma worek w pełnym wyposażeniu domyślnie; przy tych dwóch celach pojawia się tam opcjonalny ekran z jedną pozycją „Młot i opona” (`showEquipmentField(miejsce, cel)`), nie wliczany domyślnie nigdzie. Formularz wywiadu trenera pokazuje te same pozycje wg celu (dla siłowni bez zmian — ekran sprzętu się nie pojawia).
- **4c Generator:** bez zmian w silniku — pula dostaje wyłącznie ćwiczenia zgodne ze sprzętem i poziomem, a wzorzec bez kandydata jest pomijany (silnik zwraca „brak kandydata”, nie luzuje filtrów). Test `homeNoEquipment` (dom bez sprzętu: brak przyciągania i pchania pionowego dla BA/P, nic ponad poziom, pompki ścienne/na kolanach zostają, plan nie jest dopełniany; z gumą i z hantlami przyciąganie jest).
- **4e Panel:** ostrzeżenie `HOME_NO_EQUIPMENT` (bez blokady) w założeniach planu, gdy miejsce = Dom i brak gumy/hantli/drążka: „Brak sprzętu: plan nie obejmuje ćwiczeń na plecy. Zaleć klientowi minimum gumę oporową, a najlepiej hantle.” Znika po dodaniu któregoś z nich.
- **4f Testy:** `surveyEquipment` (teksty i widoczność worka/młota wg celu × miejsce), `planDraftInput` (ostrzeżenie), `homeNoEquipment`. Siłownia zawiera worek (pełny katalog, `FULL_GYM_EQUIPMENT`).
- **4g** Przeliczone `docs/POKRYCIE.md` i `docs/POKRYCIE-DZIURY-BA-P.md` (lista do akceptacji pokazana właścicielowi w czacie; niczego nie weryfikowałem).

### Blok 5 — pliometria wg celu i doświadczenia (migracja 0032, pg_dump `przed-0032-20261025-*.dump`)
- **Wywiad (5b):** nowe pytanie „Czy masz doświadczenie ze skokami (np. skakanie na skrzynię, przeskoki)?” — Nie — dopiero zaczynam / Trochę — robiłem/am okazjonalnie / Tak — robię regularnie. Tylko przy celu „Cel sportowy” (ekran `jumps` zaraz po pytaniach o sport; odpowiedź czyszczona przy zmianie celu, API zapisuje ją tylko przy tym celu). Kolumna `surveys.jump_experience` (nullable). Formularz wywiadu trenera ma to samo pole (trener może zmienić), karta wywiadu w profilu klienta je pokazuje. Brak odpowiedzi = jak „Nie”.
- **Generator (5a):** blok pliometryczny = 2–4 ćwiczenia na początku treningu oporowego (po rozgrzewce, klasa „plyometric_power” z dawkowaniem 4×4–6 i pełną przerwą): Cel sportowy → niższe z (poziom efektywny, doświadczenie): rząd 1 (P albo „Nie”) = Nauka lądowania + niska; rząd 2 (Ś / „Trochę”) = niska i średnia; rząd 3 (Z / „Tak”) = także wysoka. Poprawa kondycji i sprawności → tylko niska, od Ś. Pozostałe cele — brak (trener może dodać ręcznie). Brak aktywności — nigdy. Skoki nie wychodzą już z zwykłych slotów (poza dniem typu „plyo”); „skok” = ćwiczenie z intensywnością poza techniką biegu, workiem i młotem. Ćwiczenie nigdy ponad poziom klienta (jego trudność), ukryte nigdy, niezweryfikowane tylko Ś/Z; przy cienkiej puli blok ma < 2 ćwiczeń (nie jest dopełniany).
- **Uwaga:** dla Początkującego dziś jest tylko „Nauka lądowania” (pozostałe skoki z niską intensywnością są poziomu Ś albo niezweryfikowane) — decyzja, czy zatwierdzić dla P jakieś niskie skoki, w „Do decyzji”.
- **Testy (5c):** `plyoBlock` (11: cel × poziom × odpowiedź, macierz, bezpieczeństwo), wywiad (4 + liczba ekranów 29), API `survey-jump-experience` (3).

### Pomyłka procesowa (do wiadomości)
- Część testów API w tej sesji uruchomiłem na bazie aplikacji zamiast `scripts/test-api.sh`. Skutek: tylko fikstury testowe — trenerzy testowi 1270–1273 (`settings_test_trainer_a`, `train_test_trainer_a/b`, `legacy_test_trainer`), klienci testowi 268, 269, 275, 301, 314–319 oraz ankiety fikstur. Niczego nie usunąłem (zasada: bez usuwania danych). Powtórzone na bazie testowej: zielono. Czyszczenie wymaga zgody.

### Blok 6 — priorytety generatora: audyt i propozycja (tylko dokument)
- `docs/GENERATOR-PRIORYTETY.md`: porównanie dzisiejszego działania z hierarchią właściciela (zgodne / różnica / plik / ryzyko), plan wdrożenia w 8 krokach, 5 pytań z rekomendacją. Kodu generatora nie zmieniałem.
- Najważniejsze ustalenia: (1) błąd kolejności `preferMainOverVariants` względem wykluczeń (odmiany znikają, gdy klient wykluczył główne); (2) `FAMILY_BLOCKING_MAP` blokuje całe rodziny, a hierarchia chce dokładnej pozycji; (3) aktywacja planu jest twardo blokowana ponad sufit dla wszystkich poziomów (hierarchia: Ś/Z ostrzeżenie); (4) cele w katalogu: stare nazwy, 0 ćwiczeń dla redukcji, 294 bez celów — bonus za cel prawie nie działa; (5) priorytet partii dla P ignorowany; (6) BA = blok 4 tygodnie twardo.

### Blok 7 — cele i moduł kondycyjny (tylko dokument)
- `docs/KONDYCJA.md` zaktualizowany: zatwierdzona tabela 6 celów × (trening oporowy, pliometria, kondycja, kroki), ograniczenia poziomu i stawów, kilka celów (priorytet 1), pierwsza jednostka BA/P (marsz 2 / trucht 1 × 6–8, 20–25 min), model danych (`plan_element_rules`), ekrany, testy, 5 pytań z rekomendacją. Nic nie zbudowano.

### Blok 8 — konta i role
- **Audyt (8a): była luka.** Każdy zalogowany użytkownik Clerk, który otworzył panel trenera, sam stawał się trenerem (`POST /trainer/profile`). **Łatka wdrożona (ZGODA):** nowy profil trenera tylko dla kont na liście `TRAINER_CLERK_IDS` (`.env`), administratorów aplikacji albo przy `TRAINER_SIGNUP_OPEN=1` (dev/test dymny). Domyślnie zamknięte; istniejący trenerzy bez zmian; ekran „To konto nie ma jeszcze dostępu trenera”. Test dymny wymaga API z `TRAINER_SIGNUP_OPEN=1`. Testy: 4 nowe w `trainer-profile.integration`.
- **Projekt (8b):** `docs/KONTA.md` — konto Solo, połączenie z trenerem (zaproszenie / kod → prośba), wniosek „Prowadzę podopiecznych”, panel administratora, przełącznik Mój trening / Podopieczni, model danych, ekrany, testy izolacji, 5 pytań. Nic nie zbudowano.

### Weryfikacja końcowa gałęzi `feature/dom-kondycja` (NIE scalona do `main`)
- API (baza testowa, `scripts/test-api.sh`): 2567 testów zielonych (po wzmocnieniu kruchego testu `avoided-exercises` nr 4: szukał po 3 literach pierwszego ćwiczenia bez sortowania, limit 20; teraz pełna nazwa wielkimi literami). Bezpieczeństwo generatora 101/101, panel 765, portal 228, typecheck 0 błędów, build OK, test dymny 131 OK / 0 błędów (API z `TRAINER_SIGNUP_OPEN=1` tylko na czas testu; po teście usługi zrestartowane w trybie zamkniętym).
- Migracje na bazie aplikacji: 0030 (dane), 0031 (`clients.breathing_cooldown`), 0032 (`surveys.jump_experience`); pg_dump przed 0030, 0031, 0032 w `~/backups/`.

## 25.10.2026 — decyzje właściciela po raporcie (gałąź `feature/dom-kondycja`)

- **Migracja danych 0033** (`pg_dump przed-0033-*`; bazy: aplikacji i testowa), same UPDATE-y:
  - **Cele (pkt 3):** stare nazwy → 6 celów, ćwiczenia główne/pomocnicze bez celów dostały cele wg reguł (opis w `docs/GENERATOR-PRIORYTETY.md`). Aktywne ćwiczenia na cel: Budowa sylwetki 375, Poprawa sprawności 121, Redukcja 104, Zwiększenie siły 94, Cel sportowy 47, Poprawa kondycji 42; bez celów zostały tylko rozgrzewki i rozciąganie.
  - **Skoki dla Początkujących (pkt 4):** tylko Skoki pogo (249) i Skip A (#1098): poziom Początkujący, intensywność niska, zweryfikowane.
  - **Ćwiczenia BA/P (pkt 5):** zweryfikowane #1101, 1402, 1403, 1091, 1107, 1113, 1136, 1405, 1156, 1146, 1185 (BA: też `suitableForNoActivity = true`) oraz tylko dla P: 1404 (deska z dotknięciem barku), 1108 (brzuszki), 1102 (łopatkowe) — bez zgody na BA. **Konflikt decyzji:** #1403 (uginanie z ręcznikiem) jest w pkt 5 (BA) i w pkt 9C (ukryć). Obowiązuje późniejszy pkt 9: ukryte, ale zweryfikowane i oznaczone dla BA, więc odkrycie go w panelu od razu je przywraca.
  - **Ukrycie (pkt 9):** 26 ćwiczeń `hidden = true` (25 z listy po nazwach źródłowych + #1403); wszystkie znalezione, żadne nie zostało usunięte. Ćwiczenia z listy „zostają” nie były ruszane.
- **Zabezpieczenie testów (pkt 1):** `artifacts/api-server/src/lib/testGuard.ts` + `vitest.config.ts` — vitest odmawia startu, gdy `DATABASE_URL` nie kończy się na `_test`; test `test-database-guard` (4); zasada w `CLAUDE.md`.
- **Sprzątanie fikstur (pkt 1): NIEWYKONANE** — polecenie usunięcia zostało zablokowane przez system uprawnień (kopia `przed-sprzataniem-fikstur-*.dump` jest zrobiona). Przy okazji ustalono, że mój wcześniejszy test przepiął 21 starszych fikstur (klienci 84–104, pierwotnie trener 702) pod testowego trenera 1273; sprzątanie musi je najpierw przywrócić do 702 (klucz obcy bez kaskady blokuje usunięcie trenera 1273).
- `TRAINER_CLERK_IDS` (pkt 2): zgoda; nowych trenerów zgłasza właściciel.

### Pkt 10 — 4 popularne ćwiczenia (własne opisy, niezweryfikowane)
- `docs/BAZA-IMPORT-10.csv` → ID 1536 Burpees (od Ś; cele: Redukcja, Poprawa kondycji; stawy: nadgarstek, bark, kolano), 1537 Krzesełko przy ścianie (od P; izometria 30 s; kolano), 1538 Pajacyki (od P; rola rozgrzewka; cele: kondycja, sprawność; staw kolano — dodany przeze mnie ostrożnościowo), 1539 Nordic curl (tylko Z; kolano). Brak duplikatów; `suitableForNoActivity = false`, `reviewed_by_trainer = false` (generator tylko dla Ś/Z, więc krzesełko i pajacyki dla P dopiero po weryfikacji). Burpees i nordic bez intensywności, żeby nie trafiły do bloku pliometrycznego. Kopia: `trainer_panel_przed_importem_BAZA-IMPORT-10_*.sql`.

## 26.10.2026 — gałąź `feature/cwiczenia-opengym` (z `feature/dom-kondycja`): 58 ćwiczeń z listy kontrolnej openGym
- Wejście: `~/import-opengym-lista.csv` (64 wiersze). Nazwy EN służyły tylko jako lista kontrolna (`zrodlo_id = OG_<og_id>`); opisy, wskazówki, typowe błędy i uwagi bezpieczeństwa napisane samodzielnie wg KATALOG-STANDARD.md. Generator pliku: `scripts/baza/import_opengym.py` → `docs/BAZA-IMPORT-OPENGYM.csv`.
- **Dodano 58: 24 główne + 34 odmiany** (ID 1594–1651; kopia `trainer_panel_przed_importem_BAZA-IMPORT-OPENGYM_*.sql`; powtórny przebieg: 0 do dodania, 58 już były). Wszystko `reviewed_by_trainer = false`, `suitableForNoActivity = false`, status do weryfikacji; generator tylko dla Ś/Z.
- **Pominięte jako duplikaty (5):** Burpees (#1536), Pajacyki (#1538), Krzesełko przy ścianie (#1537), Nordic curl z podparciem (#1539), Przeskoki łyżwiarza (= #258 Przeskoki boczne z nogi na nogę). Wiersz OPCJONALNIE (wiosłowanie kajakowe) nie dodany.
- Odmiany podpięte do rodziców (numery z pliku = ID w bazie; „[nowe]/[G1]” rozwiązane na istniejące): np. Dipy na podłodze → 1093, Thruster ze sztangą → 1341 (Kettlebell Thruster), Prostowanie na ławce skośnej → 1145, Plank na kolanach → 1404, Martwy ciąg jednonóż z hantlami → 101 (rumuński z hantlami); odmiany grup „nr” (ściąganie gumy ×3, wyciskanie gumy ×2, pompki łopatkowe ×2, Y/T ×2, martwy ciąg jednonóż ×2) w obrębie pliku (`=OG_…`). L-sit i V-sit bez rodzica (plik: „—”), tylko Z.
- Decyzje własne (do wglądu): Pompki wąskie na kolanach jako odmiana 117 (nie 1203); Wiosłowanie jednorącz na wyciągu → rodzic 128 (nie 131); Tibialis raise: partia „Łydki”, mięsień główny najbliższy z listy (płaszczkowaty) — lista nie ma piszczelowego przedniego; pompki łopatkowe: główny „mniejszy piersiowy” (brak zębatego przedniego na liście). Wykrok w bok: sprzęt masa ciała + hantle (bez sztangi, żeby zostać dostępnym w domu).
- Testy: `import-opengym.test.ts` (11): walidacja całego pliku, komplet pól, brak języka medycznego, BA/P nie dostają, odmiany z rodzicem, idempotencja, dom z gumą. Pokrycie przeliczone (`POKRYCIE.md`, `POKRYCIE-DZIURY-BA-P.md`).

### 26.10.2026 — poprawka: dwa nowe mięśnie na zamkniętej liście (migracja 0034, pg_dump `przed-0034-*`)
- Dopisane do `specific_muscles`: **Mięsień piszczelowy przedni** (partia Łydki, id 29) i **Mięsień zębaty przedni** (partia Klatka piersiowa, id 30). Lista w importerze (`SPECIFIC_MUSCLES`) ma teraz 30 pozycji (28 z seeda + 2 z migracji 0034; test `paczka-import` sprawdza oba źródła).
- Przypisania (bez usuwania): Tibialis raise (#1603) — główny piszczelowy przedni (zamiast płaszczkowatego); Pompki łopatkowe (#1601) i na podwyższeniu (#1650) — główny zębaty przedni, mniejszy piersiowy pomocniczy 0,5; Pompki plus (#1602) — główny zębaty przedni, większy piersiowy pomocniczy 0,5. Plik `BAZA-IMPORT-OPENGYM.csv` i generator zaktualizowane (powtórny import: 0 do dodania).
- Objętość: żaden cel objętości nie obejmuje tych mięśni; wpisane do listy świadomych wyłączeń (`unmappedMuscleVtm.ts`, dopasowanie po nazwie, bo na bazie testowej id się różnią). Praca klatki w pompkach plus/łopatkowych nadal liczy się przez współczynniki pomocnicze 0,5.
- Przegląd pozostałych ćwiczeń (nazwy, wzorce, rozgrzewki): **żadne inne** nie ma tych mięśni jako głównej pracy (brak wall slide, serratus punch, ćwiczeń na piszczel); face pull, wykroki, bieganie — bez zmian.
- Przy okazji: test `training-flow` („aborted session…”) zależał od dnia tygodnia (w poniedziałek sesje cofnięte o 1–2 dni wypadały w poprzednim tygodniu); asercja liczy teraz ukończone sesje z bieżącego tygodnia.

### 26.10.2026 — weryfikacja ćwiczeń openGym wg decyzji właściciela (migracja 0035, pg_dump `przed-0035-*`)
- **Zweryfikowane (23):** 1621, 1609, 1597, 1651, 1639, 1620, 1622, 1594, 1646, 1647, 1600, 1649, 1610, 1611, 1605, 1606, 1615, 1632, 1604, 1634, 1601, 1650, 1598. **Dodatkowo dla nieaktywnych (13):** 1639, 1620, 1622, 1594, 1600, 1649, 1610, 1611, 1605, 1606, 1615, 1650, 1598 (flaga + poziom „Brak aktywności”; ten sam poziom dopisany wcześniej oznaczonym 11 ćwiczeniom z pkt 5 — wpływa tylko na punktację dopasowania).
- **Zostają niezweryfikowane:** 1629 Dipy na podłodze (od Ś; opis poprawiony: siad, dłonie za biodrami palcami do przodu, unieś biodra, zginaj łokcie w małym zakresie) i 1635 Uginanie nóg leżąc z hantlem. 1597: opis i uwaga bez „stołu” i „sztangi na podporach”, tylko stabilny drążek.
- **Uwaga:** #1611 Martwy ciąg rumuński z gumą ma `learningDifficulty = 3`, a silnik wymaga ≤ 2 dla BA/P. Mimo flagi dla nieaktywnych generator go jeszcze nie wybierze dla BA, dopóki trudności nie obniżysz do 2 (nie zmieniałem bez Twojej zgody).
- Pokrycie przeliczone: dziury BA/P 23 → 19.

### 26.10.2026 — #1611 trudność nauki 2 (migracja 0036, pg_dump `przed-0036-*`)
- Martwy ciąg rumuński z gumą oporową: `learningDifficulty` 3 → 2 (decyzja właściciela: lekka guma, nauka zawiasu, ma być dla nieaktywnych). Plik/generator zaktualizowane. Dziury bez kandydata (dom bez sprzętu: pchanie pionowe BA/P, przyciąganie pionowe BA, zgięcie łokcia BA/P, anty-rotacja BA) zostają: generator pomija wzorzec, trener widzi ostrzeżenie o braku sprzętu; nowych ćwiczeń nie dodajemy.

## 26.10.2026 — „wszystko naraz”: blok 5 (gałąź `feature/beta-przygotowanie`, worktree ~/tp-a1, z `main`)
- Praca podzielona z drugą sesją Claude (uzgodnienie wiadomością): ona — bloki 1–4 w ~/trainer-panel (migracje 0037–0049), ja — bloki 5–12 w osobnym worktree ~/tp-a1 (migracje od 0050). Ciężkie polecenia (testy, db-setup, smoke) przez `flock /tmp/tp-heavy.lock`.
- 5a: nagłówki bezpieczeństwa API (`securityHeaders.ts`), nagłówki front-endów (`scripts/security-headers.mjs`, CSP tylko raport), limiter zapytań w pamięci (`rateLimit.ts`; linki z tokenem 30/min, profil 20/min, generator 120/min/użytkownika, kody trenera 10 prób/15 min — dla bloku kont). Testy: `security-headers-rate-limit.test.ts`.
- 5b: `scripts/backup-db.sh` (cron 03:15), `scripts/backup-restore-test.sh`; opis w CLAUDE.md. Pierwsza kopia i test przywrócenia OK (33 tabele, wiersze zgodne).
- 5c: szkielety trzech dokumentów (`lib/survey-config/src/legal.ts`), strony `/legal/:slug` w panelu i portalu, linki w stopkach.
- 5d: zgoda na dane o zdrowiu — migracja 0050 (4 kolumny nullable w `surveys`), pole `healthConsent` w wywiadzie, wycofanie w Ustawieniach portalu, podgląd u trenera w profilu klienta, najostrożniejsze ustawienia generatora bez zgody. Testy: `health-consent.test.ts`, wizard.
- 5e: pliki `deploy/*.example`, `scripts/usun-konta-demo.sh` (tylko podgląd domyślnie, NIEURUCHOMIONY), rozdział 13 w `docs/WDROZENIE-PLAN.md`.
- Blok 5 — weryfikacja końcowa: API 2598/2598, bezpieczeństwo generatora 101/101, panel 765/765, portal 235/235, typecheck i build OK, test dymny 131/0 (na własnym API na porcie 18081, żeby nie ruszać usług drugiej sesji). Poprawka po drodze: limiter zapytań jest wyłączony w testach (VITEST), chyba że test ustawi `RATE_LIMIT_FORCE=1`.

## 27.10.2026 — blok 1: generator, priorytety (gałąź `feature/generator-priorytety`, z `main`, NIE scalona)
- Dokończenie pracy z poprzedniej sesji (zmiany niezatwierdzone → commity) oraz 1e, 1f, 1g. Szczegóły: `docs/GENERATOR-PRIORYTETY.md`, sekcja „Wdrożone 27.10.2026”.
- Migracja 0037 (dane: cele rozgrzewek i rozciągania; backup `~/backups/przed_0037_*`).
- Testy: `generator-priorities.test.ts` (12), `catalogueTabs.test.ts` (2).
- Test `blockDurationRule.test.ts` zaktualizowany świadomie do nowej reguły długości cyklu (decyzja właściciela); asercje bezpieczeństwa bez zmian.
- Weryfikacja bloku 1: API 2599 (po poprawce testu długości cyklu zielone), bezpieczeństwo generatora 101, panel 767, portal 228, typecheck i build OK, smoke 131/0.

## 27.10.2026 — blok 2: konta, link i kod trenera (gałąź `feature/konta-link-kod`, z `main`, NIE scalona)
- Migracja 0038 (backup `~/backups/przed_0038_*`): `trainers.join_code`, `trainer_join_requests`, `client_link_events`; tylko dodawanie.
- API: `routes/joinRequests.ts` (kod/link, prośby, akceptacja/odrzucenie, odłączenie przez każdą ze stron), `services/joinCode.ts`, `sendPlainEmail` w `services/inviteEmail.ts`.
- Panel: karta „Dołączanie podopiecznych” w Ustawieniach, przycisk „Odłącz”. Portal: strona `/join/:kod`, ekran „wkrótce” + pole na kod.
- Testy: `join-requests.test.ts` (11), `AccountNotice.test.tsx`. Opis i model wniosku o konto trenera (2e): `docs/KONTA.md`.
- Weryfikacja bloku 2: API 2598, bezpieczeństwo 101, panel 765, portal 230, typecheck i build OK, smoke 131/0 (jedyny test wysyłki maili wymusza jeden plik z `sendMail`, więc `sendPlainEmail` jest w `inviteEmail.ts`).

## 27.10.2026 — blok 3: panel administratora (gałąź `feature/panel-admin`, z `main`, NIE scalona)
- Migracja 0039 (backup `~/backups/przed_0039_*`): `trainers.blocked_at`, `app_errors` + `app_error_users`, `admin_access_log` z wyzwalaczem blokującym UPDATE/DELETE (dziennik nieusuwalny nawet z bazy).
- Rola administratora: wyłącznie lista w `.env` (zmienna `APP_ADMIN_CLERK_IDS`, istniejąca — zadanie nazywało ją `ADMIN_CLERK_IDS`); administrator nie ma limitu generatora; konta administratora nie da się zablokować.
- API `routes/admin.ts`: błędy, trenerzy (pakiet, blokada z potwierdzeniem, instrukcja dopisania do listy), Solo (liczby i lista), abonamenty i zużycie, wgląd w osobę z powodem (wpis w dzienniku PRZED pokazaniem danych), dziennik dostępu. Blokada konta: `requireAuth` odpowiada 403 `ACCOUNT_BLOCKED`.
- Dziennik błędów: błędy API (centralny handler) oraz zgłoszenia z panelu i portalu (`POST /client-errors`, limit 20/min/IP); `services/errorLog.ts` usuwa e-maile, tokeny, hasła, długie liczby, parametry adresów, a opisy ze słowami zdrowotnymi ukrywa w całości; retencja 90 dni.
- Panel: strona `/admin` (5 zakładek), pozycja w menu konta tylko dla administratora; zgłaszanie błędów w panelu i portalu (`lib/errorReport.ts`).
- Testy: `admin-panel.test.ts` (14), `admin-page.test.tsx` (2).
- Weryfikacja bloku 3: API 2601, bezpieczeństwo 101, panel 767, portal 228, typecheck i build OK, smoke 131/0.

## 27.10.2026 — blok 6: wnioski trenerów (gałąź `feature/wnioski-trenerow`, z `feature/panel-admin`, NIE scalona)
- Migracja 0040 (backup `~/backups/przed_0040_*`): `trainer_applications`, `app_settings`; tylko dodawanie.
- API `routes/trainerApplications.ts`: wniosek „Prowadzę podopiecznych” (jeden oczekujący; po odrzuceniu ponownie dopiero po 14 dniach), `GET /account/roles`, lista i decyzje [Odrzuć]/[Akceptuj] w panelu administratora (zakładka „Wnioski”), przełącznik „przyjmuj automatycznie” — domyślnie WYŁĄCZONY, zmiana z potwierdzeniem. Akceptacja nadaje rolę trenera (rekord `trainers`); `TRAINER_CLERK_IDS` zostaje listą awaryjną.
- Maile: do wnioskodawcy po decyzji i do właściciela o nowym wniosku — tylko jeśli skonfigurowano pocztę (`SMTP_*`) i adres właściciela w `OWNER_NOTIFY_EMAIL` (nie ustawiony, więc mail do właściciela nie jest wysyłany).
- Portal: sekcja „Prowadzę podopiecznych” w oknie „Moje konto”; po akceptacji prosty przełącznik [Mój trening] / [Podopieczni]. Panel: „Mój trening” w menu konta, gdy konto ma też plan treningowy.
- Funkcja `sendPlainEmail` (w `inviteEmail.ts`) jest w tej gałęzi identyczna jak w `feature/konta-link-kod` — przy scaleniu obu bez konfliktu.
- Testy: `trainer-applications.test.ts` (6), `TrainerApplyCard.test.tsx`, `admin-page.test.tsx`.
- Weryfikacja bloku 6: API 2607, bezpieczeństwo 101, panel 767, portal 229, typecheck i build OK, smoke 131/0.

## 26.10.2026 — blok 7: pakiety i licznik sesji (gałąź `feature/pakiety-sesje`, z `main`)
- Migracja 0051 (`client_packages`, `package_sessions`; najwyżej jeden aktywny pakiet na podopiecznego; cofnięcie sesji = oznaczenie, nie usunięcie). API: `routes/packages.ts`, reguły przypomnień `services/packages.ts` (≤ 2 sesje, ważność ≤ 7 dni). Panel: karta „Pakiet sesji” w profilu podopiecznego; portal: kafelek „Zostało X sesji” (tylko gdy trener pozwolił, bez ceny). Bez płatności online.
- Testy: `packages.test.ts` (10: reguły, izolacja trenerów, limit i wyścig ostatniej sesji, widok klienta bez ceny), `PackageTile.test.tsx` (6). Pełna weryfikacja: API 2597/2597, bezpieczeństwo 101/101, panel 765/765, portal 234/234, typecheck, build, test dymny 131/0.

## 26.10.2026 — blok 8: skrzynka uwagi „kto cichnie” (gałąź `feature/skrzynka-uwagi`, z `feature/pakiety-sesje` — zależy od pakietów z bloku 7)
- Migracja 0052 (`trainer_attention_settings` — próg 7/10/14 dni; `attention_dismissals` — „załatwione” powiązane z konkretnym zdarzeniem, nowe zdarzenie przywraca powód). Nowe powody na Pulpicie: **Cisza** (aktywny plan, brak ukończonego treningu przez N dni), **Za ciężko 2 razy z rzędu**, **Kończy się pakiet / ważność pakietu**; istniejące (ból, nowy wywiad, brak planu, koniec planu, zaproszenie bez odpowiedzi) zostają. Jeden wiersz na podopiecznego (najważniejszy powód); po „Załatwione” pokazuje się następny powód tego klienta. „Pokaż wszystkie” (`attention.allItems`). Hak `extraItems` na „prośbę o dołączenie” (blok kont, druga sesja) — nie podłączony, bo tabela próśb jest w innej gałęzi.
- Zmiana zachowania widoczna dla trenera: lista na Pulpicie ma przycisk „Załatwione” i wybór progu ciszy; kolejność powodów: ból, za ciężko, cisza, pakiet, nowy wywiad, brak planu, koniec planu, zaproszenie.
- Testy: `dashboardAttention.test.ts` (+6), `attention-inbox.test.ts` (4: próg, załatwione, izolacja, pakiet), `dashboard.test.tsx` (+2).

## 26.10.2026 — blok 9: import planu z Excela (gałąź `feature/import-excel`, z `main`)
- Bez AI i bez nowych bibliotek: własny czytnik .xlsx (ZIP przez `node:zlib` + XML; limit 2 MB, 1500 wierszy, 30 kolumn, ochrona przed „zip bomb”), .csv (UTF-8/BOM/Windows-1250, `;` `,` lub tab). Przepływ: plik → podgląd i dopasowanie kolumn (dzień, ćwiczenie, serie, powtórzenia, ciężar, RIR, notatka) → dopasowanie nazw do katalogu (najlepsze trafienie tylko gdy pewne; inaczej lista kandydatów, „ćwiczenie własne trenera” albo pomiń) → zapis jako szkic planu klienta albo szablon.
- Bezpieczeństwo jak przy ręcznym dodaniu: sprzęt/miejsce z wywiadu twardo (422), ćwiczenie na zgłoszony staw wymaga potwierdzenia (409 → `acknowledgeJointWarning`, decyzja zapisana w `joint_warning_decisions`). Ćwiczenia własne powstają jako prywatne ćwiczenia trenera (limit pakietu trenera obowiązuje).
- Migracja 0053 (`plan_templates`). Szablon pliku do pobrania (`GET /api/plan-import/template.csv`). Panel: `/clients/:id/plans/import`, przycisk „Import z pliku” w profilu klienta. Zastosowanie szablonu: `POST /api/plan-templates/:id/apply` (UI do wyboru szablonu — później, blok „szablony/kopiowanie planów”, faza 2).
- Testy: `plan-import-parse.test.ts` (11), `plan-import.test.ts` (7), `planImportUi.test.ts` (4).

## 26.10.2026 — blok 10: raport PDF dla trenera (gałąź `feature/raport-pdf`, z `main`)
- Własny, mały generator PDF bez bibliotek (`services/pdf/ttf.ts`, `pdfDoc.ts`): A4, osadzona czcionka Manrope (Type0/Identity-H, ToUnicode — tekst do wyszukiwania), prostokąty i linie. Raport (`services/monthlyReport.ts`, `POST /api/clients/:id/monthly-report`): frekwencja (odbyte vs zaplanowane z liczby dni planu na tydzień, słupki tygodni), lista treningów z oceną „jak było”, rekordy ciężaru (lepsze niż wszystko przed miesiącem), objętość (serie robocze wg partii), kroki (jeśli są), zgłoszenia bólu **tylko liczbą** (szczegóły i opisy dopiero po zaznaczeniu przez trenera), notatka trenera (do 1200 znaków), imię trenera opcjonalnie. Styl B: Manrope, akcent #C2410C. Brak loga trenera (w systemie nie ma wgrywania plików) — tylko imię; to NIE jest Wrapped.
- Panel: przycisk „Raport PDF” w profilu podopiecznego (miesiąc domyślnie poprzedni, notatka, dwa pola wyboru).
- Testy: `monthly-report.test.ts` (10: obliczenia, poprawność pliku — xref/trailer/czcionki, polskie znaki, dane, prywatność bólu, izolacja trenerów, walidacja), `MonthlyReportButton.test.tsx` (3). Czcionka: `docs/ASSETS.md`.

## 26.10.2026 — blok 11: Solo za przełącznikiem (gałąź `feature/solo`, z `main`)
- **Przełącznik `SOLO_ENABLED` (domyślnie wyłączony):** `GET /api/solo/status`; `POST /api/solo/start` i `GET /api/solo/me` odpowiadają 404 `SOLO_DISABLED`, dopóki nie ustawisz `SOLO_ENABLED=1`. Aplikacja nadal pokazuje „Wkrótce” (nic nowego nie wyświetla się klientom).
- **Model:** osoba Solo = wiersz `clients` z `trainer_id` NULL (kolumna jest nullable; każde zapytanie trenera filtruje po `trainer_id`, więc dane Solo są niewidoczne dla trenerów — test). Konto trenera ani konto klienta trenera nie może zostać Solo (403 `TRAINER_ACCOUNT` / `ALREADY_LINKED`), konto Solo nie dostaje panelu trenera. Brak zmian schematu.
- **Ostrzejsze zasady (`services/solo.ts`, wpięte w pulę generatora `planDraftGenerateDay`):** tylko ćwiczenia zweryfikowane na każdym poziomie; pliometria i olimpijskie tylko przy „Tak” w doświadczeniu ze skokami i od poziomu Ś; ból zgłoszony na ćwiczeniu wyklucza je z planów Solo na 90 dni, komunikat „Skonsultuj się ze specjalistą.”; brak cotygodniowego check-inu RPE (`SOLO_WEEKLY_CHECKIN = false`).
- **NIE zrobione (zależy od bloków kont 1–3 drugiej sesji, patrz niżej w raporcie):** ekrany Solo (wywiad → plan → trening → kroki) i generowanie planu po stronie serwera dla osoby bez trenera. Generator jest dziś sterowany z kreatora trenera (kolejne wywołania dzień po dniu), a trasy wymagają zalogowanego trenera; potrzebny jest serwerowy „sterownik” generowania i tabela `accounts` z bloku 2. Reguły i filtr bezpieczeństwa są gotowe i przetestowane, więc ten sterownik będzie je tylko wywoływał.
- Testy bezpieczeństwa Solo osobno: `solo-safety.test.ts` (10).

## Blok 12 — moduł kondycyjny (feature/kondycja) — GOTOWE (API; bez ekranów UI)
- Migracja 0054 (backup przed), `services/conditioning.ts`, `routes/conditioning.ts` za `CONDITIONING_ENABLED` (domyślnie wyłączone → 404), dni kondycyjne omijają wymóg ćwiczeń przy aktywacji.
- Testy `conditioning.test.ts` (12): flaga, brak interwałów dla BA/P, filtr bólu, tydzień lżejszy, wzrost ≤15%, idempotencja, izolacja A/B, check-in zabroniony dla Solo, słownik tylko admin.
- Weryfikacja: API 2599, bezpieczeństwo 101, panel 765, portal 228, typecheck i build OK, smoke 131/0.
- Brak: ekrany panelu i portalu (po decyzji o menu/UX), przełącznik w ustawieniach.

## 27.10.2026 — scalenie do `main` i decyzje właściciela
- Scalone (`--no-ff`) w kolejności z raportu: beta-przygotowanie, generator-priorytety, konta-link-kod, panel-admin, wnioski-trenerow, pakiety-sesje, skrzynka-uwagi, import-excel, raport-pdf, solo, kondycja, docs/kondycja-aktualizacja, docs/raport-wlasciciela. Konflikty tylko tekstowe (lista tras, indeks schematu, importy, POSTEP, trainers.ts) — zachowano zmiany obu stron.
- Decyzje właściciela wykonane: łagodne interwały dla początkujących (`fix/interwaly-poczatkujacy`), zgoda w wywiadzie wpisywanym przez trenera (`fix/zgoda-wywiad-reczny`), prośba o dołączenie w „Wymaga uwagi” (`fix/prosba-w-wymaga-uwagi`), odpowiedzi w `docs/DO-DECYZJI.md`, cron kopii bazy na `~/trainer-panel`.
- Flagi `SOLO_ENABLED` i `CONDITIONING_ENABLED` zostają wyłączone. `OWNER_NOTIFY_EMAIL` — adres poda właściciel.

## 27.10.2026 — kontrola jakości przed betą (gałęzie `qa/przeglad-bety`, `qa/bezpieczenstwo`, NIE scalone)
- `docs/QA-BETA.md` (tabela problemów + zrzuty), `docs/NAZWY-PROPOZYCJA.md` (tylko propozycja), `docs/BEZPIECZENSTWO-BETA.md`, `docs/BETA-START.md`; decyzje 38–48 w `docs/DO-DECYZJI.md`.
- Znaleziono 1 krytyczny, 13 ważnych, 10 kosmetycznych; naprawiono 1 / 11 / 5 (każda poprawka osobnym commitem z testem tam, gdzie się dało).
- KRYTYCZNE: start API a konta bez trenera (`lib/migration.ts`) — naprawione; scal przed restartem z `main`.
- `qa/bezpieczenstwo`: maskowanie tajnych adresów (tokeny i kody) w logach i dzienniku błędów + ta sama poprawka startu API.

## 28.10.2026 — start i stop aplikacji nie ruszają sesji użytkownika (gałąź `fix/tmux-izolacja`)
- Sesja tmux „claude” została zamknięta przy restarcie aplikacji. `dev-gcp.sh` i `stop-gcp.sh` używają teraz osobnego serwera tmux (gniazdo `trainer-panel-app`); `stop-gcp.sh` zamyka tylko ten serwer, starą sesję „trainer-panel” po dokładnej nazwie i procesy na portach aplikacji, które należą do repozytorium (nigdy przodków skryptu, tmux, claude).
- Test: `scripts/test-tmux-izolacja.sh` (atrapa serwera użytkownika z sesją „claude”, atrapy aplikacji, obcy proces na porcie) — wszystko OK.

## 28.10.2026 — noc, blok 0: scalenia i restart — GOTOWE
- Do `main` scalone: `fix/tmux-izolacja` (PIERWSZA, przed restartem; `d01c03d`), `qa/przeglad-bety` i `qa/bezpieczenstwo` (były już w main), `fix/po-qa` (39 ukryta „maskotka”, 41 „Wymaga uwagi” przy limicie pakietu + migracja 0055, 43 imię i e-mail trenera, W12 ostrzeżenie Reacta, 45 dane QA w `usun-konta-demo.sh` — nieuruchamiane).
- Backup przed 0055: `~/backups/trainer_panel_przed_0055_20261028-0018.sql.gz`; migracja zastosowana przez `db-setup-gcp.sh`.
- Testy (baza testowa): API 128/128 plików, 2727 testów; panel 782; portal 250; bezpieczeństwo generatora 101; typecheck i build OK. `joint-exclusion.integration.test.ts` miał kruche sprzątanie (stali klienci po przerwanym przebiegu blokowali usunięcie trenera) — poprawione.
- Restart na poprawionych skryptach: sesja tmux `claude` przeżyła. Smoke 131 OK / 0 BŁĄD.

## 28.10.2026 — noc, blok 1: symulacja jakości generatora (gałąź `qa/generator-symulacja`, NIE scalona) — GOTOWE
- `scripts/generator-sim.sh` + `src/__tests__/generator-sim.test.ts` (1000 losowych profili ręcznie, 24 w zwykłych testach; baza testowa). Raport: `docs/GENERATOR-JAKOSC.md`, surowe dane `docs/generator-sim-report.json`.
- Wynik po poprawkach: 0 naruszeń bezpieczeństwa i 0 wykonalności. Naprawione: (1) odmienione nazwy stawów z wywiadu były ignorowane („z biodrem”) — test regresji; (2) blok skoków i zamiana ćwiczenia omijały tryb „brak zgody zdrowotnej” — test regresji. Przy okazji: kruche sprzątanie testu `joint-exclusion`.
- Do decyzji (DO-DECYZJI 49–53): „ponad poziom” bez twardej reguły, 23% dni odmówionych, mały katalog dla domu/BA, status „do weryfikacji”.
- Testy: API 130 plików / 2738, bezpieczeństwo generatora 101, typecheck OK.
## 28.10.2026 — noc, blok 3: drobne poprawki z QA (gałąź `fix/qa-drobne`, z `main`, NIE scalona) — GOTOWE
- C5: linki między dokumentami prawnymi (panel i portal) mają min. 44 px i `aria-current`; C7: „Ewa ” → `clientFullName` (7 miejsc w panelu); C8: separatory „·” czytelne i `aria-hidden`.
- Zostaje otwarte (poza zakresem: nawigacja/UX): C6 (cele dotyku w menu, kalendarzu, przełącznikach), C10 (dane testowe — tylko za zgodą).
- Testy: `legal-page-links` (panel i portal), `client-name` (3). Panel 786, portal 251, typecheck OK.

## 28.10.2026 — decyzje właściciela 49–61: kroki 49, 50a, 51 — GOTOWE (50a i 51 na gałęzi, bez scalenia)
- 49: `qa/generator-symulacja` i `fix/qa-drobne` scalone do `main` (`3111c45`), pełne testy, push, restart, smoke 131/0.
- 50a, 51 (`fix/trudnosc-ba-p`, z `main`, NIE scalona — czeka na zgodę na scalenie): BA/P bez ćwiczeń o trudności „Zaawansowany” (odmowy 947 → 947; eksperyment pełnej reguły dla BA/P: 940 przypadków „ponad poziom” → 0 przy tych samych 947 odmowach); minimum 3 ćwiczenia z komunikatem dla trenera (`services/dayShortage.ts`, panel): odmowy 947 (23,8%) → 558 (14,0%), 391 dni po 3 ćwiczenia.
- Testy: API 132 plików / 2748, panel 786, portal 251, bezpieczeństwo generatora 101, typecheck OK.

## 28.10.2026 — katalog po decyzjach właściciela (gałąź `feature/katalog-decyzje-wlasciciela`)
- Krok 1: `fix/trudnosc-ba-p` scalona do `main` (`2f7b01b`), testy przed (2738) i po (2748), push, restart, smoke 131/0.
- Kroki 2–4: migracja danych 0057 (81 od BA / 21 od P / 48 od Ś / 0 ukrytych / 11 nowych; wyjątek id 89), reguła 50b, testy (`catalogue-decisions-0057`, `isGeneratorSafe`, symulacja). Backupy: `~/backups/trainer_panel_przed_0057_*.sql.gz`.
- Krok 5: symulacja na pełnym katalogu (schemat `sim`): ponad poziom 1208 → 0, odmowy 3,6% → 2,3%, naruszeń 0; `docs/GENERATOR-JAKOSC.md`.

## 28.10.2026 — decyzje właściciela 62–68: stawy (gałąź `fix/stawy-uzupelnienie`)
- 3a: brak danych o stawach = nie dla klienta z bólem ani bez zgody (`services/jointData.ts`, wszystkie ścieżki + rozgrzewka); test regresji `unknown-joint-data`. 3b: uzupełniono 445 ćwiczeń (było 376 bez poziomu, 43 bez stawów), `docs/STAWY-UZUPELNIENIE.csv`, migracja 0059. 3c: sprawdzacz symulacji. 0058: „L-sit z podparciem”.
- Symulacja 1000 profili: naruszeń 30 647 → 0; odmowy 2,3% → 2,6%.

## 28.10.2026 — poprawki właściciela do danych o stawach (gałąź `fix/stawy-poprawki`, scalona do `main`)
- Migracja 0060 (z kopią starych wartości, jednorazowa): 10 dipów → Bark, Łokieć, Nadgarstek, Wysokie (w tym dipy na ławce i wspomagane na maszynie); 7 ćwiczeń w zwisie + Bark; 6 ćwiczeń → Średnie. Lista: `docs/STAWY-POPRAWKI.csv`. Symulacja 1000 profili: naruszeń 0, odmowy 2,6% → 2,9%.

## 28.10.2026 — noc przed betą, blok 7: strona dla trenerów (gałąź `docs/strona-trenerzy`)
- Statyczny szkic `docs/strona/index.html` (styl B, jasny/ciemny, bez zewnętrznych zasobów): hasło główne + 2 alternatywy w `README.md`, 3 korzyści, 3 kroki, „Dla kogo”, przycisk „Dołącz do bety” (`mailto:`; adres w stałej `OWNER_EMAIL` do uzupełnienia, nie wpisany na stałe). Bez opinii, liczb użytkowników i konkurencji; dopisek, że aplikacja nie zastępuje lekarza.
- Zrzuty 375 i 1440 px (jasny i ciemny) w `docs/strona/screens/`; brak poziomego przewijania. Nie wdrożona, bez domeny.
