# trainer-panel — instrukcje dla Claude Code

Panel trenera personalnego (klienci, ankiety, generator planów, portal klienta).
Przeniesiony z Replit na maszynę wirtualną GCP. Odpowiadaj po polsku, krótko.
Szczegółowy plan bieżącego etapu jest w `~/etap-1-uruchomienie-i-stabilizacja.txt`, a postęp w `docs/POSTEP-GCP.md`. Kierunek rozwoju: `docs/ROADMAP.md`; stan błędów: `docs/PRZEGLAD-BLEDOW.md`.

## Stack
- Monorepo pnpm 10.34.7 (`packageManager`), Node 24, TypeScript 5.9.
- `artifacts/api-server`: Express 5 + Clerk (`@clerk/express`) + Drizzle, port 8080, prefiks `/api`.
- `artifacts/trainer-app`: panel trenera (Vite + React), port 23889, `BASE_PATH=/`.
- `artifacts/client-landing`: portal klienta (Vite + React), port 22347, `BASE_PATH=/client-landing/`.
- `artifacts/mockup-sandbox` i `artifacts/panel-trenera-deck`: makiety i prezentacja, nie są produktem.
- `lib/db` (schemat Drizzle), `lib/api-spec`/`api-zod`/`api-client-react` (OpenAPI + kodogeneracja), `lib/survey-config`.
- PostgreSQL 17 lokalnie (`localhost:5432`, baza `trainer_panel`), `DATABASE_URL` jest w `.env`.

## Uruchomienie na GCP
- Maszyna wirtualna `instance-20261021-155053`, strefa `europe-central2-a`. Porty nie są wystawione na świat, dostęp tylko przez tunel SSH.
- Zmienne środowiskowe są w `.env` (szablon: `.env.example`). Wczytanie: `set -a; . ./.env; set +a`.
- Start i stop: `scripts/dev-gcp.sh` / `scripts/stop-gcp.sh` (dodawane w etapie A2).
- Wszystko działa pod jednym adresem, jak w Replit. Vite panelu (23889) przekazuje `/api` → 8080 oraz `/client-landing` → 22347. Linki zaproszeń są budowane z `window.location.origin`.
- Tunel: `gcloud compute ssh instance-20261021-155053 --zone europe-central2-a -- -L 23889:localhost:23889`, potem otwórz http://localhost:23889.
- Clerk to instancja development. Role adminów nadaje się przez env (`APP_ADMIN_CLERK_IDS`, `CATALOGUE_ADMIN_CLERK_IDS`), nie przez metadane Clerk.
- Role: rekord `trainers` powstaje tylko przez `POST /api/trainer/profile` (panel trenera woła go po zalogowaniu). `requireAuth` nikogo nie tworzy; konto powiązane z klientem dostaje 403 `CLIENT_ACCOUNT`.
- API po zmianie kodu wymaga restartu (`scripts/stop-gcp.sh && scripts/dev-gcp.sh`) — działa ze zbudowanego `dist`.

## Testy, typecheck, build
- API: `scripts/test-api.sh [pliki…]` — vitest na osobnej bazie `trainer_panel_test`. Nigdy nie uruchamiaj testów API na bazie aplikacji: testy integracyjne tworzą rekordy (fikstury bez trenera blokują start API przy ≥ 2 trenerach). Frontendy: `pnpm --filter @workspace/trainer-app test`, `pnpm --filter @workspace/client-landing test`.
- Test dymny działającej aplikacji (po `scripts/dev-gcp.sh`): `scripts/smoke-gcp.sh` — przepływ zaproszenie → ankieta → plan → portal klienta i izolacja dla trenera A/B, klienta A1/B1 i braku sesji; ~2 s, kod wyjścia 0 = OK. Uruchamiaj po każdej większej zmianie. Konta testowe Clerk dev tworzy sam (`…+clerk_test@example.com`); sprząta swoich klientów.
- Testy bezpieczeństwa generatora (muszą być zielone po każdej zmianie generatora):
  `pnpm --filter @workspace/api-server exec vitest run src/__tests__/beginner-safety.test.ts src/services/__tests__/beginnerBalancingPass.test.ts`
- Typecheck: `pnpm run typecheck`. Build: `pnpm run build`.
- Jeden ciężki proces naraz (8 GB RAM). Długie komendy zapisuj do logu w pliku i pilnuj `free -h`.

## Reguły biznesowe (nie wolno ich osłabić)
- Klient nieaktywny: każde ćwiczenie w każdym slocie i każdej ścieżce awaryjnej ma `suitableForNoActivity === true`. Nie ma fallbacku na ćwiczenia niebezpieczne. Wolno ponownie użyć ćwiczeń bezpiecznych.
- Klient początkujący lub nieaktywny: `learningDifficulty` równe null/undefined oznacza odrzucenie ćwiczenia.
- Poziom „sredniozaawansowany” zaczyna się od ok. 2 lat doświadczenia. Rozbieżności w kodzie zgłaszaj.
- BMR/TDEE/BMI to szacunki, nie diagnoza. Żadnych sformułowań medycznych ani diagnostycznych w UI.
- Nie wyłączaj testów, nie dodawaj `.skip` i nie osłabiaj asercji bezpieczeństwa tylko po to, żeby testy były zielone.

## Dane i sekrety
- Sekrety trzymaj tylko w `.env`. Nigdy nie wypisuj ich wartości w logach, commitach ani raportach.
- Przed każdą zmianą schematu bazy zrób `pg_dump` do `~/backups/` (z datą w nazwie).
- **STAŁA ZASADA — schemat bazy zmienia się tylko addytywnie; żaden skrypt nie usuwa ani nie zmienia nazw tabel, kolumn, indeksów, ograniczeń.**
  - `scripts/db-setup-gcp.sh` (po `pg_dump`): na **pustej** bazie `drizzle-kit push` tworzy tabele bazowe, ale tylko jeśli jego plan nie ma nic niszczącego (DROP, RENAME, TRUNCATE, DELETE, zmiana typu) — inaczej przerywa z błędem. Na **istniejącej** bazie `push` NIE jest uruchamiany (usuwałby indeksy/klucze z migracji SQL i tabele innych gałęzi). Potem migracje `lib/db/migrations/*.sql`; migracja z instrukcją niszczącą jest odrzucana (wyjątek historyczny: 0011).
  - `scripts/db-setup-gcp.sh --check` — tylko pokazuje plan drizzle-kit (kod 1 przy zmianach niszczących), nic nie wykonuje. `pnpm --filter @workspace/db run push` uruchamia ten sam bezpieczny skrypt.
  - Test zabezpieczenia: `scripts/test-db-setup.sh` (tymczasowa baza; tabela/kolumna/indeks spoza schematu zostają nietknięte). Uruchom po każdej zmianie `db-setup-gcp.sh`.
  - Każda zmiana schematu = nowa migracja SQL w `lib/db/migrations/` (nowe tabele, kolumny nullable, indeksy) + zmiana w schemacie Drizzle. Nigdy `drizzle-kit push` bezpośrednio, nigdy `push --force` / `push-force`, nigdy ręczny `DROP`.
  - Baza testowa: `DATABASE_URL=…/trainer_panel_test scripts/db-setup-gcp.sh`.

## Git
- Pracujesz na gałęzi `migracja-gcp`. Jeden commit to jedna logiczna zmiana, opis po polsku.
- Autor commitów: `piernik293@users.noreply.github.com` (ustawione w lokalnym git config).
- Zakazane: `git reset --hard`, `git clean`, force push, usuwanie gałęzi.
- Push i merge do `main` tylko po zgodzie użytkownika.

## Koszty
- Żadnych płatnych usług ani płatnych API. Nie uruchamiaj Cloud Build, Cloud Run ani Cloud SQL.
- Nie dodawaj nowych bibliotek, chyba że nie ma alternatywy. Wtedy uzasadnij wybór.

## Punkty STOP: zatrzymaj się i zapytaj
1. Każdy push na GitHub i merge do `main`.
2. Zmiana schematu bazy, nawet addytywna (najpierw backup).
3. Cokolwiek płatnego albo wymagającego nowej usługi.
4. Sekrety, których nie ma w `.env`.
5. Zmiana reguły biznesowej lub zachowania widocznego dla użytkownika, której nie ma w planie.
6. Usunięcie plików, danych lub funkcji.
Poza tymi punktami działasz samodzielnie: standardowe, odwracalne decyzje techniczne podejmujesz sam i krótko uzasadniasz w raporcie.
