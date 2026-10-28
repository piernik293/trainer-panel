# Beta — co musi zrobić właściciel (krok po kroku)

Ta lista jest dla Ciebie. Każdy punkt ma czas i koszt. **Kwoty są orientacyjne — sprawdź aktualne cenniki przed zakupem** (ceny usług zmieniają się, a ja ich nie kupuję ani nie zakładam kont). Szczegóły techniczne wdrożenia są w `docs/WDROZENIE-PLAN.md`; gotowe wzory plików: `deploy/Caddyfile.example`, `deploy/env.production.example`, `deploy/trainer-api.service.example`.

Kolejność ma znaczenie: nie zapraszaj nikogo (pkt 9), zanim nie zrobisz punktów 1–8.

## Przed zaproszeniem pierwszej osoby
| # | Co | Jak | Czas | Koszt (orient.) |
|---|---|---|---|---|
| 1 | **Zatwierdź scalenie gałęzi QA** | Przeczytaj `docs/QA-BETA.md` i `docs/RAPORT-DLA-WLASCICIELA.md`. Odpowiedz „tak/nie” przy punktach „czeka na decyzję” (lista w `docs/DO-DECYZJI.md`). Szczególnie: krytyczna poprawka startu API (`qa/przeglad-bety`) musi trafić do `main` PRZED jakimkolwiek restartem aplikacji z `main`. | 30–60 min | 0 |
| 2 | **Domena** | Kup domenę (np. `.pl`) u dowolnego rejestratora; ustaw rekord `A` na stały adres IP maszyny (pkt 3). | 20 min + do kilku godzin na propagację DNS | ok. 30–100 zł/rok |
| 3 | **Stały adres IP i porty** | W konsoli GCP zarezerwuj stały zewnętrzny adres IP dla maszyny i otwórz w firewallu TYLKO porty 80 i 443 (nie 8080, 22347, 23889). Dostęp SSH zostaw tylko dla siebie. | 20 min | zwykle 0 przy adresie przypiętym do działającej maszyny (sprawdź cennik GCP) |
| 4 | **HTTPS (Caddy)** | Zainstaluj Caddy, skopiuj `deploy/Caddyfile.example`, wpisz swoją domenę — certyfikat odnawia się sam. Ustaw w `.env`: `HSTS_ENABLED=1`, `TRUST_PROXY=1`, `CSP_ENFORCE=1` dopiero po kilku dniach bez raportów. | 45–90 min | 0 (Let's Encrypt) |
| 5 | **Clerk produkcyjny** | W Clerk utwórz instancję produkcyjną, dodaj domenę, skopiuj nowe klucze do `.env` (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`). Klucze testowe (`pk_test_`) zastąp. Konta z instancji deweloperskiej NIE przechodzą — Ty i zaufani trenerzy zakładacie konta od nowa, potem wpisujecie ich identyfikatory do `APP_ADMIN_CLERK_IDS` i `TRAINER_CLERK_IDS`. | 1–2 h | darmowy poziom zwykle wystarcza na betę (sprawdź limity aktywnych użytkowników) |
| 6 | **Maile (zaproszenia i powiadomienia)** | Skonfiguruj skrzynkę nadawczą (SMTP): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; nadawca na własnej domenie (SPF/DKIM u rejestratora, żeby nie trafiać do spamu). Adres do powiadomień o wnioskach trenerów jest już ustawiony (`OWNER_NOTIFY_EMAIL`). Wyślij sobie próbne zaproszenie. | 1–2 h | od 0 zł (skrzynka z hasłem aplikacji) do kilkunastu zł/mies. |
| 7 | **Prawnik** | Daj prawnikowi trzy szkielety z `lib/survey-config/src/legal.ts` (polityka prywatności, regulamin, zgoda na dane o zdrowiu) i pytania z końca `docs/BEZPIECZENSTWO-BETA.md` (pkt 11). Po uzupełnieniu podnieś `HEALTH_CONSENT_VERSION`. Do tego czasu zaproś wyłącznie osoby, które znasz i uprzedzisz, że to wersja próbna. | zwykle kilka dni | zwykle jednorazowo od kilkuset do kilku tysięcy zł |
| 8 | **Repozytorium prywatne** | W GitHub ustaw repozytorium `trainer-panel` jako prywatne (Settings → Danger zone → Change visibility). Sprawdź, że `.env` nie jest w repozytorium: `git ls-files | grep -i "^\.env"` ma nic nie zwrócić. | 10 min | 0 (prywatne repozytoria są darmowe) |
| 9 | **Kopie bazy poza maszyną** | Co tydzień pobieraj najnowszy plik z `~/backups/` na swój komputer (`gcloud compute scp …`) albo poproś mnie o skrypt. Raz zrób test przywrócenia: `scripts/backup-restore-test.sh`. | 20 min jednorazowo + 5 min/tydz. | 0 |
| 10 | **Usunięcie kont demo i danych testowych** | Skrypt `scripts/usun-konta-demo.sh` domyślnie tylko POKAZUJE, co usunie. Przejrzyj listę, zrób kopię bazy i dopiero wtedy uruchom z potwierdzeniem. Wiele kont testowych ma w nazwie `+clerk_test@example.com` albo „Fikstury testów”. Usuwanie danych robisz Ty — ja tego nie uruchamiam. | 20 min | 0 |

## Zaproszenie pierwszych osób
| # | Co | Jak | Czas |
|---|---|---|---|
| 11 | **Własne konto trenera i test od końca do końca** | Zaloguj się na produkcji, utwórz klienta testowego (swój drugi adres e-mail), wyślij zaproszenie, wypełnij wywiad jako klient, ułóż plan, aktywuj, zrób jeden trening w portalu. Uruchom `scripts/smoke-gcp.sh` (z `TRAINER_SIGNUP_OPEN=1` tylko na czas testu, potem wyłącz). | 1 h |
| 12 | **Zaproś 3–5 podopiecznych** | Osoby, które znasz. Dla każdej: „Zaproś klienta” → link (SMS/WhatsApp) albo link/kod do dołączenia z Ustawień. Powiedz im wprost, że to beta i że mogą zgłaszać uwagi. Na Freemium masz limit 3 klientów — pakiet możesz zmienić w panelu administratora (to Twoja decyzja). | 1–2 h |
| 13 | **Codzienny rzut oka przez 2 tygodnie** | Panel administratora → zakładka „Błędy” (czy są nowe), „Wymaga uwagi” na Pulpicie, `~/logs/backup-db.log` (czy kopia się zrobiła). | 5 min dziennie |

## Co celowo zostaje wyłączone na betę
`SOLO_ENABLED` i `CONDITIONING_ENABLED` — czekają na ekrany (Solo, kondycja). Nie włączaj ich bez mojej wiadomości, bo ekranów jeszcze nie ma.

## Orientacyjny koszt miesięczny na starcie
Maszyna GCP (już płacisz) + domena (kilka zł/mies.) + ewentualna skrzynka pocztowa; Clerk i HTTPS zwykle 0 na tym etapie. Jednorazowo prawnik.
