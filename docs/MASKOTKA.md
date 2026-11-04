# Byczek (maskotka) i logo — gdzie jest w aplikacji i jak podmienić grafiki

Za flagą `BRAND_V1_ENABLED` (domyślnie wyłączona). Bez flagi aplikacja wygląda jak dotychczas (jedyny wyjątek: statyczne ikony PWA/favicon/manifest — plików nie da się przełączać flagą; patrz `docs/DO-DECYZJI.md`).

## Gdzie co jest (jedno źródło: `lib/design-tokens/src/brand/`)
- `Logo.tsx` — logo A „Rogate O” (ikona + napis „optimatren”, wersje: kolor, biała, sama ikona). **Zmiana logo na B lub C = podmiana tego pliku** + `ICON_PATHS` w `scripts/brand-assets.mjs` i `node scripts/brand-assets.mjs` (przeliczy SVG i ikony PNG obu aplikacji).
- `Maskotka.tsx` + `brand.css` — byczek, 6 stanów (`idle`, `walk`, `lift`, `success`, `loading`, `error`), 3 rozmiary (`s` 64 px, `m` 120 px, `l` 190 px). Animacje CSS, bez bibliotek. `prefers-reduced-motion` → stoi nieruchomo.
- `GoldenBullBadge.tsx` — odznaka „Złoty Byczek” (użyta przez kampanię „Złote Byczki”).
- `Loading.tsx` — `Loading` (byczek `loading` pokazuje się dopiero po 0,6 s; po 5 s „Jeszcze chwila…”), `ErrorState` (`error` + „Spróbuj ponownie”), `EmptyState` (`idle`).
- `Sequences.tsx` — `PlanBuilding` (Walk → Lift → Success), `LoginSequence` (Idle → Walk → Lift → Success, ok. 1,5 s, pomijalna dotknięciem, raz dziennie), `IfBrand` (nowy wygląd tylko z flagą).
- `useBrandV1.ts` — flaga z `/api/brand-v1/status`.

## Miejsca użycia
| Miejsce | Stan |
|---|---|
| Ładowanie stron i ekranów (portal, panel) | `loading` |
| Błąd wczytania planu, brak sieci | `error` + „Spróbuj ponownie” |
| Koniec treningu | `success` (rozmiar m) |
| Nowe osiągnięcie (karta na „Dziś”) | `success` (rozmiar s) |
| Układanie planu (Solo) | `walk` → `lift` → `success` |
| Puste stany: brak planu, brak wyników na liście klientów | `idle` |
| Wejście do aplikacji (pierwsze w danym dniu) | sekwencja logowania |
| Nagłówek portalu i panelu, strona logowania | logo A (`BrandMark`) |
| Nagłówek maili | pierścień „O” (SVG w mailach się nie wyświetla) |

## Zamówienie dla grafika / animatora
- **6 stanów**: idle (oddycha, lekko kręci głową), walk (idzie w miejscu), lift (podnosi sztangę nad głowę, 2,4 s), success (skacze z radości, iskry), loading (rozgląda się, trzy kropki), error (wzrusza ramionami, kropla potu, „?”). Plus złota odznaka „Złoty Byczek”.
- **Rozmiary**: projekt na 200 × 220 (proporcje zachowane), czytelny od 64 px.
- **Tło**: przezroczyste (nie białe).
- **Pętla**: idle 3–4 s, walk 0,6 s, lift 2,4 s, success 1 s, loading 1,2–1,6 s, error 2 s; pętle bez skoku na łączeniu.
- **Format**: preferowany Lottie (`.json`) lub Rive (`.riv`), zapasowo SVG z animacją CSS (jak obecny); do 60 KB na stan.
- **Styl**: jak dotychczasowy byczek (brązowa sylwetka, kremowe rogi, opaska #C2410C), kolory zgodne z akcentem aplikacji.

## Jak podmienić grafiki
1. Wrzuć pliki do `public/maskotka/<stan>.json` (lub `.riv`/`.svg`) w obu aplikacjach.
2. W `Maskotka.tsx` wybierz renderer: gdy plik stanu istnieje → odtwórz go biblioteką (Lottie: `lottie-web`, licencja MIT, ok. 60 KB gzip, lub lżejszy `@lottiefiles/dotlottie-web`; Rive: `@rive-app/canvas`, MIT, ok. 70 KB) — **bibliotekę dodaj dopiero przy dostarczeniu plików** (zasada: bez nowych zależności bez potrzeby), a gdy pliku nie ma → obecny SVG jako zapas.
3. Miejsca użycia (tabela wyżej) nie zmieniają się — używają `<Maskotka stan rozmiar />`.
