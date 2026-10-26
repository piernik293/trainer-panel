# Raport dla właściciela (26.10.2026)

Nic nie zostało scalone do `main`. Każda gałąź przeszła pełną weryfikację (testy API, bezpieczeństwo generatora, panel, portal, typecheck, build, smoke 131/0).

## Gotowe (gałąź — co)
- `feature/beta-przygotowanie` — nagłówki bezpieczeństwa, limity zapytań, kopie bazy (cron 3:15 + test przywrócenia), szkielety dokumentów prawnych, zgoda na dane o zdrowiu, pliki wdrożeniowe, skrypt usuwania kont demo (nieuruchomiony).
- `feature/pakiety-sesje` — pakiety i sesje klienta, kafelek w portalu (bez ceny).
- `feature/skrzynka-uwagi` — „Wymaga uwagi” z odhaczaniem i progiem ciszy (na bazie pakietów).
- `feature/import-excel` — import planu z .xlsx/.csv, szablony planów.
- `feature/raport-pdf` — miesięczny raport PDF dla klienta.
- `feature/solo` — reguły i API Solo (wyłączone `SOLO_ENABLED`); bez ekranów.
- `feature/kondycja` — moduł kondycyjny, API (wyłączone `CONDITIONING_ENABLED`); bez ekranów.

## Druga sesja (części 1–4)
- `feature/generator-priorytety`, `feature/konta-link-kod`, `feature/panel-admin` — nie znalazłem ich na GitHubie w chwili pisania; stan sprawdź u niej.

## Czeka na Twoje „tak” (pełna lista: `docs/DO-DECYZJI.md`)
- Interwały dla początkujących: zostało zabronione (poz. 17).
- Zgoda na dane o zdrowiu po wycofaniu — co z danymi (3) — do prawnika.
- Włączenie CSP na twardo (2), cron z `~/trainer-panel` po scaleniu (7).
- Teksty prawne — szkielety do uzupełnienia (6).
- Blok 6 niezrobiony (20); Solo bez ekranów (16).
- Uruchomienie `usun-konta-demo.sh` i włączenie Solo/kondycji tylko za Twoją zgodą.

## Proponowana kolejność scalania
1. `feature/beta-przygotowanie` → 2. `feature/pakiety-sesje` → 3. `feature/skrzynka-uwagi` → 4. `feature/import-excel` → 5. `feature/raport-pdf` → 6. `feature/solo` → 7. `feature/kondycja` → 8. gałęzie drugiej sesji.
Spodziewane drobne konflikty w `docs/POSTEP-GCP.md` i `docs/DO-DECYZJI.md` (rozwiąż, zostawiając obie części) oraz migracje: moje 0050–0054, drugiej sesji 0037–0049.
