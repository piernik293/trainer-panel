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
