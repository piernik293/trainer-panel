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
- **CLAUDE.md, STOP 7:** bez zgody nie zmieniać pakietów, uprawnień ani danych kont — także tymczasowo i w bazie deweloperskiej (treść polecenia dotarła ucięta po „(także” — do potwierdzenia).
- **Testy:** API 2484, bezpieczeństwo 101/101, panel 754, portal 198, typecheck, build, test dymny 131/0.
- **Do decyzji:** scalenie i push `feature/jeden-aktywny-plan`.
