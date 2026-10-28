# Przegląd jakości przed betą (27.10.2026)

Gałąź `qa/przeglad-bety` (poprawki), `qa/bezpieczenstwo` (poprawki bezpieczeństwa). Zrzuty: `docs/screens/qa/` (stan po poprawkach, 375 px jasny i 1440 px ciemny), stan „przed” dla naprawionych błędów: `docs/screens/qa/przed/`.

## Wynik w skrócie
| Waga | Znalezione | Naprawione | Zostaje otwarte |
|---|---|---|---|
| Krytyczny | 1 | 1 | 0 |
| Ważny | 13 | 11 | 2 |
| Kosmetyczny | 10 | 5 | 5 |

Poprawiałem tylko to, co nie zmienia reguł biznesowych ani zachowania zaplanowanego przez właściciela. Zmiany tekstów i miejsc decyzyjnych są w `docs/DO-DECYZJI.md` (pozycje 38–48).

## Jak sprawdzałem
- **Osobny stos QA** (API 18090, portal 22390, panel 23890) uruchomiony na tej samej bazie, z kontami testowymi Clerk `qa…+clerk_test@example.com`. Rola administratora i otwarta rejestracja trenerów były ustawione tylko w procesach QA — `.env` i działająca aplikacja nie zostały zmienione. Próbę zmiany pakietu konta testowego zablokowało zabezpieczenie (punkt STOP-7), więc jej nie wykonałem; do generowania planów użyłem konta administratora (bez limitu generatora).
- **Przeglądarka bezgłowa (Playwright)**: panel trenera, portal podopiecznego i panel administratora w 375 i 1440 px, jasny i ciemny motyw. Na każdym ekranie automatyczne wykrywacze: poziome przewijanie, pusty ekran, angielskie teksty, słowa medyczne, przyciski i pola bez nazwy, kontrast tekstu, cele dotyku < 44 px, błędy sieci i konsoli. Do tego oglądałem zrzuty.
- **Ścieżki przeklikane w interfejsie**: wywiad (3 profile: średniozaawansowany + siłownia + cel sportowy z pytaniem o skoki, początkujący + dom, brak aktywności + siłownia plenerowa, plus zaawansowany + siłownia aż do podsumowania) → kreator planu → zapis → „Zamień na inne” → aktywacja (okno potwierdzenia) → zaproszenie → aktywacja konta podopiecznego → trening w portalu (serie, „Coś boli?”, podsumowanie) → widok klienta u trenera (wszystkie zakładki) → pakiet i skrzynka „Wymaga uwagi” → import (szablon, błędny plik, poprawny plik) → raport miesięczny (okno) → kroki → link i kod dołączenia → prośba → akceptacja → odłączenie → wniosek „Prowadzę podopiecznych” → akceptacja w panelu administratora → przełącznik [Mój trening]/[Podopieczni].
- **Izolacja**: macierz 26 tras × 5 tożsamości na żywej aplikacji — 0 wycieków (szczegóły w `docs/BEZPIECZENSTWO-BETA.md`).

## Tabela problemów
Zrzut „przed” = `przed/…`, „po” = plik w `docs/screens/qa/`.

| # | Ekran | Problem | Waga | Stan | Zrzut |
|---|---|---|---|---|---|
| K1 | Start API (po restarcie) | Osoba z kontem bez trenera (Solo albo prośba o dołączenie w toku) przerywała start API przy ≥ 2 trenerach („niejednoznaczne”), a przy jednym trenerze zostałaby po cichu mu przypisana. Aplikacja nie wstałaby po restarcie. | krytyczny | naprawione (`qa/przeglad-bety`, `qa/bezpieczenstwo`; test `startup-migration-solo`) | log API: `migration: ABORT — 9 trainers exist and 1 clients have NULL trainer_id` |
| W1 | Portal: nieistniejąca strona | Tekst szablonu dla programistów po angielsku („404 Page Not Found / Did you forget to add the page to the router?”) | ważny | naprawione (po polsku, link do planu; test) | przed: `przed/portal-client_landing_nie_ma-375-light.png`, po: `portal-client_landing_nie_ma-375-light.png` |
| W2 | Portal i panel: plan | Rodzaj dnia pokazywany jako klucz techniczny „upper”, „lower”, „full_body” | ważny | naprawione (Góra ciała / Dół ciała / Całe ciało; test `dayFocusLabel`) | przed: `przed/portal-client_landing_plan-375-light.png`, po: `portal-client_landing_plan-375-light.png` |
| W3 | Panel: edytor planu, ciemny motyw | Etykiety cardio („3 sesje / tydzień”, „Marsz”, „25 min”) białe na białym — nieczytelne | ważny | naprawione | przed: `przed/cardio-chipy-ciemny-1440.png`, po: `po-poprawce-cardio-chipy-ciemny-1440.png` |
| W4 | Portal: wysłanie wywiadu | Osoba wypełniająca wywiad widziała komunikat o pakiecie trenera („Osiągnięto limit: klienci (3/3). Wyższy plan zwiększa ten limit.”) | ważny | naprawione (prosty komunikat „Napisz do swojego trenera”; test) | przed: `przed/wywiad-zaawansowany-silownia-po-wyslaniu-1440-dark.png` |
| W5 | Portal: osoba bez trenera i planu | Mylący komunikat („Skontaktuj się ze swoim trenerem…”, „Spróbuj ponownie”), a formularz „Prowadzę podopiecznych” był nieosiągalny (jest tylko w oknie konta, którego ta osoba nie widzi) | ważny | naprawione (własny ekran: „Trening samodzielny — wkrótce”, kod trenera, wniosek; test) | przed: `przed/portal-osoba-bez-trenera-375-light.png`, po: `portal-osoba-bez-trenera-po-375-light.png` |
| W6 | Panel administratora: Trenerzy | Każdy trener bez nazwy to „(bez nazwy) · brak e-maila” — nie da się ich odróżnić | ważny | naprawione (nazwa → e-mail → „Konto …” + 6 znaków identyfikatora; test) | przed: `przed/admin-Trenerzy-375-dark.png`, po: `admin-Trenerzy-375-light.png` |
| W7 | Panel: Ustawienia (375 px) | Adres e-mail wychodzi poza kartę Profil | ważny | naprawione | przed: `przed/panel-settings-375-dark.png`, po: `panel-settings-375-light.png` |
| W8 | Panel: odłączenie podopiecznego | Po „Odłącz” trener zostaje na stronie błędu „Klient nie istnieje lub nie masz do niego dostępu” zamiast na liście | ważny | naprawione (przejście na listę; test) | przed: `przed/klienci-po-odlaczeniu-375-light.png` |
| W9 | Panel: lista klientów, notatki, plany, rekomendacje | Przyciski i linki z samą ikoną bez nazwy (wywiad, usuń klienta, usuń plan, usuń notatkę, zobacz ćwiczenie); akcje w wierszu tabeli widoczne tylko po najechaniu myszą | ważny | naprawione (nazwy dla czytników ekranu, widoczne też po fokusie z klawiatury) | `panel-clients-375-light.png` |
| W10 | Okna dialogowe (np. raport) | Przycisk zamykania nazwany „Close” po angielsku | ważny | naprawione („Zamknij”; test) | `przed/klient-raport-pdf-375-light.png` |
| W11 | Panel: formularz ćwiczenia | Dwa pola wyboru (asekuracja, start adaptacyjny) bez nazwy dla czytników ekranu | ważny | naprawione | `panel-exercises_new-375-light.png` |
| W12 | Portal: trening (konsola przeglądarki) | Ostrzeżenie Reacta „Cannot update a component while rendering a different component” podczas treningu | ważny | otwarte — nie widać objawu dla użytkownika, wymaga osobnej analizy `TrainingFlow` | `portal-trening-01-375-light.png` |
| W13 | Portal: koniec treningu | Widoczny napis „maskotka” w szarym okręgu (placeholder na przyszłą maskotkę) | ważny | otwarte — decyzja właściciela (poz. 39) | `przed/portal-trening-podsumowanie-375-light.png` |
| C1 | Portal: koniec treningu | „1 minut”, „1 serii” (liczba mnoga) | kosmetyczny | naprawione (1 minuta, 2 minuty, 5 minut; test) | `portal-trening-podsumowanie` (przed) |
| C2 | Panel: okno raportu | Słowo „Wrapped” w opisie | kosmetyczny | naprawione | `klient-raport-pdf-375-light.png` |
| C3 | Panel: Ustawienia, ceny pakietów | „14.99 PLN / miesiąc” (kropka i PLN), a w panelu administratora „zł” | kosmetyczny | naprawione („14,99 zł / miesiąc”) | `panel-settings-1440-dark.png` |
| C4 | Portal: plan | „Cel: Cel sportowy” (powtórzone słowo) | kosmetyczny | naprawione | `portal-client_landing_plan-375-light.png` |
| C5 | Stopki wszystkich ekranów (375 px) | Linki prawne miały 16 px wysokości | kosmetyczny | naprawione w stopkach i na stronach dokumentów (min. 44 px, `aria-current` na otwartym dokumencie; 28.10.2026, test) | `panel-root-375-light.png` |
| C6 | Wszystkie ekrany 375 px | Mniejsze cele dotyku niż 44 px: „Otwórz menu” (38 px), przełączniki Online/Stacjonarnie (32 px), dni kalendarza (38×56), wybór pakietu administratora (27 px), pola wyboru w tabelach (16 px) | kosmetyczny | otwarte — wymaga przeglądu nawigacji i układu (poza zakresem: nowa nawigacja/UX) | `panel-calendar-375-light.png` |
| C7 | Klient po akceptacji prośby | Nazwa „Ewa ” (brak nazwiska, spacja na końcu) | kosmetyczny | naprawione w wyświetlaniu (jedna funkcja `clientFullName` zamiast „{imię} {nazwisko}” w 7 miejscach panelu; 28.10.2026, test) | `klient-ewa-375-light.png` |
| C8 | Zakładka Rekomendacje | Separatory „·” o niskim kontraście (dekoracja) | kosmetyczny | naprawione (kolor tekstu pomocniczego, `aria-hidden`; 28.10.2026) | `klient-zakladka-Rekomendacje-1440-dark.png` |
| C9 | Pola dat | W Chromium bezgłowym format „mm/dd/yyyy” — zależy od ustawień przeglądarki, nie aplikacji | kosmetyczny | nie jest błędem aplikacji | `plan-131-aktywacja-1440-light.png` |
| C10 | Dane testowe w bazie aplikacji | Fikstury testów („Fikstury testów (techniczny)”, 21 klientów) i konta QA widoczne w panelu administratora | kosmetyczny | do usunięcia przed betą — tylko za zgodą właściciela (`docs/BETA-START.md`, pkt 10) | `admin-Trenerzy-1440-dark.png` |

## Co działa dobrze (sprawdzone)
Pusty stan Pulpitu i „Pierwsze kroki”; wywiad na telefonie (kroki, pytanie o skoki przy celu sportowym, zgoda na dane o zdrowiu, podsumowanie); kreator planu aż do zapisu; okno aktywacji planu; „Objętość: w zalecanym zakresie ✓”; trening offline-first z „Coś boli?” i komunikatem bez słów medycznych oprócz stałego zdania o konsultacji przy silnym bólu; „Wymaga uwagi” z pozycjami: ból, prośba o dołączenie, brak planu; import: szablon, komunikat o błędnym pliku, podgląd dopasowania; link i kod dołączenia z błędnym kodem (komunikat po polsku); wniosek o konto trenera i akceptacja; brak słów medycznych poza komunikatem o bólu (automatyczny wykrywacz nic nie znalazł).

## Czego nie sprawdzałem w interfejsie (i dlaczego)
- Aktywacja z blokadą dla BA/P i z ostrzeżeniem dla Ś/Z: w interfejsie tylko dla Ś (ostrzeżenie „w zalecanym zakresie”); blokadę dla BA/P pokrywają testy API (`priority-limit`, `generator-priorities`).
- „Generuj od nowa”: przeklikane do kroku ponownego generowania; różnicę względem poprzedniego planu pokrywają testy (`generator-priorities`). „Zamień na inne”: kliknięte, wynik w historii planu (brak bezpiecznego zamiennika → puste miejsce) zgodnie z regułą.
- Import prawdziwego pliku .xlsx (sprawdzony CSV i błędny plik; czytnik .xlsx pokrywają testy).
- Rezerwacje i kalendarz, ustawianie celu kroków, edycja pakietu w interfejsie, pobranie samego PDF (okno raportu sprawdzone; generowanie PDF pokrywają testy `monthly-report`).
- Pełna kombinacja poziom × miejsce × cel: sprawdziłem 4 profile przez interfejs; wszystkie kombinacje wywiadu pokrywają testy `generator`/`survey`.
- Moduły wyłączone flagami (Solo, kondycja) — ich ekranów nie ma.

## Narzędzia
Skrypty przeglądu leżą poza repozytorium w `~/tools/pw/qa/` (stos QA, sweep, boty wywiadu i planu, macierz izolacji). Można je dołączyć do repozytorium na życzenie.
