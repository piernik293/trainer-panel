# Do decyzji właściciela

Zbierane w trakcie pracy bez właściciela (26.10.2026). Przy każdej pozycji: co wybrałem (bezpieczniejsza opcja), gałąź.

## Blok 5 — przygotowanie do bety (`feature/beta-przygotowanie`)
1. **Test przywrócenia kopii** robię w schemacie `restore_check` bazy `trainer_panel_test`, nie na całej bazie testowej (użytkownik bazy nie ma prawa CREATE DATABASE, a nadpisanie bazy testowej mogłoby przeszkadzać testom). Czy wolisz osobną bazę (wymaga nadania uprawnienia CREATEDB w PostgreSQL)?
2. **Nagłówek CSP front-endów** wysyłam w trybie „tylko raport” (`Content-Security-Policy-Report-Only`), bo zbyt ostra polityka zepsułaby logowanie Clerk. Włączenie wymusza `CSP_ENFORCE=1` po czystym przebiegu na HTTPS.
3. **Zgoda na dane o zdrowiu — co z danymi po wycofaniu?** Wycofanie przełącza generator na najostrożniejsze ustawienia i oznacza wywiad jako „wycofana”, ale zapisanych odpowiedzi i zgłoszeń bólu NIE usuwa (usunięcie danych to osobna prośba — STOP-6). Zgłoszenia bólu z aplikacji nadal wykluczają ćwiczenia (bezpieczeństwo). Do prawnika: czy to wystarczy, czy wycofanie ma od razu kasować odpowiedzi.
4. **Najostrożniejsze ustawienia bez zgody** = bez ćwiczeń o „wysokim” obciążeniu stawów + ostrzeżenie dla trenera. Czy dodać coś jeszcze (np. tylko poziom nie wyższy niż początkujący)?
5. Wywiady wprowadzone ręcznie przez trenera (w panelu) i starsze wywiady mają status zgody NULL — zachowanie bez zmian (bez ostrożnych ustawień). Czy trener ma przy ręcznym wywiadzie potwierdzać zgodę podopiecznego?
6. Teksty zgody i dokumenty prawne to szkielety („DO UZUPEŁNIENIA PRZEZ PRAWNIKA”), wersja zgody `szkielet-1`.
7. Cron kopii bazy wywołuje skrypt z `~/trainer-panel` lub (do czasu scalenia) z `~/tp-a1` — po scaleniu bloku 5 do `main` wystarczy `~/trainer-panel`.

## Blok 7 — pakiety i sesje (`feature/pakiety-sesje`)
8. Klient w portalu widzi tylko liczbę pozostałych sesji i datę ważności — nigdy ceny. Czy tak zostaje?
9. Ostrzeżenie „kończy się pakiet”: przy ≤ 2 sesjach lub 7 dniach do końca ważności. Czy progi pasują?

## Blok 8 — skrzynka uwag (`feature/skrzynka-uwagi`, zbudowana na gałęzi bloku 7)
10. Powód „prośba o dołączenie” (z bloku 2) nie jest podpięty — czeka na konta/kody od drugiej sesji (jest gotowy punkt zaczepienia `extraItems`).

## Blok 9 — import z pliku (`feature/import-excel`)
11. Własny czytnik .xlsx (bez nowej biblioteki). Limity: 2 MB, 1500 wierszy, 30 kolumn. Ćwiczenia własne z importu są prywatne i liczą się do limitu pakietu.
12. Wybór szablonu planu w ekranie importu — dopiero w kolejnej wersji (API gotowe).

## Blok 10 — raport PDF (`feature/raport-pdf`)
13. Do PDF wbudowana czcionka Manrope (licencja OFL, opis w `docs/ASSETS.md`). Szczegóły bólu w raporcie tylko po zaznaczeniu przez trenera; domyślnie sama liczba zgłoszeń.

## Blok 11 — Solo (`feature/solo`, wyłączone: `SOLO_ENABLED`)
14. Tylko ćwiczenia zweryfikowane przez trenera, na każdym poziomie. Pliometria i podnoszenie olimpijskie tylko po odpowiedzi „Tak” o skokach i od poziomu Ś. Po zgłoszeniu bólu 90 dni wyłączenia ćwiczeń.
15. Brak cotygodniowego check-inu dla Solo (nikt go nie czyta).
16. Nie ma jeszcze ekranów Solo ani generowania planu po stronie serwera — zależą od modelu kont z bloku 2 (druga sesja).

## Blok 12 — kondycja (`feature/kondycja`, wyłączone: `CONDITIONING_ENABLED`)
17. **Tabela celów mówi o „łagodnych interwałach” dla początkujących, ale reguła bezpieczeństwa zabrania interwałów.** Wybrałem bezpieczniej: brak aktywności i początkujący — tylko marszobieg i bieg ciągły. Czy tak ma zostać?
18. Brak ekranów (panel, portal) — czeka na decyzję o menu/UX (poza zakresem tego zadania).
19. Po zgłoszeniu bólu portal pokazuje bezpieczniejszy sprzęt (np. rower zamiast biegu); gdy żaden nie pasuje — komunikat zamiast jednostki.

## Nie zrobione
20. Blok 6 (wnioski trenerów) — wymaga gałęzi `feature/panel-admin` drugiej sesji, której nie było na GitHubie. Do zrobienia po jej wypchnięciu.
21. Skrypt `scripts/usun-konta-demo.sh` jest napisany, ale NIE uruchomiony (pokazuje tylko podgląd).
