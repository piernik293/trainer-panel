# Przegląd błędów — trainer-panel na GCP (22.10.2026)

Plan: `~/naprawa-wszystkich-bledow.txt`. Gałąź `migracja-gcp`. Dowody: test dymny
`scripts/smoke-gcp.sh` (curl przez API z prawdziwymi sesjami Clerk dev), Playwright
headless (`~/tools/pw`, poza repo), testy vitest.

## Jak testowano

- Konta testowe w instancji development Clerk: `trener-a`, `trener-b`, `klient-a1`
  (klient trenera A), `klient-b1` — adresy `…+clerk_test@example.com`, tworzone
  przez Clerk Backend API. Konto użytkownika nie było używane do zapisu danych.
- Testy API (`scripts/test-api.sh`) działają na osobnej bazie `trainer_panel_test`,
  nigdy na bazie aplikacji.

## Endpointy API (109)

| Grupa | Liczba | Ochrona | Wynik (test dymny) |
|---|---|---|---|
| Trener (`requireAuth`) | 83 | sesja + profil trenera; konto klienta → 403 | właściciel: 200; trener B: 404/403; klient: 403; bez sesji: 401 |
| Portal klienta (`requireClientAuth`) | 13 | sesja konta powiązanego z klientem | klient A1 widzi swój plan; klient B1 nie widzi danych A1; bez sesji: 401 |
| Publiczne katalogu (odczyt) | 9 | brak (celowo) | prywatne ćwiczenia innych trenerów ukryte (404) |
| Publiczne ankiety / aktywacji | 4 | token jednorazowy | ponowne użycie tokenu → 410 |
| `POST /api/trainer/profile` | 1 | sesja, odmowa dla konta klienta | idempotentne, wyścig 5 żądań → 1 rekord |

Pełna lista tras: `artifacts/api-server/src/routes/*.ts` (test dymny sprawdza 20
tras z parametrami klienta/planu dla 4 ról oraz 31 tras GET właściciela).

## Ekrany

| Trasa | Endpointy | Status | Przyczyna | Naprawa | Dowód |
|---|---|---|---|---|---|
| `/` Pulpit | `/stats`, `/subscription/summary` | naprawione | 401 (zły klucz Clerk) + brak stanu błędu: szkielet ↔ fałszywy pusty stan bez końca | `55512fa`, `2f89d03` | Playwright z wymuszonym 401; test `dashboard-empty-state` |
| `/calendar` | `/availability/calendar` | działa | — | — | Playwright (także przy 401 pokazuje błąd i „Spróbuj ponownie”) |
| `/survey-invite` | `/survey-invites` | naprawione | błąd listy wyglądał jak „Brak aktywnych zaproszeń” | `f1c5c88` | test `survey-invite-error`, Playwright |
| `/exercises` | `/exercises`, `/muscles` | działa | — | — | Playwright |
| `/exercises/new` | `/muscles` | działa | wcześniejsze „Ładowanie danych…” = 401 przy złym kluczu | — | Playwright |
| `/clients` | `/clients` | działa | — | — | Playwright |
| wszystkie ekrany panelu | `POST /trainer/profile` | nowe | role: profil trenera tworzony po zalogowaniu | `4f31bc8` | test `trainer-profile-gate` |
| `/clients/:id` (sprzęt) | `/clients/:id/survey` | naprawione | brak sprzętu był niewidoczny | `f5494e2` | — |
| portal: `/survey/:token` → `/invite/:token` → `/plan` | public, aktywacja, `/client-portal/plan` | działa (API) | — | — | test dymny |
| pozostałe ekrany panelu | — | niezweryfikowane w przeglądarce | — | — | do kliknięcia ręcznie |

## Naprawione błędy

| Priorytet | Błąd | Commit |
|---|---|---|
| P0 | `POST /api/muscles` i `PUT /api/exercises/:id/muscles` bez autoryzacji — anonim mógł zmienić katalog | `595608a` |
| P0 | Każde konto Clerk (także klienta) stawało się trenerem przy pierwszym żądaniu | `4f31bc8` |
| P1 | „Ławeczka treningowa” z ankiety ≠ „Ławka” w katalogu — 24 ćwiczenia niedostępne | `f978fd6` |
| P1 | Siłownia bez sprzętu: zgodność = tylko masa ciała, szkic = pełna siłownia | `f5494e2` |
| P1 | 21 fikstur testów z `trainer_id = NULL` blokowało start API przy ≥ 2 trenerach | dane (pg_dump, przypisanie do `test_fixtures_owner`) + `edd32c5` |
| P2 | Wieczne ładowanie / cichy błąd na Pulpicie i w zaproszeniach; brak ponowień 4xx | `55512fa`, `2f89d03`, `f1c5c88` |

## Testy (22.10, po decyzjach 1–5)

- api-server (`scripts/test-api.sh`, baza testowa): 2141 OK / 0 nie (start: 1981 / 129).
  Pozostałe 4 są poprawne i czekają na decyzje (patrz niżej): 3 × `workout-history`
  (brak indeksu `ws_one_active_per_client_day`), 1 × katalog (ćwiczenia 259/260 bez mięśni).
- trainer-app: 715/715. client-landing: 9/9. beginner-safety + beginnerBalancingPass: zielone.
- Typecheck: api-server, trainer-app, client-landing, panel-trenera-deck, scripts, lib — 0 błędów.
  mockup-sandbox: 71 błędów w wygenerowanych szablonach Replit (nie jest produktem).
- Build: api-server, trainer-app, client-landing — OK. Test dymny: 116 OK / 0 BŁĄD.

### Ustalenia przy naprawie testów

| Plik | Klasa | Prawda / rozstrzygnięcie |
|---|---|---|
| exercise-batch-01 | dane | plik ma 92 wiersze od `94dca7f`; seedy: 158 ćwiczeń, 12 celów, 48 wytycznych |
| planDraftVolumeDecision | test nieaktualny | spec 28.07: start od absoluteMax dla wszystkich poziomów, bez obniżek, strefa D przyjmowana z ostrzeżeniem |
| clientPortal.integration | test nieaktualny | dostęp po `?email=` usunięty w `5711879` — test na sesji klienta |
| preview / experience-levels / exercise-metadata | dane | ID z bazy Replit → klienci-fikstury |
| invite-flow, client-portal-auth, multi-tenancy | fikstura | mocki bazy nieobsługujące nowszych zapytań |
| brak-aktywnosci-fixes, distributionHelpers | fikstura / test nieaktualny | trudność null (reguła z 22.10), liczba celów nie jest stała |
| no-activity-fullbody-corrections | test wzmocniony | warunek AND sprzętu był po cichu pomijany |

## Decyzje zrealizowane (23.10)

1. **Indeksy** `ws_one_active_per_client_day`, `eel_exercise_idx`, `idx_client_invitations_client_id`:
   pg_dump, brak duplikatów, utworzone w bazie aplikacji i testowej, dopisane do schematu
   Drizzle (`lib/db/src/schema/plans.ts`, `clientInvitations.ts`). Trzeba je założyć ręcznie
   (lub `psql -f lib/db/migrations/…`) na każdej nowej bazie, bo `drizzle-kit push` pomija migracje SQL.
2. **Katalog:** ćwiczenie 259 → łydka brzuchata 1.0 + płaszczkowaty 0.5; 260 → czworogłowy 1.0 +
   pośladkowy wielki 0.5 (baza + `catalogueSeed.ts`, id przypisań 759–762).
3. **Mięsień „X” (id 29)** usunięty po sprawdzeniu braku powiązań (pg_dump przed).
4. **mockup-sandbox** wyłączony z `pnpm run typecheck` i `pnpm run build` (nic nie usunięto).
   Build wymaga `PORT` i `BASE_PATH` (configi Vite z Replit).

Wynik: api-server 2141/2141, trainer-app 715/715, client-landing 9/9, testy bezpieczeństwa
generatora 101/101, test dymny 116 OK / 0 BŁĄD.
