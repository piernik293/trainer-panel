# Plan scalenia gałęzi czekających na betę (nic nie jest scalone do `main`)

Stan: 28.10.2026, `main` = `0b81a62`. W nocy do trzech gałęzi z funkcjami za flagami wciągnięto `main` (zwykłe scalenie `main` → gałąź, bez rebase i bez force push), konflikty rozwiązano zostawiając obie strony. Na każdej: typecheck OK i pełne testy zielone przy wyłączonych flagach (czyli aplikacja zachowuje się jak `main`).

## Gałęzie po aktualizacji

| Gałąź | Flaga (domyślnie wyłączona) | Migracja | Testy po scaleniu `main` | Co dodano w nocy |
|---|---|---|---|---|
| `feature/kalistenika` | `CALISTHENICS_ENABLED` | brak | API 137 plików / 2802 testy, panel 789, portal 251, typecheck OK | „L-sit z podparciem” w drabince core w kodzie (`CALISTHENICS_LADDERS`, poziom Ś, przed „L-sit na podłodze”; zgodne z migracją 0058, krok 6) + test; poprawka fałszywego alarmu w symulacji (patrz niżej) |
| `feature/osiagniecia` | `ACHIEVEMENTS_ENABLED` | `0056_osiagniecia.sql` (tabele `client_achievements`, `client_pauses`; tylko dodawanie, `IF NOT EXISTS`) | API 137 / 2804, panel 786, portal 253, typecheck OK | tylko scalenie `main` |
| `feature/solo-ekrany` | `SOLO_ENABLED`, `ACHIEVEMENTS_ENABLED`, `CONDITIONING_ENABLED` | ta sama 0056 (zawiera commity osiągnięć) | API 137 / 2805, panel 786, portal 266, typecheck OK | tylko scalenie `main` |

Konflikty przy aktualizacji: `generator-sim.test.ts` (zostawiono obie zmiany: `missingJointData` i `style`), `routes/training.ts` (dwa importy obok siebie), `docs/POSTEP-GCP.md` i `docs/DO-DECYZJI.md` (obie sekcje zachowane).

## Symulacja stylu kalistenika po aktualizacji

300 profili, ziarno 7, pełny katalog (schemat `sim`, 599 ćwiczeń, z „L-sit z podparciem”): **0 naruszeń bezpieczeństwa, 0 naruszeń wykonalności**, 1126 dni, 43 odmowy dni (3,8%), 0 pustych dni, 0 złych tekstów odmowy, braki danych o stawach u klientów z bólem lub bez zgody: 0. Pierwszy przebieg pokazał 1 „naruszenie” — fałszywy alarm: wyrażenie sprawdzające `^Podciąganie` uznało za szczebel drążka ćwiczenie brzucha „Podciąganie kolan w leżeniu na ławce” (poziom Początkujący, bez drążka). Poprawiono wyrażenie (`^Podciąganie(?! kolan)`), nie regułę bezpieczeństwa.

## Kolejność scalania (rekomendacja)

1. **`docs/grafiki-cwiczen`** — tylko dokumenty i narzędzie symulacji. Bez ryzyka.
2. **`ops/monitoring`** — skrypty straży, opis w `CLAUDE.md`, łagodniejszy test przywracania kopii. Po scaleniu: decyzja o cronie (`docs/DO-DECYZJI.md` N5-1).
3. **`feature/kalistenika`** — kod za flagą, bez migracji.
4. **`feature/osiagniecia`** — migracja 0056.
5. **`feature/solo-ekrany`** — po osiągnięciach (zawiera ich commity, więc będzie tylko różnica ekranów). Konflikt z `feature/kalistenika` w `routes/index.ts` (po jednym imporcie routera) — zostawić oba.
6. **`feature/zglos-uwage`** — migracja 0062, flaga `FEEDBACK_ENABLED`.
7. **`qa/pierwsze-minuty`** — poprawki tekstów i wywiadu trenera. Konflikt w `SurveyWizard.tsx` z `feature/osiagniecia`/`solo-ekrany` (obie zmieniają te same tytuły pytań, decyzja 56): przyjąć wersję z gałęzi osiągnięć, a z naszej zostawić tylko wiersze, których tam nie ma („chciałbyś”, „powinienem” w `SurveyForm.tsx`).
8. **`feature/opisy-top100`** — **na samym końcu i tylko po Twojej akceptacji pliku `docs/OPISY-TOP100.csv`**: migracja 0061 zmienia teksty 140 ćwiczeń w bazie aplikacji (z kopią starych wartości i skryptem cofnięcia `scripts/opisy-top100-cofnij.sql`).

Konflikty w dokumentach (`POSTEP-GCP.md`, `DO-DECYZJI.md`) przy każdym kroku: zostawić obie sekcje (nowsza pod starszą).

## Migracje

Numery: 0056 (osiągnięcia), 0061 (opisy top 100), 0062 (uwagi); numeracja ma lukę — `scripts/db-setup-gcp.sh` stosuje pliki w kolejności nazw i nie wymaga ciągłości. Wszystkie tylko dodają (nowe tabele i indeksy) albo — 0061 — zmieniają dane jednorazowo z kopią. Skrypt `db-setup-gcp.sh` uruchamia WSZYSTKIE migracje przy każdym przebiegu, więc 0061 ma zabezpieczenie jednorazowości (tabela kopii), a pozostałe `IF NOT EXISTS`. Przed każdym scaleniem z migracją: `pg_dump` do `~/backups/` (z datą), potem `scripts/db-setup-gcp.sh --check` (kod 1 = coś niszczącego, nie scalać).

## Co sprawdzić po każdym scaleniu

1. `pnpm run typecheck`, `scripts/test-api.sh` (całość), testy panelu i portalu.
2. Testy bezpieczeństwa generatora: `scripts/test-api.sh src/__tests__/beginner-safety.test.ts src/services/__tests__/beginnerBalancingPass.test.ts`.
3. `scripts/db-setup-gcp.sh` na bazie testowej, potem na aplikacji (po kopii); `scripts/test-db-setup.sh`.
4. Restart API (`scripts/stop-gcp.sh && scripts/dev-gcp.sh`), `scripts/smoke-gcp.sh` (oczekiwane 131 OK / 0 błędów).
5. Z wyłączonymi flagami aplikacja ma zachowywać się jak przed scaleniem: portal „Dziś”, plan, trening, panel trenera bez nowych elementów (poza „Zgłoś uwagę”, które znika przy `FEEDBACK_ENABLED` pustym).
6. Włączanie flag pojedynczo, każda z własnym testem dymnym i symulacją (`scripts/generator-sim.sh 300 7 calisthenics` dla kalistenyki).

## Ryzyka

- **Rozjazd tekstów wywiadu** (decyzja 56 vs nasze poprawki) — patrz krok 7; szkoda tylko kosmetyczna.
- **Dwa serwery Vite pracują z drzewa roboczego**: po scaleniu zmian frontendu portal i panel przeładują się same, API wymaga przebudowy i restartu.
- **Flaga kalistenyki** zmienia wyniki generatora tylko dla stylu „calisthenics”; flaga osiągnięć dodaje zapisy w bazie po treningach (tabele z 0056). Przed włączeniem w becie — jedna osoba testowa, potem reszta.
- **0061 zmienia 140 opisów** — to treść widoczna dla użytkowników; scalać dopiero po akceptacji.
