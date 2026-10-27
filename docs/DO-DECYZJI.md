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
20. (zrobione 27.10.2026 — blok 6 jest na `feature/wnioski-trenerow`, zob. niżej)
21. Skrypt `scripts/usun-konta-demo.sh` jest napisany, ale NIE uruchomiony (pokazuje tylko podgląd).

## Część 1 (27.10.2026) — wykonana w całości przez tę sesję
Gałęzie z `main`: `feature/generator-priorytety` (0037), `feature/konta-link-kod` (0038), `feature/panel-admin` (0039), `docs/kondycja-aktualizacja`; blok 6 `feature/wnioski-trenerow` jest zbudowany na `feature/panel-admin` (0040).

### Blok 1 — generator
22. Cele rozgrzewek i rozciągania: wszystkie 61 dostało wszystkie 6 celów (są uniwersalne). Plany przed/po bez zmian — wybór rozgrzewek nie czyta celów. Czy któraś rozgrzewka ma być przypisana tylko do wybranych celów?
23. Test `blockDurationRule.test.ts` zmieniłem świadomie na nową regułę długości cyklu (BA/P 8–12, Ś 6–8, Z 4–6). Asercje bezpieczeństwa nie ruszane.
24. „Generuj od nowa” wyklucza ćwiczenia poprzedniego planu klienta; gdy dla miejsca brak innej bezpiecznej opcji, zostaje stare ćwiczenie i trener widzi notatkę.

### Blok 2 — konta
25. Kod trenera ma 10 znaków; limit prób to 10 na 15 minut (konto i IP), liczony w pamięci serwera — po restarcie licznik się zeruje. Czy wystarczy na betę?
26. Odłączenie: osoba zostaje z historią treningów jako konto bez trenera; trener traci dostęp. Maile o odłączeniu wysyłają się tylko przy skonfigurowanej poczce.
27. Brak powiadomienia w „Wymaga uwagi” o nowej prośbie o dołączenie (punkt zaczepienia `extraItems` z bloku 8 jest, ale gałęzie nie są połączone); prośby widać w Ustawieniach.
28. Trening osoby bez trenera (zapis sesji) nie był sprawdzany — ekran to tylko „wkrótce”.

### Blok 3 — panel administratora
29. Użyłem istniejącej zmiennej `APP_ADMIN_CLERK_IDS` (zadanie wspominało `ADMIN_CLERK_IDS`). Nowa zmienna nie jest potrzebna.
30. Dziennik błędów ukrywa w całości opisy zawierające słowa zdrowotne (ból, kontuzja, lek…) — wolę stracić treść niż zapisać dane zdrowotne. Retencja 90 dni (czyszczenie raz na godzinę przy zapisie).
31. Dziennik dostępu jest zabezpieczony wyzwalaczem w bazie (UPDATE/DELETE zablokowane). Konsekwencja: wpisów z testów nie da się usunąć z bazy testowej.
32. Blokada konta trenera działa od razu (403 przy każdym zapytaniu); konta administratora nie da się zablokować.

### Blok 4 — kondycja (dokument)
33. `docs/KONDYCJA.md` zaktualizowany; dalej niejasne: interwały dla P (tabela mówi „łagodne”, reguła bezpieczeństwa zabrania) — zostaje zakaz (zob. 17).

### Blok 6 — wnioski trenerów
34. Formularz „Prowadzę podopiecznych” jest w oknie „Moje konto” w portalu (nie dodawałem nowej zakładki ani nawigacji — to poza zakresem). Czy tam ma zostać?
35. Mail do Ciebie o nowym wniosku wymaga zmiennej `OWNER_NOTIFY_EMAIL` w `.env` (nie ustawiłem — adres jest Twoją decyzją). Bez niej wnioski widać tylko w panelu administratora.
36. Przełącznik „przyjmuj automatycznie” jest wyłączony; włączenie pyta o potwierdzenie.

### Uwagi do scalania
37. Migracje: 0037–0040 (część 1) i 0050–0054 (moje bloki) mają różne numery, więc nie kolidują. Wszystkie są już zastosowane na bazie aplikacji i testowej. Konflikty tekstowe możliwe w: `docs/POSTEP-GCP.md`, `docs/DO-DECYZJI.md`, `lib/db/src/schema/trainers.ts` (kolumny z bloków 2, 3, 5), `routes/index.ts`, `lib/db/src/schema/index.ts`, `requireAuth.ts`.
