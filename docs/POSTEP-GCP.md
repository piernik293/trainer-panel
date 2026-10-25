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
