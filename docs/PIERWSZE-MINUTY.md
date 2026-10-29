# Pierwsze minuty — trener i klient (QA przed betą)

Data: 2026-10-28. Gałąź `qa/pierwsze-minuty`. Test na **osobnej bazie QA** (schemat `qa` w `trainer_panel_test`, kopia bazy aplikacji), osobne porty (API 18090, panel 23890, portal 22390), bez poczty i bez otwartej rejestracji trenerów. Baza aplikacji nietknięta.
Narzędzie: Playwright, szerokości **375 px** i **1440 px**, konta testowe Clerk dev (`…+clerk_test@example.com`). Stos: `scripts/qa-stack.sh`. Zrzuty: `docs/screens/pierwsze-minuty/` (nazwa = ścieżka-numer-ekran-szerokość).

**Jak czytać liczby.** „Ekrany” = kolejne widoki, które zobaczy człowiek. „Kliknięcia” i „pola” = to, co robi skrypt (wybór opcji = 1 kliknięcie). Czas skryptu to sekundy pracy bota, **nie** czas człowieka; „czas człowieka” to szacunek (czytanie, myślenie, pisanie). Rejestracja Clerk w trybie bez głowy zatrzymuje się na „Verifying your request” (ochrona przed botami), więc konta tworzył skrypt przez API — te kroki są **oszacowane**, nie zmierzone.

## Podsumowanie

| Ścieżka | Ekrany | Kliknięcia | Pola | Czas człowieka (szac.) | Uwagi |
|---|---|---|---|---|---|
| **A. Nowy trener → pierwszy aktywny plan** (po założeniu konta trenera) | 16 (3 zaproszenie + 9 kreator + 4 aktywacja) | 14 | 1 | ok. 8–10 min (bez czekania na klienta) | Przed tym: rejestracja (ok. 3 pola + kod z maila) i **wniosek o dostęp trenera — dziś ślepy zaułek** (przeszkoda 1) |
| **B. Nowy klient → pierwszy trening zakończony** | 2 (zaproszenie, konto) + 26 (wywiad) + 20 (trening) = 48 | 55 | 16 | rejestracja 1–2 min + wywiad 4–6 min + trening 20–45 min | Wywiad: 24 pytania, aplikacja sama pisze „ok. 3 min” |
| **C. Trener wpisuje wywiad za klienta bez telefonu** | 5 (dodanie klienta) + 3 (wywiad) = 8 | 20 | 5 | ok. 5–7 min | **Przed poprawką ślepy zaułek** (wywiad się nie otwierał) — poprawione na tej gałęzi |

Liczba ekranów i kroków jest taka sama przy 375 px i 1440 px (zmienia się układ, nie przebieg). Surowe wyniki: `~/logs/qa/b3-*.json`.

## Ścieżka A — nowy trener

| # | Krok | Ekran | Kliknięcia | Pola | Zrzut |
|---|---|---|---|---|---|
| A0.1 | Wejście na panel, logowanie | Clerk po **angielsku** („Continue with Google”, „Don’t have an account? Sign up”) | 1 | 0 | `A0-01` |
| A0.2 | Rejestracja | e-mail, hasło, kod z maila (szac.) | 3–4 | 3 | `A0-02`, `A0-03` |
| A0.3 | Pierwsze wejście nowego konta | „To konto nie ma jeszcze dostępu trenera… Napisz do nas” + „Wyloguj się”. Brak adresu i przycisku „Poproś o dostęp” | 0 | 0 | `A0-04` |
| A0.4 | Droga przez portal („Prowadzę podopiecznych”) | portal: „Klient nie znaleziony…”; karta wniosku niedostępna dla konta bez klienta | – | – | `A0-05` |
| A0.5 | Akceptacja przez administratora | Admin → „Wnioski” → „Akceptuj”; wnioskodawca jako „(bez imienia)” | 2 (admin) | 0 | `A0-06`, `A0-07` |
| A1 | Pulpit po akceptacji | „Pierwsze kroki 1 z 5”, link „Wygeneruj link” | 1 | 0 | `A0-08`, `A-trener-01` |
| A2 | Formularz zaproszenia | imię klienta (e-mail, wiadomość opcjonalne) | 1 | 1 | `A-trener-02` |
| A3 | Link gotowy | „Link gotowy dla …”, „Kopiuj link” | 0 | 0 | `A-trener-03` |
| — | *(klient wypełnia wywiad — ścieżka B)* | | | | |
| A4 | Lista klientów → klient | „Wypełniona”, „Oczekuje na decyzję” | 1 | 0 | `A2-plan-01`, `-02` |
| A5 | Zakładka „Plany treningowe” → „Generuj szkic” | pusta lista + 3 przyciski | 2 | 0 | `A2-plan-03` |
| A6 | Kreator, kroki 1–3 (rekomendacje, harmonogram, „Ułóż wstępną propozycję”) | 3 ekrany | 3 | 0 | `A2-plan-04…08` |
| A7 | Kreator, kroki 4–5 (uzupełnij, podgląd, „Zapisz plan”) | 2 ekrany + „Plan zapisany!” | 2 | 0 | `A2-plan-09` |
| A8 | Szkic → „Edytuj” → „Aktywuj plan” → potwierdzenie | 4 ekrany | 4 | 0 | `A3-aktywacja-01…04` |

## Ścieżka B — nowy klient

| # | Krok | Ekran | Kliknięcia | Pola | Zrzut |
|---|---|---|---|---|---|
| B1 | Link od trenera `/client-landing/survey/<token>` — **wywiad działa bez konta** | „Jak masz na imię?” | 0 | 0 | `B1-wywiad-01` |
| B2 | Wywiad: 24 pytania, 9 etapów, pasek postępu, „ok. 3 min” | 26 ekranów | 35 | 15 | `B1-wywiad-02…` |
| B3 | „Sprawdź swoje odpowiedzi” → „Wyślij” → „Krok pierwszy zrobiony” | (w liczbie powyżej) | w liczbie powyżej | 0 | `B1-wywiad-24…26` |
| — | *(trener układa i aktywuje plan — A4–A8)* | | | | |
| B4 | Link do portalu od trenera (`/invite/<token>`): „Utwórz konto / Zaloguj się” (po polsku) | 1 | 1–2 | 2–3 (szac.) | `B2-portal-01` |
| B5 | „Konto połączone pomyślnie” → „Przejdź do planu” | 1 | 1 | 0 | `B2-portal-02` |
| B6 | „Dziś”: rozgrzewka, trening, schłodzenie; „Zacznij trening” | 1 | 1 | 0 | `B3-trening-01` |
| B7 | Trening: 5 ćwiczeń, 12 serii (powtórzenia + „Zapisz serię”) | 17 | 17 | 1 | `B3-trening-02…18` |
| B8 | „Jak było?” (za lekko / w sam raz / za ciężko) → „Zakończ” | 2 | 2 | 0 | `B3-trening-19`, `-20` |

## Ścieżka C — trener wpisuje wywiad klientowi bez telefonu

| # | Krok | Ekran | Kliknięcia | Pola | Zrzut |
|---|---|---|---|---|---|
| C1 | Pulpit → „Dodaj klienta” | `/clients/new` | 1 | 0 | `C-reczny-01/02` |
| C2 | Imię i nazwisko (e-mail i telefon puste) → „Zapisz Klienta” | formularz | 1 | 2 | `C-reczny-02` |
| C3 | „Klient dodany” + link do skopiowania → „Przejdź do klienta” | 2 | 2 | 0 | `C-reczny-03/04` |
| C4 | Zakładka „Wywiad treningowy” → „Rozpocznij Wywiad” (lub „Wypełnij Wywiad Treningowy”) | 2 | 2 | 0 | `C-reczny-05` |
| C5 | Jeden długi formularz (9 sekcji, ok. 37 pól) → „Zapisz wywiad” | 1–3 | 16 | 3 | `C2-wywiad-trenera-01…03` |

Przed poprawką: C2 kończyło się surowym błędem `[{"validation":"email","code":"invalid_string","message":"Invalid email"…}]` (puste pole e-mail szło do API jako `""`), a C4 prowadził do pustego ekranu „Klient nie wypełnił jeszcze wywiadu treningowego.” bez możliwości wpisania.

## Gdzie nowy użytkownik może się zgubić lub zrezygnować

1. **Nowe konto trenera trafia w ślepy zaułek.** Ekran „To konto nie ma jeszcze dostępu trenera… Napisz do nas” nie podaje adresu ani przycisku. Portal dla tego samego konta pisze „Klient nie znaleziony”, a karta „Prowadzę podopiecznych” jest niedostępna (`/api/account/status` → 404 dla konta bez klienta). Rola trenera da się dostać tylko przez właściciela (zmienne środowiskowe). **Dla bety krytyczne.**
2. **Logowanie w panelu trenera po angielsku** (portal klienta jest po polsku). Pierwszy kontakt trenera to angielski formularz.
3. **Limity planu Free zaskakują dopiero w trakcie:** 1 automatyczny plan miesięcznie i 3 klientów („Osiągnięto limit: automatyczne plany (1/1). Limit odnowi się 2026-11-01”, „Wykorzystano 3/3 miejsc na klientów w planie Free”). Treść jest zrozumiała, ale brak wcześniejszego uprzedzenia — trener dowiaduje się przy drugim kliencie.
4. **Wniosek o dostęp w administracji ma „(bez imienia)”** — administrator nie wie, kogo akceptuje.
5. **„Pierwsze kroki 1 z 5”:** kroki 3–5 odsyłają do `/clients?krok=N` także gdy poprzednie nie są zrobione; kroki są linkami, nie przyciskami. Brak jednego wyraźnego „co teraz”.
6. **Wywiad klienta: 24 pytania w 26 ekranach.** Miejsca ryzyka rezygnacji: „Wzrost i waga” (wrażliwe), dwa ekrany o cardio, „Ćwiczenia preferowane” i „Partie priorytetowe” (wybór bez wiedzy).
7. **Formy zależne od płci w wywiadzie** („urodziłeś/-aś”, „chciałbyś”, „powinienem”) — poprawione na tej gałęzi.
8. **Plank w planie początkującego jako „2 × 12–15”** (ćwiczenie nie ma czasu trwania w danych, portal prosi o powtórzenia). Zła jednostka. Dane katalogu — nie zmieniam (propozycja 11).
9. **Po aktywacji planu brak ekranu „co dalej”.** Link do portalu jest schowany na karcie klienta („Kopiuj link do portalu”, „Wyślij dostęp”).
10. **Klient po wywiadzie nie wie, co dalej** — „Krok pierwszy zrobiony… przygotuję plan” bez terminu; dostęp do portalu dostaje dopiero z osobnego linku.
11. **Trzy podobne przyciski planu** („Nowy plan”, „Import z pliku”, „Generuj szkic”) — bez wprawy nie wiadomo, od którego zacząć.
12. **Pierwszy trening:** 5 ćwiczeń × 2–3 serie wpisywania powtórzeń; rozgrzewka i schłodzenie opcjonalne, łatwo je pominąć (zamierzone).

## Propozycje skrócenia

Ocena: **łatwe** (do 1 dnia, bez zmiany danych), **średnie** (kilka dni lub zmiana zachowania), **trudne** (zmiana modelu/danych albo decyzja produktowa). Oszczędność = ekrany + kliknięcia mniej dla jednej osoby.

| # | Propozycja | Ocena | Oszczędność |
|---|---|---|---|
| 1 | Na ekranie „To konto nie ma jeszcze dostępu trenera” dodać przycisk „Poproś o dostęp” (istniejące `POST /trainer-applications`) i adres kontaktowy z konfiguracji | łatwe–średnie (decyzja produktowa; przy bety zamkniętej z ręcznym zakładaniem kont może zostać jak jest) | odblokowuje ścieżkę A; „napisz do nas” → 1 kliknięcie |
| 2 | Polskie napisy Clerk w panelu: `@clerk/localizations` (jest już w portalu) — wymaga zmiany `package.json` panelu | łatwe (`pnpm add --offline` nie przeszło — brak metadanych; zrobić z siecią) | 0 kroków, mniej zgubień |
| 3 | Imię wnioskodawcy w „Wnioskach” (z Clerk) | łatwe | 0 kroków; mniej pomyłek |
| 4 | Ekran po „Utwórz link”: wyraźne „Skopiowano” i „Dalej: poczekaj na wywiad” | łatwe | 0–1 |
| 5 | Kreator: kroki 1 i 2 na jednym ekranie, „Ułóż wstępną propozycję” po „Dalej” automatycznie | średnie | 2 ekrany + 2 kliknięcia |
| 6 | Po „Plan zapisany!” od razu okno „Aktywować plan?” (omija „Otwórz plan” → „Edytuj” → „Aktywuj”) | średnie (zmiana zachowania — trener traci chwilę na przejrzenie) | 3 ekrany + 3 kliknięcia |
| 7 | Po aktywacji ekran „Wyślij klientowi link do portalu” z jednym przyciskiem | łatwe | 2 kliknięcia |
| 8 | Jedno zaproszenie zamiast dwóch: po wywiadzie klient od razu zakłada konto | trudne (zmiana modelu zaproszeń) | 1 link, ok. 3 ekrany |
| 9 | Wywiad: pominąć pytania zaawansowane (preferowane ćwiczenia, partie priorytetowe, cardio) dla „brak aktywności/początkujący” | średnie (zmiana reguł wywiadu) | 4–6 ekranów, 6–8 kliknięć |
| 10 | Krótka wersja wywiadu trenera (6–8 pól zamiast ok. 37) | średnie | ok. 10 kliknięć |
| 11 | Ćwiczenia izometryczne (plank itp.) w czasie, nie w powtórzeniach — uzupełnić `default_duration_seconds` | średnie (dane katalogu; wymaga zgody) | 0 kroków, mniej pomyłek |
| 12 | Trening: wartości z planu wstawione z góry, klient tylko potwierdza | średnie | do 10 kliknięć w pierwszym treningu |
| 13 | „Pierwsze kroki”: przyciski w kolejności, następne zablokowane do wykonania poprzednich | łatwe | 0 kroków; mniej błędów |
| 14 | Uprzedzenie o limitach Free przy pierwszej wizycie („1 automatyczny plan miesięcznie, 3 klientów”) | łatwe | 0 kroków |

## Poprawki wykonane na tej gałęzi (proste teksty i puste stany)

1. **Wywiad klienta bez form zależnych od płci** (`SurveyWizard.tsx`, `SurveyForm.tsx`): „Jaka jest Twoja data urodzenia?”, „Ile treningów tygodniowo chcesz wykonywać?”, „Czy jest coś jeszcze, co warto wiedzieć?”.
2. **„Nowy klient” bez e-maila i telefonu zapisuje się** (`ClientNew.tsx` + `lib/clientPayload.ts`): puste pola nie idą do API; test `clientPayload.test.ts`.
3. **Wywiad trenera dla klienta bez wywiadu otwiera formularz** (`SurveyForm.tsx`) zamiast pustego komunikatu; tytuł „Wywiad Treningowy”, przycisk „Zapisz wywiad” (przy edycji bez zmian). To **mała zmiana zachowania** — wpis w `docs/DO-DECYZJI.md` do potwierdzenia przy scalaniu.

Zmian przebiegu (kolejność ekranów, kreator, zaproszenia, limity, rejestracja, dane katalogu) **nie wprowadzałem** — tylko opis powyżej.

## Czego nie sprawdzono

- Prawdziwa rejestracja Clerk (anty-bot w trybie bez głowy) — kroki oszacowane.
- Wysyłka e-maili z zaproszeniami (QA bez poczty) — tylko wariant „link do skopiowania”.
- Ścieżka C przy 1440 px: formularz wywiadu zmierzony, formularz „Nowy klient” tylko zrzut (konto testowe wyczerpało limit 3 klientów planu Free — sama ta blokada to przeszkoda 3).

## Pomiar po zmianach (29.10.2026, po poprawkach B1–B7, C1–C4, D1–D2)

Ten sam sposób pomiaru (Playwright 375 i 1440 px, osobna baza QA, konta Clerk dev, nowi trenerzy na planie Free); wyniki 375 i 1440 px są identyczne. Zrzuty: `docs/screens/pierwsze-minuty/N-*`. Pomiar wykrył też poważną usterkę po scaleniu `feature/solo-ekrany` (podgląd Solo psuł `fetch` w całym portalu) — naprawioną tego samego dnia (`docs/DO-DECYZJI.md`, „PILNE”).

| Ścieżka | Przed (ekrany / kliknięcia / pola) | Po (ekrany / kliknięcia / pola) | Co się zmieniło |
|---|---|---|---|
| **Nowe konto trenera → dostęp** | ślepy zaułek („Napisz do nas”) | **3 / 2 / 0** („Poproś o dostęp trenera” → „Wyślij wniosek” → „Wniosek wysłany…”) | B1; po akceptacji administratora (imię i e-mail we wniosku, B3) trener wchodzi do panelu |
| **A. Zaproszenie → aktywny plan + link dla klienta** | 16 / 14 / 1 (link do portalu osobno: ok. +2 kliknięcia) | **15 / 13 / 1** (link w oknie po aktywacji) | C2: po zapisie od razu podgląd z „Aktywuj teraz”; B5: okno z linkiem; krok „Otwórz plan” → „Edytuj” znika |
| **B. Klient: wywiad → pierwszy skończony trening** | 48 / 55 / 16 | **44 / 49 / 14** (wywiad 26 → 22 ekrany, 35 → 29 kliknięć, 15 → 13 pól; trening bez zmian: 20 / 20 / 1) | C3: pominięte preferowane ćwiczenia, partie priorytetowe, drugi ekran o cardio (19 pytań zamiast 22); „Wolę nie podawać” przy wzroście i wadze |
| **C. Trener wpisuje wywiad klientowi bez telefonu** | 8 / 20 / 5 po poprawce z nocy (przed nią ślepy zaułek) | **8 / 20 / 5** | bez zmian (formularz trenera ma 37 pól — propozycja 10 „na później”) |

Zmiany, których nie widać w tych liczbach: ćwiczenia izometryczne (plank itp.) mają w planie czas, a w portalu odliczanie z potwierdzeniem jednym kliknięciem (C1); seria w treningu ma powtórzenia z planu i ciężar z poprzedniego treningu wpisane z góry (C4); logowanie panelu jest po polsku (B2); „Pierwsze kroki” prowadzą jednym następnym krokiem (B6); klient po wywiadzie widzi, co dalej (B7).
