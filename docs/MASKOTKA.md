# Byczek (maskotka) i logo — 19 stanów, mapa zdarzeń, jak podmienić grafiki

Za flagą `BRAND_V1_ENABLED` (domyślnie wyłączona). Bez flagi aplikacja wygląda jak dotychczas (jedyny wyjątek: statyczne ikony PWA/favicon/manifest — plików nie da się przełączać flagą; patrz `docs/DO-DECYZJI.md`).

## Gdzie co jest (jedno źródło: `lib/design-tokens/src/brand/`)
- `Logo.tsx` — logo A „Rogate O” (ikona + napis „optimatren”, wersje: kolor, biała, sama ikona). **Zmiana logo na B lub C = podmiana tego pliku** + `ICON_PATHS` w `scripts/brand-assets.mjs` i `node scripts/brand-assets.mjs` (przeliczy SVG i ikony PNG obu aplikacji).
- `Maskotka.tsx` + `brand.css` — byczek, 6 stanów (`idle`, `walk`, `lift`, `success`, `loading`, `error`), 3 rozmiary (`s` 64 px, `m` 120 px, `l` 190 px). Animacje CSS, bez bibliotek. `prefers-reduced-motion` → stoi nieruchomo.
- `GoldenBullBadge.tsx` — odznaka „Złoty Byczek” (użyta przez kampanię „Złote Byczki”).
- `Loading.tsx` — `Loading` (byczek `loading` pokazuje się dopiero po 0,6 s; po 5 s „Jeszcze chwila…”), `ErrorState` (`error` + „Spróbuj ponownie”), `EmptyState` (`idle`).
- `Sequences.tsx` — `PlanBuilding` (Walk → Lift → Success), `LoginSequence` (Idle → Walk → Lift → Success, ok. 1,5 s, pomijalna dotknięciem, raz dziennie), `IfBrand` (nowy wygląd tylko z flagą).
- `useBrandV1.ts` — flaga z `/api/brand-v1/status`.

## Wygląd i stany (wersja wysportowana — umiarkowanie)
Barki, dwa mięśnie piersiowe, brzuch 4 pola, ręce z bicepsami; klasy części ciała bez zmian (`.all .head .torso .armL .armR .legL .legR`, środki obrotu rąk 62/138 px). **19 stanów** w jednym komponencie `<Maskotka>` (jeden plik SVG, klasy `s-…`):
- podstawowe (6): `idle`, `walk`, `lift`, `success`, `loading`, `error`;
- nowe (13): `wave` (macha), `warmup` (pajacyki), `rest` (siedzi na ławce, zerka na stoper, pije wodę), `flex` (rekord ciężaru), `levelup` (puchar), `thinking` (generator), `sleep` (śpi w łóżku pod kołdrą), `offline` (przekreślone Wi-Fi), `stretch` (rozciąga nogi), `care` (je brokuła po „Coś boli?”, bez żartów), `streakstart` (zapala pochodnię), `streak` (stoi z płonącą pochodnią i kalendarzem tygodni), `streakout` (wiatr zdmuchuje płomień).
Usunięte w projekcie: wakeup (pierwsze logowanie to Wave → Idle) i goldflip („Złoty Byczek” = `levelup` + złota odznaka).

## MAPA ANIMACJI — jedno miejsce w kodzie
`lib/design-tokens/src/brand/events.tsx`: **zdarzenie → stan → tekst → czas**. Ekrany NIE wybierają stanu same: wołają `<MascotEvent event="rest_timer" />` (pętla przy ekranie) albo `showMascot("streak_ended", klucz)` (krótka animacja nad ekranem, jedna naraz, pomijalna dotknięciem). Zdarzenia „raz” zapamiętują, że już były (localStorage), więc nie wracają po odświeżeniu. **Nigdy w trakcie wykonywania serii** (ekran serii zawiesza animacje; po zapisaniu serii i w przerwie wolno). Przy „ograniczaj ruch” byczek stoi nieruchomo. Test pokrycia (`Mascot.test.tsx`): każde zdarzenie ma stan, każdy z 19 stanów ma zdarzenie, żaden stan nie jest użyty poza mapą.

| Zdarzenie | Stan | Gdzie / kiedy | Czas |
|---|---|---|---|
| `first_open` | wave | ekran powitalny przed rejestracją (pętla do kliknięcia) | pętla |
| `first_login` | wave → idle | pierwsze wejście po rejestracji (ok. 2 s, potem idle) | ok. 2.4 s |
| `login` | walk | sekwencja logowania (ok. 1,5 s, raz dziennie, pomijalna) | ok. 1.5 s |
| `home_idle` | idle | „Dziś” bez treningu, profil | pętla |
| `empty_state` | idle | puste listy i ekrany (brak planu, podopiecznych, osiągnięć) | pętla |
| `loading_long` | loading | dłuższe ładowanie danych (po 0,6 s), do końca ładowania | pętla |
| `workout_start` | lift | „Zaczynamy” po kliknięciu Start (ok. 1,5 s, raz dziennie) | ok. 1.5 s |
| `warmup_screen` | warmup | ekran rozgrzewki (pajacyki), do pominięcia | pętla |
| `rest_timer` | rest | przerwa między seriami, obok stopera, do końca przerwy | pętla |
| `set_pr` | flex | zapisana seria z NOWYM rekordem ciężaru (ok. 1,5 s, w przerwie) | ok. 1.5 s |
| `pain_report` | care | po zgłoszeniu „Coś boli?” (pętla, bez żartów) — „Przerwij to ćwiczenie, jeśli boli” | pętla |
| `cooldown_screen` | stretch | ekran schłodzenia, do pominięcia | pętla |
| `workout_done` | success | koniec całego treningu (ok. 2 s) | ok. 2 s |
| `achievement_unlocked` | levelup | karta odblokowanego osiągnięcia (ok. 2 s) | ok. 2 s |
| `gold_bull` | levelup | przyznanie „Złotego Byczka” (ok. 2 s, + złota odznaka) | ok. 2 s |
| `streak_started` | streakstart | pierwszy tydzień nowej serii (raz na serię) | ok. 5 s |
| `streak_view` | streak | widok serii w „Postępach” i karta serii na „Dziś” (spokojnie, bez skakania) | pętla |
| `streak_ended` | streakout | seria naprawdę się skończyła (po ochronie serii), RAZ, bez zawstydzania — „Seria się skończyła. Zapal ją od nowa w tym tygodniu.” | ok. 5 s |
| `plan_generating` | thinking | generator planu (trener i Solo), do końca; potem plan_ready | pętla |
| `plan_ready` | success | plan ułożony (po plan_generating) — „Plan gotowy” | ok. 2 s |
| `inactive_client` | sleep | u trenera w „Wymaga uwagi”: 7+ dni bez treningu | pętla |
| `no_checkin` | sleep | u trenera w „Wymaga uwagi”: brak odpowiedzi na check-in | pętla |
| `long_break_return` | sleep → wave | klient po długiej przerwie (sleep → wave, ok. 2 s) — „Wróć, kiedy zechcesz — plan na Ciebie czeka” | ok. 4.2 s |
| `offline` | offline | brak internetu (osobno od błędu), do powrotu sieci — „Brak internetu. Trening zapisze się, gdy wróci zasięg.” | pętla |
| `app_error` | error | błąd aplikacji (nie brak sieci), do zamknięcia | pętla |

Uwagi: `no_checkin` jest użyte przy „Zaproszenie bez odpowiedzi” w skrzynce „Wymaga uwagi” (najbliższy odpowiednik — check-inu klienta jeszcze nie ma); „seria się skończyła” (`streak_ended`) pokazuje się, gdy seria spadła z ≥ 2 tygodni do zera (ochrona serii jest już policzona po stronie serwera), raz na koniec serii, ze spokojnym tekstem.

## Zamówienie dla grafika / animatora
- **19 stanów** (lista wyżej), każdy jako osobna pętla; rekwizyty do narysowania: sztanga, ławka, łóżko z poduszką i kołdrą, brokuł, butelka, stoper, puchar, pochodnia z płomieniem, kalendarz tygodni, dymek myśli, „Zzz”, przekreślone Wi-Fi, wiatr i dym, tabliczka REKORD; mimika: uśmiech, ziewnięcie, zamknięte oczy, brwi. Plus złota odznaka „Złoty Byczek”. Zasady: żadnej animacji w trakcie wykonywania serii, jedna na ekranie naraz, każda pomijalna.
- **Rozmiary**: projekt na 200 × 220 (proporcje zachowane), czytelny od 64 px.
- **Tło**: przezroczyste (nie białe).
- **Pętla**: idle 3–4 s, walk 0,6 s, lift 2,4 s, success 1 s, loading 1,2–1,6 s, error 2 s, warmup 1,1 s, rest 4–5 s, flex 1,2 s, stretch 5 s, streakstart/streakout 5 s, sleep 3,6 s; pętle bez skoku na łączeniu.
- **Format**: preferowany Lottie (`.json`) lub Rive (`.riv`), zapasowo SVG z animacją CSS (jak obecny); do 60 KB na stan.
- **Styl**: jak dotychczasowy byczek (brązowa sylwetka, kremowe rogi, opaska #C2410C), kolory zgodne z akcentem aplikacji.

## Jak podmienić grafiki
1. Wrzuć pliki do `public/maskotka/<stan>.json` (lub `.riv`/`.svg`) w obu aplikacjach.
2. W `Maskotka.tsx` wybierz renderer: gdy plik stanu istnieje → odtwórz go biblioteką (Lottie: `lottie-web`, licencja MIT, ok. 60 KB gzip, lub lżejszy `@lottiefiles/dotlottie-web`; Rive: `@rive-app/canvas`, MIT, ok. 70 KB) — **bibliotekę dodaj dopiero przy dostarczeniu plików** (zasada: bez nowych zależności bez potrzeby), a gdy pliku nie ma → obecny SVG jako zapas.
3. Miejsca użycia (tabela wyżej) nie zmieniają się — używają `<Maskotka stan rozmiar />`.
