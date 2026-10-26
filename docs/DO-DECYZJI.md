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
