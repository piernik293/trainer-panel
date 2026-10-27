# Plan publikacji (beta) — trainer-panel na GCP

Stan: 24.10.2026. **Tylko plan.** Nic z tego nie zostało kupione ani zmienione w Google Cloud. Każdy punkt oznaczony **[ZGODA]** wymaga osobnej zgody właściciela (koszt albo zmiana w chmurze). Ceny są orientacyjne — przed zakupem sprawdź aktualny cennik.

## 0. Punkt wyjścia (sprawdzone na maszynie)

- VM `instance-20261021-155053`, `e2-standard-2` (2 vCPU, 8 GB), `europe-central2-a`, dysk 30 GB (zajęte 37%). Ma zewnętrzny adres IPv4 **efemeryczny** (zmienia się po zatrzymaniu VM). Działa Google Cloud Ops Agent.
- Aplikacja działa w trybie deweloperskim: Vite dev (23889, 22347) + API z `dist` (8080) w tmux, tylko `127.0.0.1`, dostęp tunelem SSH. Porty 80/443 zamknięte.
- Clerk: instancja **development**. Poczta: kod obsługuje SMTP (`SMTP_*`, `ADMIN_EMAIL`), usługa nie jest wybrana.
- Brak: nagłówków bezpieczeństwa, limitów zapytań, automatycznych kopii bazy, monitoringu dostępności, procesu startującego po restarcie maszyny.

## 1. Domena

| Opcja | Koszt orientacyjny | Uwagi |
|---|---|---|
| `.pl` u polskiego rejestratora | pierwszy rok często promocyjnie (kilka–kilkadziesiąt zł), odnowienie zwykle ok. 50–150 zł/rok | sprawdź cenę **odnowienia**, nie tylko pierwszego roku |
| `.com` u rejestratora „po kosztach” (np. Cloudflare Registrar) | ok. 10–12 USD/rok | odnowienie w tej samej cenie |
| subdomena darmowa (np. dostawcy DNS) | 0 zł | nie nadaje się dla Clerk produkcyjnego i maili z własnej domeny |

Rekomendacja: jedna domena, np. `panel.<domena>` (panel trenera) i ta sama domena dla portalu klienta pod `/client-landing/` — tak jak dziś (jeden adres, jak w Replit). **[ZGODA: zakup domeny]**

DNS: rekord A → zewnętrzny IP VM; rekordy Clerk (CNAME) i poczty (SPF, DKIM, DMARC) — patrz niżej.

## 2. Adres IP i porty (Google Cloud)

- **[ZGODA: koszt]** Zarezerwować statyczny zewnętrzny IP dla VM (efemeryczny zmienia się po zatrzymaniu). Google nalicza opłatę za używany zewnętrzny IPv4 (orientacyjnie kilka USD/mies.) — VM i tak ma dziś taki adres, rezerwacja go utrwala.
- **[ZGODA: zmiana w chmurze]** Reguła zapory: TCP 80 i 443 z internetu tylko do tej VM (tag sieciowy). SSH (22) bez zmian; port 8080, 23889, 22347, 5432 **nigdy** nie otwierać.

## 3. HTTPS — Caddy na tej maszynie

- Caddy (pakiet z repozytorium dystrybucji / oficjalne repo Caddy) jako jedyny proces na 80/443; certyfikat Let's Encrypt automatycznie i bezpłatnie, odnowienie automatyczne. **[ZGODA: instalacja nowej usługi na VM]**
- Tryb produkcyjny zamiast Vite dev: `pnpm run build`, Caddy serwuje statycznie `artifacts/trainer-app/dist/public` (`/`) i `artifacts/client-landing/dist/public` (`/client-landing/`) z fallbackiem SPA, a `/api/*` przekazuje do `127.0.0.1:8080`.
- API w produkcji wymaga: `NODE_ENV=production`, `CLERK_PUBLISHABLE_KEY`, `TRAINER_APP_ORIGIN`, `CLIENT_PORTAL_ORIGIN` (`https://panel.<domena>`), inaczej nie wystartuje (kod tego pilnuje).
- Start po restarcie maszyny: jednostki systemd (`trainer-api.service`, `caddy.service`) z `Restart=on-failure` i `EnvironmentFile=` wskazującym `.env` (uprawnienia 600). Bez PM2 i bez nowych bibliotek.

Szkic `Caddyfile` (do dopracowania przy wdrożeniu):

```
panel.<domena> {
  encode zstd gzip
  handle /api/* {
    reverse_proxy 127.0.0.1:8080
  }
  handle_path /client-landing/* {
    root * /home/<użytkownik>/trainer-panel/artifacts/client-landing/dist/public
    try_files {path} /index.html
    file_server
  }
  handle {
    root * /home/<użytkownik>/trainer-panel/artifacts/trainer-app/dist/public
    try_files {path} /index.html
    file_server
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    X-Frame-Options "DENY"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
}
```

## 4. Clerk produkcyjny

- Utworzyć instancję **production** w tej samej aplikacji Clerk (darmowy plan wystarcza na betę — limit aktywnych użytkowników sprawdzić w aktualnym cenniku). **[ZGODA: konto/plan Clerk]**
- Wymaga własnej domeny: rekordy DNS podane przez Clerk (CNAME dla frontend API i poczty Clerk).
- Nowe klucze (`pk_live_…`, `sk_live_…`) tylko w `.env` na serwerze; `VITE_CLERK_PUBLISHABLE_KEY` ustawiany przy buildzie frontendów.
- Opcjonalnie proxy Clerk przez naszą domenę (`/api/__clerk`, już jest w kodzie; `VITE_CLERK_PROXY_URL`).
- Role: `APP_ADMIN_CLERK_IDS`, `CATALOGUE_ADMIN_CLERK_IDS` — **nowe** identyfikatory użytkowników z instancji production (dev ID nie przechodzą).
- Konta: logowanie e-mailem; włączyć weryfikację e-maila; rozważyć wyłączenie samodzielnej rejestracji trenerów w becie (lista zaproszonych).

## 5. Poczta (zaproszenia, powiadomienia)

| Usługa | Darmowy próg (orientacyjnie, sprawdzić) | Uwagi |
|---|---|---|
| Brevo | ok. 300 e-maili / dzień | SMTP — pasuje do obecnego kodu bez zmian |
| Resend | ok. 3 000 / miesiąc (limit dzienny) | SMTP lub API; prosta konfiguracja domeny |
| Amazon SES | płatne od pierwszego e-maila, bardzo tanio (ułamki USD / 1000) | wymaga konta AWS i wyjścia z trybu sandbox |

Rekomendacja na betę: Brevo albo Resend przez SMTP (zero zmian w kodzie — tylko `SMTP_HOST/PORT/USER/PASS`, `SMTP_FROM`). DNS: SPF, DKIM, DMARC dla domeny nadawcy. **[ZGODA: konto w usłudze pocztowej]**

## 6. Kopie bazy (automatyczne)

- Codziennie `pg_dump` (format custom, kompresja) do `~/backups/auto/` przez systemd timer; rotacja: 14 dziennych + 8 tygodniowych. Bez kosztów.
- Kopia **poza maszyną** (awaria dysku / usunięcie VM): **[ZGODA: koszt]** do wyboru
  - harmonogram migawek dysku VM w GCP (snapshot schedule; płatne za zajęte miejsce migawek, orientacyjnie kilka USD/mies. przy tym rozmiarze), albo
  - zasobnik Cloud Storage w tym samym regionie z regułą usuwania starych plików (orientacyjnie grosze–kilka zł/mies. przy tej wielkości bazy).
- Raz w miesiącu test odtworzenia na bazie tymczasowej (skrypt + wpis do dziennika).

## 7. Monitoring

- Dostępność: zewnętrzny monitor `GET https://panel.<domena>/api/healthz` co 5 min z powiadomieniem e-mail — darmowy plan np. UptimeRobot albo Cloud Monitoring uptime check (w ramach darmowego limitu GCP — sprawdzić). **[ZGODA: konto / konfiguracja w chmurze]**
- Zasoby: Ops Agent już działa — alerty na dysk > 80%, RAM, restart usługi (Cloud Monitoring, w darmowym limicie — sprawdzić). **[ZGODA: konfiguracja w chmurze]**
- Logi: journald (systemd) z limitem rozmiaru; API loguje bez danych osobowych (już tak jest — logger nie zapisuje treści żądań).

## 8. Nagłówki bezpieczeństwa

- Ustawiane w Caddy (sekcja 3): HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- Content-Security-Policy: osobny krok po teście — musi dopuścić domeny Clerk (skrypty, ramki, połączenia) i nic więcej; najpierw tryb `Content-Security-Policy-Report-Only`.
- Ciasteczka sesji: obsługuje Clerk (Secure, HttpOnly w produkcji).

## 9. Limity zapytań

- Najbardziej narażone: publiczne endpointy bez logowania (ankieta z tokenem zaproszenia, formularze publiczne), logowanie (chroni Clerk).
- Wariant bez nowych bibliotek: mały middleware w API (licznik w pamięci per IP, okno czasowe, 429 z polskim komunikatem) na `/api/public/*` i trasy z tokenem zaproszenia. Wystarczy przy jednej instancji API.
- Wariant z biblioteką (`express-rate-limit`) — tylko jeśli wariant własny okaże się niewystarczający (wymaga uzasadnienia, zasada „bez nowych bibliotek”).
- Caddy: limit rozmiaru żądania (`request_body max_size`), timeouty. Moduł rate-limit Caddy wymaga własnej kompilacji — nie polecam na betę.
- SSH: tylko klucze, `fail2ban` opcjonalnie.

## 10. Usunięcie kont i danych demo

- Baza produkcyjna = **nowa, pusta** baza (`scripts/db-setup-gcp.sh` + seed katalogu przy starcie API). Nie kopiujemy bazy deweloperskiej (klienci testowi, „Plan demo”, zgłoszenia testowe).
- Clerk production startuje bez użytkowników — konta testowe `…+clerk_test@example.com` istnieją tylko w instancji development.
- Przegląd kodu pod kątem kont/danych demo (np. specjalne traktowanie konkretnych adresów e-mail, limity „bez ograniczeń”) i przeniesienie ich do zmiennych środowiskowych albo usunięcie. **[ZGODA: usunięcie funkcji, jeśli dotyczy]**
- `.env` produkcyjny osobno od deweloperskiego (inne klucze Clerk, inna baza, inne SMTP).

## 11. Strony prawne — tylko miejsca na teksty

Bez porad prawnych; treści przygotowuje właściciel (lub prawnik).

- `/polityka-prywatnosci` — miejsce na tekst; link w stopce panelu i portalu klienta.
- `/regulamin` — miejsce na tekst; link przy rejestracji trenera.
- Zgoda na przetwarzanie danych o zdrowiu — w wywiadzie klienta przed pytaniami o zdrowie: pole wyboru (niezaznaczone domyślnie) + miejsce na treść zgody; zapis daty i wersji zgody; bez zgody — pytania o zdrowie pominięte. **[ZGODA: zmiana widoczna dla klienta + nowa kolumna w bazie]**
- Miejsce na dane administratora i kontakt w sprawie danych.

## 12. Lista kontrolna przed startem bety

- [ ] Domena kupiona, DNS: A, Clerk CNAME, SPF/DKIM/DMARC.
- [ ] Statyczny IP, zapora 80/443; 8080/23889/22347/5432 zamknięte (sprawdzone skanem z zewnątrz).
- [ ] Caddy z ważnym certyfikatem; HTTP → HTTPS; nagłówki widoczne w odpowiedzi.
- [ ] Build produkcyjny frontendów; API z `NODE_ENV=production`; systemd startuje wszystko po restarcie VM (test restartu).
- [ ] Clerk production: klucze w `.env`, domena zweryfikowana, adminowie z nowymi ID.
- [ ] Poczta: test zaproszenia do ankiety na zewnętrzną skrzynkę (nie spam).
- [ ] Nowa pusta baza produkcyjna; `pg_dump` dzienny działa; kopia poza maszyną; test odtworzenia wykonany.
- [ ] Monitor dostępności i alerty zasobów działają (test: zatrzymanie API → powiadomienie).
- [ ] Limity zapytań na publicznych endpointach (test: seria żądań → 429).
- [ ] Brak danych i kont demo w produkcji; `.env` produkcyjny nie w repo; brak sekretów w logach.
- [ ] Polityka prywatności, regulamin, zgoda na dane o zdrowiu — teksty wstawione przez właściciela.
- [ ] Pełne testy, typecheck, build, test dymny na gałęzi wdrażanej; testy bezpieczeństwa generatora zielone.
- [ ] Plan wycofania: poprzedni build + kopia bazy sprzed wdrożenia.

## Koszty — podsumowanie (każdy do osobnej zgody)

| Pozycja | Orientacyjnie | Konieczne na betę? |
|---|---|---|
| VM e2-standard-2 (już działa) | kilkadziesiąt USD/mies. (sprawdzić rachunek GCP) | tak — już ponoszone |
| Statyczny zewnętrzny IP | kilka USD/mies. | tak |
| Domena | 10–150 zł/rok (zależnie od końcówki i rejestratora) | tak |
| Clerk production | 0 zł w darmowym planie | tak |
| Poczta (Brevo / Resend) | 0 zł w darmowym progu | tak |
| Kopia poza maszyną (migawki lub Cloud Storage) | od groszy do kilku USD/mies. | zalecane |
| Monitoring (UptimeRobot / Cloud Monitoring) | 0 zł w darmowych limitach | zalecane |


## 13. Przygotowane pliki i kroki (stan 26.10.2026) — NIC z tego nie zostało uruchomione

Zrobione w kodzie (bez kosztów, działa już teraz): nagłówki bezpieczeństwa API i front-endów (`middlewares/securityHeaders.ts`, `scripts/security-headers.mjs`; HSTS tylko przy `HSTS_ENABLED=1`, CSP w trybie „tylko raport” dopóki `CSP_ENFORCE≠1`), limity zapytań (`middlewares/rateLimit.ts`: linki z tokenem 30/min, profil po logowaniu 20/min, generator 120/min na użytkownika, kody trenera 10 prób/15 min — gotowe do użycia przy kodach), kopie bazy (`scripts/backup-db.sh` + cron 03:15, rotacja 14 dni, test `scripts/backup-restore-test.sh`), szkielety stron prawnych (`/legal/...`), zgoda na dane o zdrowiu w wywiadzie.

Gotowe pliki (szablony w `deploy/`): `Caddyfile.example`, `trainer-api.service.example`, `env.production.example`; skrypt `scripts/usun-konta-demo.sh` (domyślnie tylko podgląd).

Kroki dla właściciela, w kolejności (przy każdym: koszt i co kliknąć/wpisać):
1. **Domena** — kup u dowolnego rejestratora. Koszt: ok. 50–100 zł/rok. Wpisz: domenę (np. panel.twojadomena.pl) i nic poza tym; DNS poniżej.
2. **Stały adres IP** w Google Cloud („Zarezerwuj statyczny adres zewnętrzny”). Koszt: kilka zł/mies. Klikasz: VPC → Adresy IP → Zarezerwuj; przypisz do maszyny. Potem w DNS dodaj rekord A: panel → ten adres.
3. **Porty 80 i 443** — reguła zapory (VPC → Reguły zapory): zezwól TCP 80,443 z 0.0.0.0/0 dla tej maszyny. Koszt: 0. (Port 8080 i inne zostają zamknięte.)
4. **Caddy** — instalacja z oficjalnego repozytorium Caddy (3 polecenia z instrukcji Caddy dla Debiana), plik `deploy/Caddyfile.example` → `/etc/caddy/Caddyfile` z Twoją domeną. Koszt: 0. Certyfikat Let’s Encrypt odnawia się sam.
5. **Clerk produkcyjny** — w panelu Clerk: Create production instance, dodaj domenę, Clerk poda rekordy CNAME do wpisania w DNS i klucze (publishable + secret). Koszt: darmowy próg (sprawdź aktualny cennik). Wpisujesz klucze TYLKO do `.env.production` (szablon: `deploy/env.production.example`). W Clerk włącz logowanie Google (własne dane OAuth z Google Cloud → Credentials, domena w „Authorized origins”).
6. **Poczta** — usługa z darmowym progiem (np. Brevo lub Resend); weryfikacja domeny (SPF, DKIM, DMARC — usługa poda rekordy TXT do DNS). Koszt: 0 w progu; wpisujesz dane SMTP w `.env.production`.
7. **Baza produkcyjna** — nowa, pusta: `createdb trainer_panel_prod`, potem `DATABASE_URL=… scripts/db-setup-gcp.sh`; dane deweloperskie NIE są kopiowane (więc konta demo nie przechodzą).
8. **Usługi** — `deploy/trainer-api.service.example` → `/etc/systemd/system/trainer-api.service`; `pnpm run build`; `systemctl enable --now trainer-api caddy`. Koszt: 0.
9. **Po pierwszym czystym przebiegu** — ustaw `CSP_ENFORCE=1` i w Caddyfile zmień `Content-Security-Policy-Report-Only` na `Content-Security-Policy`.
10. **Kopia poza maszyną** (sekcja 6) i **monitoring** (sekcja 7) — decyzje kosztowe osobno.
11. **Konta demo** — `DEMO_TRAINER_CLERK_IDS=… scripts/usun-konta-demo.sh` pokaże, co zniknie; usunięcie dopiero z `--wykonaj` i `POTWIERDZAM=USUN`, po Twojej zgodzie. Konta w Clerk usuwasz ręcznie w panelu.
12. **Prawnik** — uzupełnia treści trzech dokumentów (wskazane w kodzie jako „DO UZUPEŁNIENIA PRZEZ PRAWNIKA”: `lib/survey-config/src/legal.ts`); po zmianie zgody zmień `HEALTH_CONSENT_VERSION`.
