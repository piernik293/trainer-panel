# QA gotowości do bety — nowy wygląd (05.11.2026, gałąź `qa/beta-gotowosc`)

## Jak sprawdzałem
- **Osobny stos QA** (`scripts/qa-stack.sh`): API 18090, portal 22390, panel 23890 na schemacie `qa` w bazie `trainer_panel_test` (kopia bazy aplikacji; baza aplikacji nietknięta, maile wyłączone). Flagi nowego wyglądu włączone jak w aplikacji (UI v2, marka, własny plan, Solo, Złote Byczki).
- **Przeglądarki:** Chromium 375 i 1440 px (jasny/ciemny), emulacja Androida (Pixel 7), **WebKit — silnik Safari — z profilem iPhone 13** (zainstalowane biblioteki systemowe Playwrighta przez `playwright install-deps`).
- **Ścieżka Solo (pełna, na koncie założonym od zera):** wejście → „Dziś” bez planu → „Mam własny plan” → edytor (wyszukiwarka, serie) → zapis → „Dziś” z planem → start (byczek) → seria → **offline w trakcie** → baner „Brak internetu” → powrót sieci → seria → koniec → ocena → **story (PNG pobrany)** → „Gotowe” → Postępy → Ty. Skrypt: `scripts/qa/solo-flow.mjs`. Przeszła w Chromium 375 (jasny, ciemny), Androidzie i desktopie.
- **Przegląd tras panelu, portalu i administratora** (istniejące skrypty `sweep`/`admin-walk`/`trainer-flows`), detektory: przewijanie poziome, puste ekrany, angielskie teksty, przyciski bez nazwy, cele < 44 px, kontrast, błędy konsoli.
- **Wszystkie nowe ekrany w prawdziwym WebKit (iPhone) i na Androidzie** przez strony podglądu: `scripts/qa/preview-webkit.mjs` (16 ekranów × jasny/ciemny × 2 profile): 0 przewijań poziomych, 0 błędów strony, 0 celów < 44 px.
- Zrzuty: `docs/screens/qa-beta2/` (ścieżka Solo, panel, portal, administrator, WebKit).

## Ograniczenia (uczciwie)
- **WebKit: zalogowana ścieżka niemożliwa w tym środowisku.** Logowanie biletem Clerk w headless WebKit nie utrzymuje sesji na instancji *development* (skrypt ochrony Clerka `client.protect.clerk.com` jest blokowany, ciasteczka stron trzecich). To ograniczenie testu, nie aplikacji; ekrany sprawdziłem na stronach podglądu (wyżej). Pełną ścieżkę na prawdziwym iPhonie sprawdzi lista „Test jako Bartek” po otwarciu na świat (`docs/OTWARCIE-KROK-PO-KROKU.md`).
- **Ścieżka trenera** (link → wywiad klienta → plan → aktywacja → trening klienta → „Coś boli?” → widok u trenera) przeszła przez istniejące skrypty bez błędów krytycznych, ale **„Coś boli?” w nowym wyglądzie sprawdzają testy jednostkowe** (`Training.test.tsx`: komunikat z byczkiem „care”), nie przeklikanie z widokiem u trenera w tej turze.
- Detektor kontrastu raportuje fałszywe alarmy na ciemnej karcie treningu („1,38”, „2,55”): Tailwind v4 zwraca kolory w formacie `oklch`, którego detektor nie umie odczytać i zakłada białe tło. Ręcznie: pomarańczowy #FDBA74 i jasnoszary na #1C1917 mają kontrast > 9:1.

## Tabela
| # | Ekran | Problem | Waga | Stan |
|---|---|---|---|---|
| 1 | Plan klienta (panel): `PlanEditor` | Hooki po wczesnym `return` (ładowanie/brak planu) — przy zimnym wejściu zmienia się ich kolejność, strona pada („Rendered more hooks…” / „Coś poszło nie tak”); błąd z commitu 5e767c1 | **krytyczny** | **naprawione** (hooki nad `return`) + test strukturalny `hooks-order.test.ts` (pada na starym kodzie) |
| 2 | Portal: „Dziś”, „Ty” | Długie imię bez spacji (np. „Wojciechowska-Kowalczykowska-…”) wypychało nagłówek poza ekran (62 px na „Dziś”, 24 px w „Ty”) | ważny | **naprawione** (`break-words`; test) |
| 3 | Portal: edytor własnego planu | Przyciski ikon miały 40 px szerokości (zwężane w rzędzie z polem) | ważny | **naprawione** (`shrink-0`, 44 px) |
| 4 | Portal: edytor, pusty plan | Podpowiedź „Dzień … nie ma ćwiczeń” była `role=alert` (czytnik ekranu ogłaszał ją jak błąd) | kosmetyczny | **naprawione** (status; alert tylko dla błędów serwera) |
| 5 | Portal: nowe konto Solo | W konsoli 404 na `/client-portal/profile` i `…/achievements/overview` przed utworzeniem wiersza klienta | kosmetyczny | **naprawione** (pytamy dopiero po wczytaniu klienta). 404 na `/plan` i `/booking` dla nowego konta to oczekiwana ścieżka (SoloGate) |
| 6 | Panel (mobile): menu | Przycisk „Otwórz menu” 38×38 px | kosmetyczny | **naprawione** (44 px) |
| 7 | Panel: listy i karty klienta | Linki i pola wyboru < 44 px („Powrót do listy” 20 px wysokości, „Zaznacz klienta” 16×16, przełączniki „Online/Stacjonarnie” 32 px, kalendarz) | kosmetyczny | **otwarte** — wymaga przeglądu układu panelu (zakres „nowa nawigacja/UX”, `docs/NAWIGACJA.md`) |
| 8 | Panel: formularz ćwiczenia | Przełączniki-`checkbox` i ukryte `select` bez nazwy dla czytników | ważny | **otwarte** — to komponenty bibliotecznego pola wyboru; do osobnej poprawki z testem dostępności |
| 9 | Administrator: „Wnioski” | W skrypcie nie dało się kliknąć zakładki o nazwie „Wnioski” | — | **nie błąd**: gdy są wnioski, zakładka nazywa się „Wnioski (N)” |
| 10 | Administrator: błędy hooków | Jednorazowy „Rendered more hooks…” w zakładkach „Błędy/Wnioski” w pierwszym przebiegu | ważny | **nie odtworzono** po wyłączeniu hałasu (3 próby, 7 zakładek, w tym nowe „Maile” i „Byczki”); pierwszy przebieg działał podczas przeładowań modułów przez serwer deweloperski |
| 11 | Portal: ścieżka Solo | Start nowego konta pomija pytanie o imię (konto Solo powstaje od razu, imię z konta) | informacja | zgodne z projektem Solo; imię można zmienić w „Ty” |
| 12 | WebKit | Brak zalogowanej ścieżki | ograniczenie | opisane wyżej |

## Wynik
Krytyczne: 1 znalezione, 1 naprawione. Ważne: 3 znalezione (2 naprawione, 1 otwarte). Kosmetyczne: 4 znalezione (3 naprawione, otwarte: małe cele w panelu — wspólny temat nawigacji). Wszystkie poprawki z testem tam, gdzie dało się go napisać.
