# Stan przed betą (28.10.2026, noc) — tylko opis, nic nie usunięto ani nie scalono

## 1. Punkty z `docs/BETA-START.md`

| # | Co | Stan | Czas / koszt (orient., sprawdź cenniki) |
|---|---|---|---|
| 1 | Zatwierdzenie scalenia gałęzi QA | **czeka na Ciebie** — od tamtej listy powstały nowe gałęzie (sekcja 3); kolejność i ryzyka: `docs/SCALANIE-PLAN.md` | 1–2 h czytania |
| 2 | Domena | **czeka na Ciebie** | 20 min + DNS; ok. 30–100 zł/rok |
| 3 | Stały IP i porty 80/443 | **czeka na Ciebie** (konsola GCP) | 20 min; zwykle 0 |
| 4 | HTTPS (Caddy) | **czeka na Ciebie** (gotowy wzór `deploy/Caddyfile.example`) | 45–90 min; 0 |
| 5 | Clerk produkcyjny | **czeka na Ciebie** (nowe klucze; dziś instancja deweloperska) | 30–60 min; zwykle 0 na start |
| 6 | Maile | **częściowo gotowe:** SMTP i `OWNER_NOTIFY_EMAIL` są w `.env`, logowanie do skrzynki sprawdzone tej nocy (bez wysyłki). Czeka: nadawca na własnej domenie (SPF/DKIM) | 30–60 min; skrzynka/domena |
| 7 | Prawnik (polityka, regulamin, zgoda) | **czeka na Ciebie** | jednorazowo; koszt zależny od prawnika |
| 8 | Repozytorium prywatne | **czeka na Ciebie** | 10 min; 0 |
| 9 | Kopie poza maszyną | **częściowo gotowe:** kopia dzienna działa (28.10 03:15, 180 KB), test przywrócenia OK; **brak kopii z 27.10, bo maszyna była wyłączona o 03:15** (`docs/DO-DECYZJI.md` N5-2). Czeka: kopiowanie poza maszynę | 20 min + 5 min/tydz. |
| 10 | Usunięcie kont demo i danych testowych | **skrypt gotowy** (`scripts/usun-konta-demo.sh`, domyślnie tylko pokazuje); czeka na Ciebie | 30 min |
| 11 | Własne konto trenera i test od końca do końca | **czeka na Ciebie** po punktach 1–8; scenariusz sprawdzony tej nocy na bazie QA (`docs/PIERWSZE-MINUTY.md`) | 1 h |
| 12 | Zaproszenie 3–5 osób | **czeka na Ciebie** | — |
| 13 | Codzienny rzut oka (2 tyg.) | **czeka na Ciebie**; pomoże straż (`ops/monitoring`) po włączeniu w cronie | 5 min dziennie |

**Nowa przeszkoda do rozstrzygnięcia przed zaproszeniem trenerów:** nowe konto trenera nie ma drogi do dostępu (ekran „To konto nie ma jeszcze dostępu trenera…” bez adresu i przycisku) — `docs/PIERWSZE-MINUTY.md`, przeszkoda 1; decyzja N3-2.

## 2. Konta i dane testowe do usunięcia (NIE usunięto)

- **Baza aplikacji:** 10 trenerów i 34 klientów; ok. 26 klientów ma adresy testowe (`@example.com`, m.in. `qa-…`, `block…`), ich plany, wywiady i treningi też są testowe. Konkretną listę pokaże `scripts/usun-konta-demo.sh` (bez zmian, tryb podglądu). Konta trenerów demo podaje się w `DEMO_TRAINER_CLERK_IDS`.
- **Clerk (instancja deweloperska):** konta `…+clerk_test@example.com` z wcześniejszych przeglądów oraz z tej nocy: `qaB3Admin`, `qaB3Trener`, `qaB3Trener2`, `qaB3Trener1440`, `qaB3Podopieczny`, `qaB3Klient375`, `qaB3Klient1440`. Po przejściu na Clerk produkcyjny znikną razem z instancją deweloperską.
- **Baza testowa `trainer_panel_test`:** schematy `public` (testy), `sim` (kopia katalogu do symulacji) i `qa` (kopia bazy aplikacji z tej nocy, z kontami QA). Do skasowania po bety: `DROP SCHEMA qa CASCADE` i `sim` — **dopiero na Twoje polecenie**.
- **Pliki:** zrzuty w `docs/screens/` (ok. 36 MB, w repozytorium), kopie ręczne `~/backups/*przed_*` (zostają).

## 3. Gałęzie

**Scalone do `main`:** wszystkie wcześniejsze gałęzie QA, katalogu i stawów (m.in. `qa/przeglad-bety`, `qa/bezpieczenstwo`, `qa/generator-symulacja`, `fix/po-qa`, `fix/qa-drobne`, `fix/trudnosc-ba-p`, `fix/stawy-uzupelnienie`, `fix/stawy-poprawki`, `feature/katalog-decyzje-wlasciciela`, `fix/tmux-izolacja` i starsze funkcje).

**Niescalone (nic nie usuwano):**

| Gałąź | Co to | Flaga / migracja | Uwagi |
|---|---|---|---|
| `docs/grafiki-cwiczen` | lista top 50 ćwiczeń z symulacji | — | bezpieczna |
| `feature/opisy-top100` | poprawione opisy 140 ćwiczeń | migracja 0061 (zmienia dane; z kopią i cofnięciem) | **tylko po akceptacji `docs/OPISY-TOP100.csv`** |
| `qa/pierwsze-minuty` | raport pierwszych minut + 3 poprawki | — | mały konflikt tekstów wywiadu z gałęzią osiągnięć |
| `feature/zglos-uwage` | „Zgłoś uwagę” + zakładka „Uwagi” | `FEEDBACK_ENABLED`, migracja 0062 | decyzje N4-1…N4-5 |
| `ops/monitoring` | straż + łagodniejszy test przywracania | — (cron do włączenia po zgodzie) | N5-1…N5-3 |
| `feature/kalistenika` | styl kalistenika | `CALISTHENICS_ENABLED` | zaktualizowana o `main` |
| `feature/osiagniecia` | osiągnięcia, serie, przerwy | `ACHIEVEMENTS_ENABLED`, migracja 0056 | zaktualizowana o `main` |
| `feature/solo-ekrany` | ekrany Solo, „Postępy” (zawiera osiągnięcia) | `SOLO_ENABLED`, `ACHIEVEMENTS_ENABLED`, `CONDITIONING_ENABLED` | zaktualizowana o `main` |
| `docs/scalanie-plan`, `docs/strona-trenerzy`, `docs/przed-beta-stan` | dokumenty i szkic strony | — | bezpieczne |
| `docs/przeglad-katalogu`, `feature/progresja`, `test/wszystko`, `test/wszystko-2`, `backup/migracja-gcp-przed-zmiana-autora` | starsze/robocze | — | zostają jako archiwum |

## 4. Flagi (stan w `.env`: wszystkie puste = wyłączone) i rekomendacja na start bety

| Flaga | Teraz | Rekomendacja na start bety |
|---|---|---|
| `FEEDBACK_ENABLED` | wyłączona (kod jeszcze niescalony) | **włączyć** po scaleniu — najtańszy sposób zbierania uwag |
| `ACHIEVEMENTS_ENABLED` | wyłączona | zostawić wyłączoną pierwszy tydzień, potem włączyć po teście na jednej osobie |
| `CALISTHENICS_ENABLED` | wyłączona | zostawić wyłączoną; włączać tylko dla trenera, który o to poprosi |
| `SOLO_ENABLED`, `CONDITIONING_ENABLED` | wyłączone | zostawić wyłączone (osobne decyzje po becie) |
| `TRAINER_SIGNUP_OPEN` | puste | **zostawić puste** (konta trenerów zakłada właściciel; patrz N3-2) |
| `HSTS_ENABLED`, `TRUST_PROXY`, `CSP_ENFORCE` | po wdrożeniu HTTPS | według `docs/BETA-START.md` pkt 4 |

## 5. Otwarte pozycje w `docs/DO-DECYZJI.md`

- **Z tej nocy:** N3-1…N3-5 (wywiad trenera, droga do dostępu trenera, polskie logowanie panelu, plank w czasie, limity Free), N4-1…N4-5 (uwagi: włączenie, słowa zdrowotne, kontakt zwrotny, limit, mail), N5-1…N5-3 (cron straży, maszyna bywa wyłączona, test kopii).
- **Starsze, bez zapisanej odpowiedzi** (według przeglądu pliku — sprawdź przy czytaniu): dwa miejsca formularza „Prowadzę podopiecznych”, lista trenerów bez nazwy, dane QA w bazie aplikacji (pkt 2 wyżej), zmiany pakietów kont testowych, cele dotyku < 44 px, konwencja nazw ćwiczeń, za mały katalog dla domu bez sprzętu i osób nieaktywnych, status „do weryfikacji” dla początkujących.
