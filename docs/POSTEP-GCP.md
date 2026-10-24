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
