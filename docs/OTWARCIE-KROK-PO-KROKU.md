# Otwarcie aplikacji na świat — krok po kroku (dla właściciela)

**Nic z tego nie zostało uruchomione.** Kroki 1–4 robisz Ty w konsolach (kosztują / zmieniają chmurę — wymagają Twojej zgody). Kroki 5–9 to gotowe pliki i skrypty w repozytorium. Szczegóły i koszty: `docs/WDROZENIE-PLAN.md`.

## Przed otwarciem (30 minut)
- [ ] `docs/BEZPIECZENSTWO-BETA.md`, sekcja 10 (lista kontrolna) — wszystko odhaczone.
- [ ] Świeża kopia bazy: `scripts/backup-db.sh`; test przywrócenia: `scripts/backup-restore-test.sh`.
- [ ] Flagi w `.env.production` według `docs/DO-DECYZJI.md` (domyślnie wyłączone: `EXERCISE_ANIMATIONS_ENABLED`, wszystko, czego nie zatwierdziłeś).

## Kroki
1. **Domena** (ok. 50–100 zł/rok). U rejestratora kup np. `twojadomena.pl`. Panel będzie pod `panel.twojadomena.pl`. *(Zgoda: zakup.)*
2. **Stały adres IP** (Google Cloud → VPC → Adresy IP → „Zarezerwuj statyczny adres zewnętrzny”, przypisz do maszyny; kilka zł/mies.). W DNS dodaj rekord **A**: `panel` → ten adres. *(Zgoda: koszt.)*
3. **Zapora** (VPC → Reguły zapory): zezwól TCP **80 i 443** z `0.0.0.0/0` tylko dla tej maszyny. **Nigdy** nie otwieraj 8080, 23889, 22347 ani 5432. *(Zgoda: zmiana w chmurze.)*
4. **Clerk produkcyjny**: w panelu Clerk „Create production instance”, dodaj domenę, wpisz u rejestratora rekordy CNAME, które poda Clerk. Włącz logowanie Google. Klucze (publishable + secret) wpisz **tylko** do `.env.production` (wg `deploy/env.production.example`, `chmod 600`). Nowe ID administratorów wpisz do `APP_ADMIN_CLERK_IDS`.
5. **Poczta**: konto SMTP (np. Brevo/Resend), w DNS: SPF, DKIM, DMARC. Dane do `SMTP_*` w `.env.production`.
6. **Zatrzymaj tryb deweloperski** (zajmuje port 8080): `scripts/stop-gcp.sh`.
7. **Podgląd instalacji** (nic nie wykonuje): `scripts/otwarcie-instalacja.sh panel.twojadomena.pl`.
8. **Instalacja** (Caddy + usługa API; certyfikat Let’s Encrypt sam): `scripts/otwarcie-instalacja.sh --apply panel.twojadomena.pl`. Skrypt sam sprawdzi, czy DNS wskazuje maszynę.
9. **Test z zewnątrz**: `scripts/smoke-public.sh https://panel.twojadomena.pl` (HTTPS, nagłówki, trasy chronione, zamknięte porty, certyfikat) → wszystko „OK”. Potem lista **„Test jako Bartek”** (`docs/TEST-JAKO-BARTEK.md`) na prawdziwym telefonie.
10. **Monitor dostępności**: darmowy UptimeRobot na `https://panel.twojadomena.pl/api/healthz` co 5 min (powiadomienie e-mail). Watchdog z maszyny nie ostrzeże, gdy maszyna jest wyłączona.
11. **CSP**: po czystym przebiegu z kroku 9 zmień w Caddyfile `Content-Security-Policy-Report-Only` na `Content-Security-Policy` (i ustaw `CSP_ENFORCE=1`).

## Wycofanie (jeśli coś nie gra)
`sudo systemctl stop caddy trainer-api` → `scripts/dev-gcp.sh`. Dane w bazie nie są ruszane. Reguły zapory 80/443 możesz usunąć w konsoli (zamyka dostęp z zewnątrz).

## Zwykłe aktualizacje po otwarciu
`git pull` → `scripts/backup-db.sh` → `scripts/db-setup-gcp.sh` (migracje, tylko addytywne) → `pnpm run build` → `sudo systemctl restart trainer-api` → `scripts/smoke-public.sh`.
