# Bezpieczeństwo i RODO przed betą (27.10.2026)

Przegląd na działającym kodzie z gałęzi `main` + poprawki z gałęzi `qa/przeglad-bety` i `qa/bezpieczenstwo`. Nic tu nie jest poradą prawną — pytania do prawnika są na końcu.

## 1. Role i kto co widzi
| Rola | Skąd się bierze | Widzi |
|---|---|---|
| Trener | rekord `trainers`; tworzy go tylko `POST /api/trainer/profile`, i to wyłącznie dla kont z listy `TRAINER_CLERK_IDS`, administratorów albo po akceptacji wniosku | tylko swoich podopiecznych (`clients.trainer_id` = on), swoje plany, sesje, pakiety, kody, własne ćwiczenia |
| Podopieczny | konto Clerk połączone z rekordem `clients` (zaproszenie mailem albo akceptacja prośby) | tylko siebie: plan, trening, kroki, pakiet (bez ceny), zgoda |
| Osoba bez trenera (Solo) | `clients.trainer_id` = NULL, konto Clerk | tylko siebie; nikt inny nie widzi jej danych (trener dopiero po akceptacji prośby) |
| Administrator | wyłącznie lista `APP_ADMIN_CLERK_IDS` w `.env`; nie da się tego nadać z aplikacji | domyślnie tylko liczby i statusy; szczegóły osoby tylko z powodem (≥ 10 znaków), wpis w dzienniku dostępu zapisuje się PRZED pokazaniem danych |

Zasada w kodzie: identyfikator trenera i podopiecznego pochodzi wyłącznie z podpisanej sesji Clerk, nigdy z treści żądania. Obcy zasób zawsze daje 404 (nie 403), żeby nie dało się zgadywać numerów.

## 2. Izolacja danych — wyniki sprawdzenia
- **Macierz na żywej aplikacji** (skrypt `~/tools/pw/qa/isolation.mjs`): 26 tras GET trenera z identyfikatorem klienta/planu/sesji/pakietu wywołanych przez 5 tożsamości (właściciel, obcy trener, podopieczny, osoba bez trenera, brak sesji). **0 wycieków**: obcy trener 404, podopieczny i osoba bez trenera 403, brak sesji 401.
- Testy automatyczne (2700+): izolacja trener/trener i podopieczny/podopieczny w kroków, pakietach, planach, kondycji, prośbach o dołączenie (`join-requests`), panelu administratora (`admin-panel`), wnioskach (`trainer-applications`).
- Katalog ćwiczeń: ćwiczenia prywatne trenera widzi tylko właściciel (`canViewExercise`), obcy dostaje 404 — także w trasach `/substitutions`, `/progressions`, `/muscles`.
- Administrator nie ma w zwykłych listach danych zdrowotnych (test `admin-panel`: brak pól bólu, wywiadu i notatek w listach).

## 3. Uprawnienia tras API (199 tras)
Zestawienie z kodu: **131 tras trenera** (`requireAuth`), **29 tras podopiecznego** (`requireClientAuth`), **14 tras administratora** (`requireAuth` + lista administratorów, odpowiedź 403 dla innych), 1 trasa administratora katalogu. Poniżej wszystkie trasy BEZ wspólnego middleware — każda jest świadomie publiczna albo sprawdza sesję Clerk w środku:

| Metoda | Trasa | Zabezpieczenie |
|---|---|---|
| GET | `/api/account/roles` | sesja Clerk; tylko własne role |
| GET | `/api/account/status` | sesja Clerk; tylko własne konto |
| POST | `/api/client-errors` | otwarta (błąd może wystąpić przed logowaniem); limit 20/min/IP; treść oczyszczana (e-maile, tokeny, hasła, słowa zdrowotne) |
| GET | `/api/client-invitations/:token` | token 256-bit (SHA-256 w bazie), zwraca imię, e-mail i nazwę trenera tylko posiadaczowi tokenu; limit 30/min |
| POST | `/api/client-invitations/:token/activate` | sesja Clerk + token; konto trenera odrzucone; jedno użycie |
| POST | `/api/client-portal/disconnect` | sesja Clerk; tylko własne konto |
| GET | `/api/exercises` | bez sesji: tylko katalog publiczny; z sesją trenera: katalog + własne |
| GET | `/api/exercises/:id` | prywatne ćwiczenie widzi tylko właściciel (inni dostają 404) |
| GET | `/api/exercises/:id/muscles` | jak wyżej |
| GET | `/api/exercises/:id/progressions` | jak wyżej |
| GET | `/api/exercises/:id/substitutions` | jak wyżej |
| GET | `/api/exercises/search` | katalog publiczny; tylko ćwiczenia bez właściciela (bez prywatnych trenerów) |
| GET | `/api/healthz` | status serwera bez danych |
| GET | `/api/join/:code` | kod 10 znaków; zwraca tylko imię trenera; limit 10 prób/15 min na IP; błędny kod = 404 |
| POST | `/api/join/:code/request` | sesja Clerk; limit 10 prób/15 min na konto i IP; konto trenera odrzucone |
| GET | `/api/muscles` | słownik mięśni (dane publiczne) |
| GET | `/api/public/survey/:token` | token 256-bit; limit 30/min |
| POST | `/api/public/survey/:token` | token 256-bit; limit 30/min |
| GET | `/api/solo/me` | sesja Clerk; wyłączone flagą |
| POST | `/api/solo/start` | sesja Clerk; wyłączone flagą SOLO_ENABLED |
| GET | `/api/solo/status` | tylko flaga włączenia |
| POST | `/api/trainer-applications` | sesja Clerk; tylko własny wniosek |
| POST | `/api/trainer/profile` | sesja Clerk; rola trenera tylko z listy dopuszczonych (TRAINER_CLERK_IDS) lub administrator; limit 20/min |
| GET | `/api/volume-guidelines` | tabela wytycznych objętości (dane publiczne) |

Wniosek: nie znalazłem trasy z danymi osobowymi dostępnej bez sesji albo bez tajnego tokenu.

## 4. Limity zapytań
Limiter w pamięci procesu (okno stałe; po restarcie liczniki się zerują; działa dla jednej kopii API):
- tokeny publiczne (`/api/public`, `/api/client-invitations`): 30/min na adres IP;
- `POST /api/trainer/profile`: 20/min; generator planu: 120/min na konto;
- kod trenera i dołączanie (`/api/join/*`): 10 prób na 15 minut na konto i na adres IP (w tym błędne kody);
- zgłaszanie błędów z panelu i portalu (`/api/client-errors`): 20/min na IP.
Za reverse proxy ustaw `TRUST_PROXY`, inaczej wszyscy użytkownicy mają ten sam adres IP.

## 5. Nagłówki
API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy: default-src 'none'`, brak `X-Powered-By`; `Strict-Transport-Security` dopiero po ustawieniu `HSTS_ENABLED=1` (po wdrożeniu HTTPS). Panel i portal: te same nagłówki; CSP w trybie „tylko raport” (decyzja właściciela nr 2 — twarde po czystym przebiegu na HTTPS, `CSP_ENFORCE=1`). CORS: obce źródło (`https://evil.example`) nie dostaje nagłówka `Access-Control-Allow-Origin` — sprawdzone na żywej aplikacji.

## 6. Co trafia do logów
- Logi żądań: metoda, adres bez parametrów, numer żądania, kod odpowiedzi. Nagłówki `authorization` i `cookie` są wycinane. Treści żądań nie są logowane.
- **Znaleziona dziura (naprawiona na `qa/bezpieczenstwo`):** adres żądania zawiera tajne fragmenty (`/api/public/survey/<token>`, `/api/client-invitations/<token>`, `/api/join/<kod>`), a poziom logów `info` (domyślny w `.env.example`) zapisuje je w pliku. Teraz są zamieniane na `:token` w logach żądań, w logu błędów serwera i w dzienniku błędów administratora (test `mask-url`).
- Dziennik błędów administratora (tabela `app_errors`): tylko oczyszczony, krótki opis; usuwane e-maile, tokeny, hasła, długie liczby, parametry adresów; opis ze słowami zdrowotnymi ukrywany w całości; retencja 90 dni.
- Log serwera po wysłaniu maila administratorowi nie zawiera już imienia klienta (poprawka na `qa/bezpieczenstwo`).

## 7. Kopie bazy i test przywrócenia
- Kopia codziennie o 3:15 (`scripts/backup-db.sh`, cron wskazuje `~/trainer-panel`): plik `~/backups/trainer_panel_daily_*.sql.gz`, kontrola wolnego miejsca (≥ 2 GB), test spójności `gzip -t`, rotacja 14 dni (tylko własnych plików).
- Test przywrócenia: `scripts/backup-restore-test.sh` — przywraca ostatnią kopię do tymczasowego schematu w bazie testowej i liczy tabele; uruchamiaj co tydzień.
- **Ryzyko otwarte:** kopie leżą na tym samym dysku maszyny co baza — awaria dysku lub usunięcie maszyny traci wszystko. Przed betą: druga kopia poza maszyną (np. zaszyfrowany plik pobierany co tydzień na komputer właściciela; nic płatnego nie jest potrzebne na start).

## 8. Gdzie są dane o zdrowiu i kto je widzi
| Dane | Tabela / pole | Kto widzi |
|---|---|---|
| Opis kontuzji i ograniczeń z wywiadu | `surveys.health_limitations`, `injury_status`, `confirmed_restrictions` | trener podopiecznego; po prośbie o wgląd z powodem — administrator |
| Zgłoszenia „Coś boli?” | `pain_reports` | trener podopiecznego, sam podopieczny; administrator tylko liczba (szczegóły z powodem) |
| Uwagi trenera o podopiecznym | `trainer_notes`, `workout_plans.trainer_notes` | tylko trener (portal ich nie zwraca) |
| Zgoda na dane o zdrowiu | `surveys.health_consent_*` | trener podopiecznego, podopieczny (może wycofać) |
| Kopie bazy | `~/backups/*.sql.gz` | właściciel maszyny (dostęp SSH) |
Bez zgody generator używa najostrożniejszych ustawień. Wycofanie zgody nie usuwa odpowiedzi (decyzja nr 3 — do prawnika). Wyniki testów dymnych i QA używają kont testowych `+clerk_test@example.com`; w bazie aplikacji są też dane fikstur testowych (technicy) — przed betą usuń je skryptem z listy w `docs/BETA-START.md`.

## 9. Znalezione problemy bezpieczeństwa
| # | Waga | Problem | Stan |
|---|---|---|---|
| 1 | krytyczny | Start API: osoba z kontem bez trenera (Solo / prośba o dołączenie w toku) przerywała start API przy ≥ 2 trenerach („niejednoznaczne”), a przy jednym trenerze zostałaby po cichu mu przypisana (trener widziałby jej dane bez akceptacji) | naprawione (`qa/przeglad-bety` i `qa/bezpieczenstwo`, test `startup-migration-solo`) |
| 2 | ważny | Tajne tokeny i kody w adresach zapisywane w logach i w dzienniku błędów | naprawione (`qa/bezpieczenstwo`, test `mask-url`) |
| 3 | ważny | Kopie bazy tylko na tej samej maszynie | otwarte — decyzja i działanie właściciela |
| 4 | średni | Limity zapytań w pamięci procesu (restart zeruje, nie działa przy kilku kopiach API) | do zaakceptowania na betę (jedna kopia API) |
| 5 | średni | CSP w trybie „tylko raport” | do włączenia po HTTPS (decyzja nr 2) |
| 6 | niski | Konta testowe i fikstury w bazie aplikacji | do usunięcia przed betą (usunięcie danych tylko za zgodą właściciela) |
| 7 | niski | Clerk w trybie developerskim (klucze testowe) | przed betą klucze produkcyjne (`docs/BETA-START.md`) |

## 10. Lista kontrolna przed otwarciem na świat
- [ ] HTTPS i domena działają; w `.env` produkcyjnym: `NODE_ENV=production`, `HSTS_ENABLED=1`, `TRUST_PROXY` ustawione, `TRAINER_SIGNUP_OPEN` PUSTE.
- [ ] Klucze Clerk produkcyjne (nie `pk_test_`/`sk_test_`); lista `APP_ADMIN_CLERK_IDS` zawiera tylko właściciela; `TRAINER_CLERK_IDS` tylko zaufani trenerzy.
- [ ] `CSP_ENFORCE=1` po czystym przebiegu (brak raportów naruszeń).
- [ ] Porty 8080/22347/23889 nie są wystawione; na zewnątrz tylko reverse proxy (Caddy) z HTTPS.
- [ ] Kopia bazy działa (log `~/logs/backup-db.log`), test przywrócenia przeszedł, jest druga kopia poza maszyną.
- [ ] Konta demo i fikstury usunięte (za zgodą), baza bez rekordów testowych.
- [ ] Szkielety dokumentów prawnych uzupełnione przez prawnika (polityka, regulamin, zgoda) i wersja zgody podniesiona.
- [ ] `SOLO_ENABLED` i `CONDITIONING_ENABLED` wyłączone (do czasu ekranów).
- [ ] Repozytorium prywatne; `.env` poza repozytorium (sprawdź `git ls-files | grep env`).
- [ ] Po wdrożeniu: `scripts/smoke-gcp.sh` i ręczny przegląd jednego zaproszenia od końca do końca.

## 11. Pytania do prawnika (bez zmian)
Co z danymi po wycofaniu zgody; treść zgody i polityki; okres przechowywania kopii (14 dni) i dziennika dostępu; czy trener ręcznie potwierdzający zgodę podopiecznego wystarcza (pole „Podopieczny wyraził zgodę…”).
