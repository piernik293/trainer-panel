# Raport dla właściciela (27.10.2026)

Nic nie zostało scalone do `main`. Każda gałąź przeszła pełną weryfikację (testy API, bezpieczeństwo generatora 101, panel, portal, typecheck, build, smoke 131/0).

## Część 1 (generator, konta, administrator) — gotowe
- `feature/generator-priorytety` — wykluczenie dokładnej pozycji; „Generuj od nowa” różni się od poprzedniego planu; „Zamień na inne” bez powtórek; ostrzeżenie „zalecany zakres” dla Ś/Z (BA/P nadal blokada); długość cyklu wg poziomu (BA/P 8–12, Ś 6–8, Z 4–6); cele rozgrzewek (0037); zakładka „Rozgrzewka i rozciąganie” w katalogu.
- `feature/konta-link-kod` — link i kod trenera, prośby [Odrzuć]/[Akceptuj], odłączenie przez każdą ze stron, konta bez trenera („wkrótce”), limit prób kodu (0038).
- `feature/panel-admin` — panel administratora: błędy, trenerzy, Solo, abonamenty, dziennik dostępu z powodem, blokada konta, brak limitu generatora (0039).
- `feature/wnioski-trenerow` (na bazie panelu) — „Prowadzę podopiecznych”, lista wniosków, przełącznik automatyczny (wyłączony), 14 dni do ponownego wniosku (0040).
- `docs/kondycja-aktualizacja` — `docs/KONDYCJA.md` po Twoich decyzjach.

## Bloki 5 i 7–12 — gotowe (bez ekranów tam, gdzie zaznaczono)
- `feature/beta-przygotowanie` — nagłówki, limity zapytań, kopie bazy (cron), szkielety prawne, zgoda na dane o zdrowiu, pliki wdrożeniowe.
- `feature/pakiety-sesje` → `feature/skrzynka-uwagi` (na bazie pakietów) · `feature/import-excel` · `feature/raport-pdf`.
- `feature/solo` (wyłączone `SOLO_ENABLED`, bez ekranów) · `feature/kondycja` (wyłączone `CONDITIONING_ENABLED`, tylko API).

## Czeka na Twoje „tak” (pełna lista: `docs/DO-DECYZJI.md`, 37 pozycji)
- Interwały dla początkujących: zostały zabronione (17, 33).
- Zgoda na dane o zdrowiu po wycofaniu — co z danymi (3) — do prawnika; teksty prawne to szkielety (6).
- Adres do maili o wnioskach: `OWNER_NOTIFY_EMAIL` w `.env` (35).
- Formularz wniosku w oknie „Moje konto” (34); limit prób kodu w pamięci (25).
- Włączenie Solo i kondycji; uruchomienie `usun-konta-demo.sh` — tylko za Twoją zgodą.
- Niezrobione: ekrany Solo i kondycji; powiadomienie o prośbie o dołączenie w „Wymaga uwagi” (27).

## Proponowana kolejność scalania
1. `feature/beta-przygotowanie` · 2. `feature/generator-priorytety` · 3. `feature/konta-link-kod` · 4. `feature/panel-admin` · 5. `feature/wnioski-trenerow` · 6. `feature/pakiety-sesje` · 7. `feature/skrzynka-uwagi` · 8. `feature/import-excel` · 9. `feature/raport-pdf` · 10. `feature/solo` · 11. `feature/kondycja` · 12. `docs/kondycja-aktualizacja`.
Migracje (0037–0040, 0050–0054) mają różne numery i są już zastosowane w bazach. Spodziewane drobne konflikty tekstowe: `docs/POSTEP-GCP.md`, `docs/DO-DECYZJI.md`, `lib/db/src/schema/trainers.ts`, `routes/index.ts`, `requireAuth.ts` (opis w pozycji 37).
Po scaleniu uruchom `scripts/stop-gcp.sh && scripts/dev-gcp.sh` (API działa ze zbudowanego `dist`).
