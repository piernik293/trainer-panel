# Porządki przed betą — raport (05.11.2026). TYLKO LISTA: nic nie zostało usunięte ani zmienione.

## 1. Konta QA, demo i testowe do usunięcia (decyzja i wykonanie: właściciel)
- Baza aplikacji: **44 klientów, 10 trenerów**. Z nazwą/adresem wskazującym test: **2 klientów** i **2 trenerów** (`…+clerk_test@…` lub „qa…”), trener techniczny „Fikstury testów” (id 702), konta `trener-a`/`trener-b` (smoke), kilku trenerów bez nazwy (id 422, 1049, 1159, 1166, 1333, 1375 — z poprzednich przebiegów QA/smoke).
- Konta QA założone w tej turze (Solo, `qaSolo…+clerk_test@example.com`) są w **osobnym schemacie `qa` bazy testowej** (`trainer_panel_test`), nie w bazie aplikacji; w Clerk (instancja development) zostały użytkownicy z tym samym wzorcem — do usunięcia w panelu Clerk (filtr „clerk_test”).
- Jak: `scripts/usun-konta-demo.sh` — **uruchom najpierw w trybie podglądu** (pokazuje listę), zrób kopię bazy, dopiero potem z potwierdzeniem. Nie uruchamiałem go (nawet podglądu — system zablokował jako operację usuwania); listę policzyłem zapytaniami tylko do odczytu.
- Nowe wpisy po tej turze: kampania „Złote Byczki” — w bazie aplikacji 0 przyznanych (konta administratora/QA/testowe są z puli wykluczone), więc sprzątanie nie zwolni miejsc.

## 2. Test przywrócenia kopii (osobna baza, schemat tymczasowy)
`scripts/backup-restore-test.sh` na dziennej kopii z 05.11 03:15: **OK** — 59 tabel, trenerzy 10/10, klienci 44/44, wywiady 57/57, ćwiczenia 599/599, plany 6/6. Kopie przed migracjami (`przed_0074`, `przed_scaleniem_*`) są w `~/backups/` (rotacja usuwa tylko pliki `daily_*`).
Uwaga: kopie leżą na tej samej maszynie — kopia poza maszyną to nadal Twoja decyzja (`docs/WDROZENIE-PLAN.md`, sekcja 6).

## 3. Zasoby
Dysk 13 z 30 GB (44%), wolne 16 GB. RAM 7,8 GB, wolne 4,8 GB przy działającej aplikacji. Kopie: 14 dni dziennych + ręczne.

## 4. Flagi — stan i rekomendacja
| Flaga | Teraz | Rekomendacja na betę |
|---|---|---|
| `UI_V2_ENABLED`, `BRAND_V1_ENABLED` | włączone | zostaw (nowy wygląd i byczek) |
| `SOLO_ENABLED`, `OWN_PLAN_ENABLED` | włączone (ZGODA) | zostaw |
| `GOLDEN_BULLS_ENABLED` | włączone | zostaw; przed zaproszeniem sprawdź pule 10/100 i wykluczenia |
| `ACHIEVEMENTS_ENABLED`, `FEEDBACK_ENABLED`, `CALISTHENICS_ENABLED` | włączone | zostaw |
| `GUEST_DEMO_ENABLED` | włączone | do decyzji: demo bez konta jest publiczne po otwarciu na świat — zostaw, jeśli chcesz pokazywać aplikację |
| `BETA_NO_LIMITS` | włączone | **wyłącz przed otwarciem**, jeśli limity Free (3 podopiecznych itd.) mają działać; w becie bez limitów zostaw |
| `CONDITIONING_ENABLED` | puste (wyłączone) | zostaw wyłączone |
| `EXERCISE_ANIMATIONS_ENABLED` | nie istnieje / wyłączona | **nigdy nie włączać** bez Twojej zgody |
| `HSTS_ENABLED`, `TRUST_PROXY`, `CSP_ENFORCE` | nie ustawione | ustaw dopiero na produkcji (`docs/OTWARCIE-KROK-PO-KROKU.md`, krok 11) |

## 5. Gałęzie niescalone (nic nie usunięte)
`backup/migracja-gcp-przed-zmiana-autora` (kopia historii — zostaw), `docs/przeglad-katalogu`, `feature/progresja`, `test/wszystko`, `test/wszystko-2` (gałęzie testowe/robocze). Do decyzji, czy `feature/progresja` i `docs/przeglad-katalogu` mają wejść do `main`; nie scalałem ich (poza bieżącym planem).

## 6. Znane drobiazgi otwarte
- Małe cele dotykowe i przełączniki bez nazwy w panelu trenera (`docs/QA-BETA-2.md`, poz. 7–8) — razem z nową nawigacją.
- Zalogowane „Dziś” na realnym telefonie i ścieżka WebKit — lista „Test jako Bartek”.
