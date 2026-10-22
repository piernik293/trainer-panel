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

## Testy (22.10, po naprawach)

- api-server (`scripts/test-api.sh`, baza testowa): 2073 OK / 64 nie (wcześniej 1981 / 129).
- trainer-app: 709 OK / 2 nie (`distributionHelpers` — rozjazd testu z kodem, sprzed migracji).
- client-landing: 9/9. beginner-safety + beginnerBalancingPass: zielone.
- Test dymny: 116 OK / 0 BŁĄD (~2 s).

### Pozostałe niepowodzenia api-server (klasyfikacja)

| Plik | Liczba | Klasa | Uwagi |
|---|---|---|---|
| exercise-batch-01 | 13 | fikstura/dane | test z 13.07 (82 rekordy, 87 ćwiczeń, 44 wytyczne); plik ma 92 rekordy od `94dca7f` (20.07), seed: 158/48. Prawdą są dane — trzeba zaktualizować test |
| client-creation-invite-flow | 12 | fikstura | mock bazy sprzed zmian w zaproszeniach |
| clientPortal.integration | 9 | fikstura | do ustalenia (wyszukiwanie klienta po e-mailu → 404) |
| planDraftVolumeDecision | 6 | kod/test | niezweryfikowane |
| preview.integration, experience-levels | 10 | dane | twarde ID klientów z bazy Replit (3, 4, 19, 20) |
| exercise-metadata | 5 | dane | liczności katalogu z Replit |
| workout-history, client-portal-auth, brak-aktywnosci-fixes, multi-tenancy (7) | 9 | niezweryfikowane | multi-tenancy (7) zwracał 500 już przed zmianami |

## Do decyzji

1. Ekrany bez obsługi błędu (pokazują stan pusty lub nic przy błędzie API): `ClientList`,
   `ExerciseList`, `ExerciseDetail`, `ExerciseRelations`, `ExerciseRecommendationsTab`,
   `Step5Preview`, `VolumePanel`, `VolumeCoverageSection`, `AvoidedExercisesPicker`,
   `FavoriteExercisesPicker`, `BulkImportModal` — naprawa wg wzoru z Pulpitu (`ErrorState`).
2. Konto trenera, które aktywuje zaproszenie do portalu klienta — obecnie dozwolone.
3. Dom / plener / brak lokalizacji bez sprzętu: zgodność = tylko masa ciała, a szkic
   planu zakłada sprzęt domowy (`HOME_GYM_EQUIPMENT`).
4. 401 w panelu pokazuje komunikat „Twoja sesja wygasła…” — automatyczne
   przekierowanie do logowania nie zostało dodane (ryzyko pętli przy złym kluczu serwera).
