# Nowy wygląd portalu (UX v2) — za flagą `UI_V2_ENABLED` (domyślnie wyłączona)

Makiety: `Main/Koniec/Story/Postepy/Ty.dc.html` (od właściciela). Zrzuty 375 px, jasny i ciemny: `docs/screens/ux-v2/` (skrypt `scripts/screens-ux-v2.mjs`, strona podglądu DEV `/ux-v2-preview`, bez Clerk, z atrapą API).
Włączenie: `UI_V2_ENABLED=1` w `.env` + restart API. Wyłączona = portal jak dziś (test `plan-shell-flags.test.tsx`).

## Co jest
- **Dziś** (`components/v2/HomeV2.tsx`): data, „Cześć, <nick/nazwa/imię>!”, awatar → „Ty”; karta serii (tygodnie z rzędu, „X z Y treningów”, Y kółek); ciemna karta treningu (3 ćwiczenia, „+ N ćwiczenia · najpierw rozgrzewka”); dzień odpoczynku; brak planu; następne osiągnięcie z paskiem; linia kroków. Seria 0 → „Zacznij swoją serię”.
- **Koniec treningu** (`FinishV2.tsx`): ✓, 3 kafelki (czas, serie, kg; bez ciężaru → powtórzenia), „Nowy rekord” tylko gdy był i **nie** po zgłoszeniu bólu, „Jak było?”, „Udostępnij na story”, „Gotowe”.
- **Story 9:16** (`lib/v2/story.ts`): PNG 1080×1920 z canvas, Web Share z plikiem, zapasowo pobranie. Na obrazku nigdy ból, zdrowie, waga ciała, imię i nazwisko (tylko nick; bez nicka — bez podpisu). Test prywatności w `lib/v2/v2.test.ts`.
- **Postępy** (`ProgressV2.tsx`): 3 kafelki, siatka osiągnięć 3 kolumny (zdobyte → w toku z paskiem „8/10” → zablokowane z kłódką), „Zobacz wszystkie (Y)” z opisem jak zdobyć; pod spodem rekordy, mapa roku, kroki. Katalog: `GET /api/client-portal/achievements/overview` (`services/achievementsCatalogue.ts`).
- **Ty** (`YouV2.tsx`): duży awatar (6 kolorów, bez zdjęć), „@nick · trenuje od <miesiąc>”, „Edytuj profil” (nick, nazwa, kolor), 3 wyróżnione osiągnięcia, lista (Mój trener, Cel kroków, Wygląd, Stoper przerw, Prywatność i zgody), na dole „Prowadzę podopiecznych”, Regulamin, Polityka prywatności, Wyloguj.
- **Nick**: migracje `0069_nick_awatar.sql`, `0070_nazwa_wyswietlana.sql`, `0071_nick_zasady.sql` (addytywne; kopie `~/backups/trainer_panel_przed_0069_*`, `…_0071_*`). `GET/PUT /api/client-portal/profile`. Zasady (`services/nick.ts`, `routes/uiV2.ts`): 3–20 znaków (litery, cyfry, `_`, `.`), opcjonalny; unikalny bez względu na wielkość liter; **zarezerwowane** (admin, administrator, optimatren*, trener, trenerzy, support, pomoc, moderator, mod, root, system, owner, staff, kontakt, help, info, bot, byczek… także w wariantach `Admin_1`, `a.d.m.i.n`); **prawie identyczne** odrzucane (klucz: małe litery, bez `_` i `.` — `ola`, `Ola_`, `o.l.a` to jeden nick; **cyfry rozróżniają**: `kasia`, `kasia92`, `kasia2004` mogą istnieć osobno; dodatkowo blokada nicków z dopiskiem trenera, których rdzeń to nick konta z odznaką „Trener” — `trener_ola` przy trenerce `ola`); **zmiana najwyżej raz na 30 dni** (pierwsze ustawienie wolne; usunięcie nicka też liczy się jako zmiana; sama zmiana wielkości liter jest wolna); **stary nick zablokowany dla innych na 30 dni** (`nick_history`); odznaka „Trener” przy nicku konta z rolą trenera. Filtr wulgaryzmów to prosta lista, nie moderacja.
- **Stoper przerwy** — `docs/STOPER.md`.

## Czego nie dało się odwzorować 1:1 i dlaczego
1. **Dni tygodnia na karcie serii**: plany nie mają przypisanych dni tygodnia, więc (jak w specyfikacji) pokazuję Y kółek (cel tygodnia), a nie 7 dni.
2. **Nowe osiągnięcie na ekranie końca**: serwer liczy je dopiero przy zakończeniu treningu (to samo żądanie zapisuje ocenę), więc po „Gotowe” pokazuje się jako jedna karta „Nowe osiągnięcie” na „Dziś” (do kliknięcia OK). Zasady etyczne bez zmian (po bólu i ponad plan serwer nic nie przyznaje).
3. **Czas na story**: „48 min” zamiast „48:12” — trening zapisuje pełne minuty.
4. **Rozgrzewka i schłodzenie** zostały dotychczasowymi kafelkami pod kartą (nie mniejszymi wariantami).
5. **Cel kroków w „Ty”**: wybór 6 000 / 8 000 / 10 000 / bez celu (inne wartości w kafelku „Kroki” w Postępach, jak dotąd).
6. Ekran Solo bez planu / wywiadu (`SoloEntry`) nie jest jeszcze w nowym wyglądzie.
7. Katalog osiągnięć liczy: 6 progów treningów, 6 progów serii, „Pierwszy miesiąc”, „Pierwszy rekord” + zdobyte szczeble drabinek (stąd „Y” zależy od konta; w makiecie 24 to przykład).
