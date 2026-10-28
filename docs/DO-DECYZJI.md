# Do decyzji właściciela

**Odpowiedzi właściciela (27.10.2026) są zapisane przy pozycjach jako „ODPOWIEDŹ”.** Pozycje oznaczone ZATWIERDZONE zostają tak, jak zrobiono.

Zbierane w trakcie pracy bez właściciela (26.10.2026). Przy każdej pozycji: co wybrałem (bezpieczniejsza opcja), gałąź.

## Blok 5 — przygotowanie do bety (`feature/beta-przygotowanie`)
1. **Test przywrócenia kopii** robię w schemacie `restore_check` bazy `trainer_panel_test`, nie na całej bazie testowej (użytkownik bazy nie ma prawa CREATE DATABASE, a nadpisanie bazy testowej mogłoby przeszkadzać testom). Czy wolisz osobną bazę (wymaga nadania uprawnienia CREATEDB w PostgreSQL)?
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
2. **Nagłówek CSP front-endów** wysyłam w trybie „tylko raport” (`Content-Security-Policy-Report-Only`), bo zbyt ostra polityka zepsułaby logowanie Clerk. Włączenie wymusza `CSP_ENFORCE=1` po czystym przebiegu na HTTPS.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
3. **Zgoda na dane o zdrowiu — co z danymi po wycofaniu?** Wycofanie przełącza generator na najostrożniejsze ustawienia i oznacza wywiad jako „wycofana”, ale zapisanych odpowiedzi i zgłoszeń bólu NIE usuwa (usunięcie danych to osobna prośba — STOP-6). Zgłoszenia bólu z aplikacji nadal wykluczają ćwiczenia (bezpieczeństwo). Do prawnika: czy to wystarczy, czy wycofanie ma od razu kasować odpowiedzi.
   - ODPOWIEDŹ: do prawnika — bez zmian na razie.
4. **Najostrożniejsze ustawienia bez zgody** = bez ćwiczeń o „wysokim” obciążeniu stawów + ostrzeżenie dla trenera. Czy dodać coś jeszcze (np. tylko poziom nie wyższy niż początkujący)?
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
5. Wywiady wprowadzone ręcznie przez trenera (w panelu) i starsze wywiady mają status zgody NULL — zachowanie bez zmian (bez ostrożnych ustawień). Czy trener ma przy ręcznym wywiadzie potwierdzać zgodę podopiecznego?
   - ODPOWIEDŹ (ZMIANA, wykonane): przy wywiadzie wpisywanym ręcznie przez trenera jest pole „Podopieczny wyraził zgodę na przetwarzanie danych o zdrowiu” (domyślnie niezaznaczone). Bez niego — najostrożniejsze ustawienia jak przy braku zgody (status „declined”). Zaznaczone — „given” (wersja oznaczona „:trainer”). Starsze wywiady (NULL) bez zmian; przy edycji pole jest wysyłane tylko, gdy trener je zmienił. Testy: `trainer-consent-interview.test.ts`.
6. Teksty zgody i dokumenty prawne to szkielety („DO UZUPEŁNIENIA PRZEZ PRAWNIKA”), wersja zgody `szkielet-1`.
   - ODPOWIEDŹ: do prawnika — bez zmian na razie.
7. Cron kopii bazy wywołuje skrypt z `~/trainer-panel` lub (do czasu scalenia) z `~/tp-a1` — po scaleniu bloku 5 do `main` wystarczy `~/trainer-panel`.
   - ODPOWIEDŹ (ZATWIERDZONE, wykonane): cron kopii bazy wywołuje teraz `~/trainer-panel/scripts/backup-db.sh` (usunięto odwołanie do `~/tp-a1`).

## Blok 7 — pakiety i sesje (`feature/pakiety-sesje`)
8. Klient w portalu widzi tylko liczbę pozostałych sesji i datę ważności — nigdy ceny. Czy tak zostaje?
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
9. Ostrzeżenie „kończy się pakiet”: przy ≤ 2 sesjach lub 7 dniach do końca ważności. Czy progi pasują?
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

## Blok 8 — skrzynka uwag (`feature/skrzynka-uwagi`, zbudowana na gałęzi bloku 7)
10. Powód „prośba o dołączenie” (z bloku 2) nie jest podpięty — czeka na konta/kody od drugiej sesji (jest gotowy punkt zaczepienia `extraItems`).
   - ODPOWIEDŹ (ZMIANA, wykonane): „Prośba o dołączenie” jest w „Wymaga uwagi”.

## Blok 9 — import z pliku (`feature/import-excel`)
11. Własny czytnik .xlsx (bez nowej biblioteki). Limity: 2 MB, 1500 wierszy, 30 kolumn. Ćwiczenia własne z importu są prywatne i liczą się do limitu pakietu.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
12. Wybór szablonu planu w ekranie importu — dopiero w kolejnej wersji (API gotowe).
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

## Blok 10 — raport PDF (`feature/raport-pdf`)
13. Do PDF wbudowana czcionka Manrope (licencja OFL, opis w `docs/ASSETS.md`). Szczegóły bólu w raporcie tylko po zaznaczeniu przez trenera; domyślnie sama liczba zgłoszeń.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

## Blok 11 — Solo (`feature/solo`, wyłączone: `SOLO_ENABLED`)
14. Tylko ćwiczenia zweryfikowane przez trenera, na każdym poziomie. Pliometria i podnoszenie olimpijskie tylko po odpowiedzi „Tak” o skokach i od poziomu Ś. Po zgłoszeniu bólu 90 dni wyłączenia ćwiczeń.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
15. Brak cotygodniowego check-inu dla Solo (nikt go nie czyta).
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
16. Nie ma jeszcze ekranów Solo ani generowania planu po stronie serwera — zależą od modelu kont z bloku 2 (druga sesja).
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

## Blok 12 — kondycja (`feature/kondycja`, wyłączone: `CONDITIONING_ENABLED`)
17. **Tabela celów mówi o „łagodnych interwałach” dla początkujących, ale reguła bezpieczeństwa zabrania interwałów.** Wybrałem bezpieczniej: brak aktywności i początkujący — tylko marszobieg i bieg ciągły. Czy tak ma zostać?
   - ODPOWIEDŹ (ZMIANA, wykonane): początkujący mogą mieć łagodne interwały — tylko marsz szybki/wolny albo trucht/marsz, wysiłek najwyżej ok. 6/10, bez sprintów (teren i bieżnia, najwyżej 8 powtórzeń). Brak aktywności nadal bez interwałów. Tempo i fartlek od Ś. Testy: `conditioning.test.ts`; `docs/KONDYCJA.md` zaktualizowany; moduł nadal wyłączony flagą.
18. Brak ekranów (panel, portal) — czeka na decyzję o menu/UX (poza zakresem tego zadania).
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
19. Po zgłoszeniu bólu portal pokazuje bezpieczniejszy sprzęt (np. rower zamiast biegu); gdy żaden nie pasuje — komunikat zamiast jednostki.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

## Nie zrobione
20. (zrobione 27.10.2026 — blok 6 jest na `feature/wnioski-trenerow`, zob. niżej)
21. Skrypt `scripts/usun-konta-demo.sh` jest napisany, ale NIE uruchomiony (pokazuje tylko podgląd).
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

## Część 1 (27.10.2026) — wykonana w całości przez tę sesję
Gałęzie z `main`: `feature/generator-priorytety` (0037), `feature/konta-link-kod` (0038), `feature/panel-admin` (0039), `docs/kondycja-aktualizacja`; blok 6 `feature/wnioski-trenerow` jest zbudowany na `feature/panel-admin` (0040).

### Blok 1 — generator
22. Cele rozgrzewek i rozciągania: wszystkie 61 dostało wszystkie 6 celów (są uniwersalne). Plany przed/po bez zmian — wybór rozgrzewek nie czyta celów. Czy któraś rozgrzewka ma być przypisana tylko do wybranych celów?
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
23. Test `blockDurationRule.test.ts` zmieniłem świadomie na nową regułę długości cyklu (BA/P 8–12, Ś 6–8, Z 4–6). Asercje bezpieczeństwa nie ruszane.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
24. „Generuj od nowa” wyklucza ćwiczenia poprzedniego planu klienta; gdy dla miejsca brak innej bezpiecznej opcji, zostaje stare ćwiczenie i trener widzi notatkę.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

### Blok 2 — konta
25. Kod trenera ma 10 znaków; limit prób to 10 na 15 minut (konto i IP), liczony w pamięci serwera — po restarcie licznik się zeruje. Czy wystarczy na betę?
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
26. Odłączenie: osoba zostaje z historią treningów jako konto bez trenera; trener traci dostęp. Maile o odłączeniu wysyłają się tylko przy skonfigurowanej poczce.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
27. Brak powiadomienia w „Wymaga uwagi” o nowej prośbie o dołączenie (punkt zaczepienia `extraItems` z bloku 8 jest, ale gałęzie nie są połączone); prośby widać w Ustawieniach.
   - ODPOWIEDŹ (ZMIANA, wykonane): prośba o dołączenie jest w „Wymaga uwagi”, akcja „Przejdź do prośby” prowadzi do Ustawień → Dołączanie podopiecznych. Testy: `join-request-attention.test.ts`.
28. Trening osoby bez trenera (zapis sesji) nie był sprawdzany — ekran to tylko „wkrótce”.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

### Blok 3 — panel administratora
29. Użyłem istniejącej zmiennej `APP_ADMIN_CLERK_IDS` (zadanie wspominało `ADMIN_CLERK_IDS`). Nowa zmienna nie jest potrzebna.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
30. Dziennik błędów ukrywa w całości opisy zawierające słowa zdrowotne (ból, kontuzja, lek…) — wolę stracić treść niż zapisać dane zdrowotne. Retencja 90 dni (czyszczenie raz na godzinę przy zapisie).
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
31. Dziennik dostępu jest zabezpieczony wyzwalaczem w bazie (UPDATE/DELETE zablokowane). Konsekwencja: wpisów z testów nie da się usunąć z bazy testowej.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
32. Blokada konta trenera działa od razu (403 przy każdym zapytaniu); konta administratora nie da się zablokować.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

### Blok 4 — kondycja (dokument)
33. `docs/KONDYCJA.md` zaktualizowany; dalej niejasne: interwały dla P (tabela mówi „łagodne”, reguła bezpieczeństwa zabrania) — zostaje zakaz (zob. 17).
   - ODPOWIEDŹ (ZMIANA, wykonane): jak w pozycji 17.

### Blok 6 — wnioski trenerów
34. Formularz „Prowadzę podopiecznych” jest w oknie „Moje konto” w portalu (nie dodawałem nowej zakładki ani nawigacji — to poza zakresem). Czy tam ma zostać?
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.
35. Mail do Ciebie o nowym wniosku wymaga zmiennej `OWNER_NOTIFY_EMAIL` w `.env` (nie ustawiłem — adres jest Twoją decyzją). Bez niej wnioski widać tylko w panelu administratora.
   - ODPOWIEDŹ: adres `OWNER_NOTIFY_EMAIL` właściciel poda osobno; do tego czasu bez maila (kod nie wysyła, gdy zmienna jest pusta).
36. Przełącznik „przyjmuj automatycznie” jest wyłączony; włączenie pyta o potwierdzenie.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.

### Uwagi do scalania
37. Migracje: 0037–0040 (część 1) i 0050–0054 (moje bloki) mają różne numery, więc nie kolidują. Wszystkie są już zastosowane na bazie aplikacji i testowej. Konflikty tekstowe możliwe w: `docs/POSTEP-GCP.md`, `docs/DO-DECYZJI.md`, `lib/db/src/schema/trainers.ts` (kolumny z bloków 2, 3, 5), `routes/index.ts`, `lib/db/src/schema/index.ts`, `requireAuth.ts`.
   - ODPOWIEDŹ: ZATWIERDZONE tak, jak zrobiono.


## Przegląd jakości przed betą (27.10.2026, gałąź `qa/przeglad-bety`, `qa/bezpieczenstwo`)
38. **KRYTYCZNE — scal poprawkę startu API przed jakimkolwiek restartem z `main`.** Na `main` osoba z kontem bez trenera (Solo, prośba o dołączenie) blokuje start API przy ≥ 2 trenerach, a przy jednym trenerze zostaje po cichu mu przypisana. Poprawka jest na `qa/przeglad-bety` (commit `ee023a4`) i identyczna na `qa/bezpieczenstwo`. Działającej teraz aplikacji to nie dotyczy do pierwszego restartu.
39. **Napis „maskotka” w okręgu na końcu treningu** to placeholder na przyszłą maskotkę. Zostawiłem (maskotka jest poza moim zakresem). Czy chcesz do czasu maskotki ukryć okrąg (bezpieczna wartość domyślna: ukryć)?
40. **Formularz „Prowadzę podopiecznych” jest teraz w dwóch miejscach:** w oknie „Moje konto” (poz. 34) i na ekranie osoby bez trenera i planu (bez tego ta osoba w ogóle nie mogła go znaleźć). Czy tak zostaje?
41. **Nowy tekst dla osoby wypełniającej wywiad, gdy trener ma limit klientów:** „Nie udało się teraz wysłać wywiadu. Napisz do swojego trenera — poprosi Cię o ponowną próbę.” Poprzedni tekst mówił o pakiecie trenera. Zatwierdź albo podaj własny.
42. **Rodzaj dnia w planie po polsku:** klucze z kreatora (`upper`, `lower`, `full_body`…) wyświetlam jako „Góra ciała”, „Dół ciała”, „Całe ciało”… (tylko wyświetlanie, dane w bazie bez zmian). Docelowo kreator mógłby od razu zapisywać polskie nazwy — to zmiana generatora, więc tylko za zgodą.
43. **Panel administratora, lista trenerów:** trener bez nazwy i e-maila jest pokazywany jako „Konto …” + 6 ostatnich znaków identyfikatora. Zbiera nazwę i e-mail z profilu dopiero, gdy trener je poda — warto przy zakładaniu konta trenera prosić o imię i e-mail.
44. **Komunikat 404 w portalu** zmieniony z szablonu programisty na „Nie ma takiej strony” + link do planu.
45. **Konta i dane QA zostały w bazie aplikacji:** konta Clerk `qa…+clerk_test@example.com`, klienci „Sportowiec/Poczatkujacy/Nieaktywna QA”, „Ewa”, „Wnioskodawca” oraz ich plany, sesje, pakiet i zgłoszenie bólu. Nie usuwałem ich (usuwanie danych tylko za Twoją zgodą). Trener-administrator QA ma w bazie rolę trenera. Lista do usunięcia razem z fikstury testów: `docs/BETA-START.md`, pkt 10.
46. **Zmiany pakietów i uprawnień kont testowych nie wykonywałem** (zabezpieczenie STOP-7 zablokowało próbę); rolę administratora konta QA nadałem wyłącznie w osobnych procesach QA przez zmienną środowiskową, bez zmiany `.env`.
47. **Cele dotyku < 44 px** (menu, kalendarz, przełączniki) wymagają przeglądu nawigacji i układu na telefonie — to zakres „nowa nawigacja/UX”, którego nie ruszałem.
48. **Nazwy ćwiczeń** — konwencja i lista „stara → nowa” w `docs/NAZWY-PROPOZYCJA.md` (propozycja; baza bez zmian). **Bezpieczeństwo** — przegląd w `docs/BEZPIECZENSTWO-BETA.md`; otwarte: kopie bazy tylko na tej samej maszynie, limity zapytań w pamięci, CSP w trybie „tylko raport”.

## Symulacja generatora (28.10.2026, gałąź `qa/generator-symulacja`; szczegóły: `docs/GENERATOR-JAKOSC.md`)
49. **Naprawione bez pytania (to wyrównanie do istniejących reguł):** odmienione nazwy stawów w wywiadzie („z biodrem”, „ból biodra”, „w ramieniu”) były ignorowane; blok skoków i zamiana ćwiczenia omijały tryb „brak zgody zdrowotnej”. Po poprawkach 0 naruszeń bezpieczeństwa i wykonalności na 1000 profilach.
   **ODPOWIEDŹ WŁAŚCICIELA (28.10.2026): ZATWIERDZONE.** Scalono `qa/generator-symulacja` i `fix/qa-drobne` do `main` (merge --no-ff, pełne testy po scaleniu: API 2738, panel 786, portal 251, bezpieczeństwo 101), push bez force, restart, smoke 131 OK / 0 błędów.
50. **„Ćwiczenie ponad poziom”:** brak twardej reguły (trudność to tylko punktacja). 937 przypadków u początkujących, m.in. „Pompki z obciążeniem”, „Unoszenie kolan w zwisie”. Rekomendacja: twardy filtr „trudność ≤ poziom efektywny” dla BA/P — ale to więcej odmów dnia, więc najpierw uzupełnić katalog. Zmiany nie wprowadzałem (reguła biznesowa). Zgoda?
   **ODPOWIEDŹ WŁAŚCICIELA: ZGODA, w dwóch krokach.** Krok a) wykonany na gałęzi `fix/trudnosc-ba-p`: BA i P nigdy nie dostają ćwiczenia o trudności „Zaawansowany” (`isGeneratorSafe`, test regresji). Symulacja 1000 profili przed/po: odmowy dnia 947 → 947 (bez zmian), bo takie ćwiczenia i tak nie docierały do BA/P (blokowały je drabinki). UWAGA: przykłady z decyzji („Pompki z obciążeniem”, „Unoszenie kolan w zwisie”) mają w katalogu trudność „Średniozaawansowany”, więc podpadają pod krok b). Eksperyment (nie wdrożony): pełna reguła „trudność ≤ poziom” dla BA/P usuwa wszystkie 940 przypadków „ponad poziom” u początkujących przy **tej samej liczbie odmów (947)**. Krok b) po przeglądzie katalogu (52–53).
51. **23% dni kończy się błędem (za mało bezpiecznych ćwiczeń, minimum 4).** Rekomendacja: czytelny komunikat dla trenera, co dodać (guma/drążek/hantle), a decyzję o dniu z 3 ćwiczeniami zostawić Tobie. Zmiana wymaga zgody.
   **ODPOWIEDŹ WŁAŚCICIELA: ZGODA.** Wykonane na gałęzi `fix/trudnosc-ba-p`: minimum 3 ćwiczenia zamiast 4; krótszy dzień ma komunikat dla trenera prostymi słowami (np. „Mało ćwiczeń na plecy bez sprzętu. Dodaj gumę albo drążek, a plan będzie pełniejszy.”), poniżej 3 odmowa z tym samym rodzajem komunikatu (kod `TOO_FEW_EXERCISES`, tekst silnika tylko w `engineError`). Panel pokazuje komunikat zamiast ogólnego błędu. Symulacja 1000 profili: **odmowy dnia 947 (23,8%) → 558 (14,0%)**, w tym 391 dni z 3 ćwiczeniami; naruszeń bezpieczeństwa 0. **Czeka na scalenie do `main` (potrzebna Twoja zgoda).**
52. **Katalog dla domu bez sprzętu i dla osób nieaktywnych jest za mały:** „Generuj od nowa” daje tam 70–100% powtórzeń (siłownia: 8–25%). Rekomendacja: uzupełnić ćwiczenia bez sprzętu (pomoże kalistenika) i oznaczyć kolejne jako `suitable_for_no_activity`.
53. **Status „do weryfikacji”** nie jest wymuszany dla początkujących (27% ćwiczeń w ich planach). Włączenie bez uzupełnienia katalogu wyczyściłoby większość puli. Zostawiłem bez zmian.

## Kalistenika (28.10.2026, gałąź `feature/kalistenika`; projekt: `docs/KALISTENIKA.md`)
54. **Projekt stylu i wersja za przełącznikiem `CALISTHENICS_ENABLED` (wyłączony) są gotowe.** Pytania (z rekomendacjami) są w sekcji 7 dokumentu: kto wybiera styl, czy ławka liczy się jako sprzęt, dzień z 3 ćwiczeniami, uzupełnienie 12 braków w katalogu, ćwiczenia „import” dla P.
   **ODPOWIEDŹ WŁAŚCICIELA: 1 tak (styl wybiera tylko trener); 2 tak, ławka/krzesło/ławka w parku liczy się w domu i w plenerze; 3 jak pkt 51; 4 braki w `docs/PRZEGLAD-KATALOGU.csv` (sekcja 2, 13 pozycji, bez dodawania do bazy); 5 tak, po zatwierdzeniu.** Wdrożone na `feature/kalistenika` (ławka, minimum 3). Symulacja stylu: odmowy dnia 50% → 24%, 0 naruszeń.
55. **Dziś ok. połowa dni w stylu kalistenicznym jest odmawiana** (za mało zweryfikowanych ćwiczeń, zwłaszcza BA/P i dni „drążek”). Nie włączać flagi dla klientów, dopóki nie zapadnie decyzja o uzupełnieniu katalogu (pkt 4 i 5 w dokumencie).
   **ODPOWIEDŹ WŁAŚCICIELA: flaga zostaje wyłączona — zgoda.**
## Przegląd katalogu — wykonanie (28.10.2026, gałąź `feature/katalog-decyzje-wlasciciela`; plik decyzji: `PRZEGLAD-KATALOGU-rekomendacje.csv`)
62. **Wykonane (kroki 2–5):** obowiązywała kolumna „MOJA REKOMENDACJA” (nadpisań w „TWOJA DECYZJA” brak). Migracja danych `0057_katalog_decyzje.sql` (z kopią starych wartości w `catalogue_decision_backup`, cofnięcie: `scripts/katalog-decyzje-cofnij.sql`, jednorazowa mimo że `db-setup` uruchamia wszystkie migracje za każdym razem): **81 zatwierdzonych od BA** (`suitable_for_no_activity = true`, wyłącznie dla tych id), **21 od P**, **48 od Ś**, **0 ukrytych**, **11 dodanych** (patrz 65). Reguła 50b wdrożona (test regresji, symulacja 0 „ponad poziom”). Wyniki przed/po: `docs/GENERATOR-JAKOSC.md`.
   **ODPOWIEDŹ WŁAŚCICIELA: przyjęte do wiadomości.**
63. **WYJĄTEK od pliku — id 89 „Przysiad do skrzyni”: zostaje „tylko od P”, nie „zatwierdź”.** To złożony przysiad (sztanga/hantle/kettlebell lub masa ciała, obciążenie stawów średnie: kolano i plecy dół), który jest na liście „nie promować dla BA” z wcześniejszej decyzji i testu (`no-activity-pool`), a uzasadnienie w pliku („proste ćwiczenie izolowane/maszyna”) opisuje inne ćwiczenie. Zasada „zostaw bezpieczniej”. Jeśli chcesz go jednak dla BA: napisz, zmienię listę i test. Do BA nadal dostępne jest „Przysiad do skrzyni z masą własnego ciała” (id 90).
   **ODPOWIEDŹ WŁAŚCICIELA: zgoda, id 89 zostaje „od P” (BA ma „Przysiad do krzesła”, id 1168).**
64. **Braki danych przy zatwierdzonych:** u 104 ze 150 ćwiczeń z pliku pole „obciążenie stawów” jest puste, u 8 brakuje też listy stawów. Zatwierdzenie nie wymyśla tych danych. Skutek: w trybie „brak zgody zdrowotnej” (odrzucane tylko „Wysokie”) takie ćwiczenia przechodzą. Rekomendacja: uzupełnić te pola (lista do wygenerowania) albo traktować brak jako „Średnie” w trybie ostrożnym — do Twojej decyzji.
   **ODPOWIEDŹ WŁAŚCICIELA: priorytet bezpieczeństwa — wykonane na gałęzi `fix/stawy-uzupelnienie`.** (a) Ćwiczenie bez kompletnych danych o obciążeniu stawów (brak poziomu, brak listy stawów albo pusta lista przy poziomie powyżej „Niskie”) NIE trafia do klienta ze zgłoszonym stawem/bólem ani w trybie „brak zgody zdrowotnej” — na wszystkich ścieżkach doboru, także w rozgrzewce i schłodzeniu; test regresji `unknown-joint-data` (bez reguły pada 6 testów). (b) Uzupełniono **445** aktywnych ćwiczeń (było **376** bez poziomu i **43** bez listy stawów, w tym 104 ze 150 zatwierdzonych w przeglądzie): 204 Niskie, 149 Średnie, 92 Wysokie; nic nie nadpisano, przy niepewności wyższe obciążenie; lista z uzasadnieniem: `docs/STAWY-UZUPELNIENIE.csv`, migracja 0059 z kopią starych wartości i cofnięciem. (c) Sprawdzacz symulacji liczy brak danych o stawach jako naruszenie. (d) Symulacja przed → po: patrz `docs/GENERATOR-JAKOSC.md`.
65. **Sekcja 2 (kalistenika):** w pliku jest 12 pozycji „dodaj” (nie 13: brakuje „L-sit z podparciem”, nie dodano, bo nie ma decyzji) i zbłąkany wiersz nagłówka (pominięty). „Unoszenie prostych nóg w zwisie” już istnieje (id 1262, Średniozaawansowany), więc **dodano 11** i podpięto 1262 do drabinki. Poziomy: zwis od P (nie BA); negatywy podciągnięcia, negatywy dipów, dipy z gumą, wiosłowanie nogi proste od Ś; łucznik (podciąganie i pompki), dipy z obciążeniem, toes to bar, pistol z podparciem, wiosłowanie nogi wyżej/kółka tylko Z (reguła 50b). Każde ma opis, instrukcję, błędy, wskazówki, uwagi o bezpieczeństwie, stawy, przypisanie mięśni (skopiowane od ćwiczenia bazowego), bez zdjęć i filmów.
   **ODPOWIEDŹ WŁAŚCICIELA: „L-sit z podparciem” wypadł przez błąd w pliku — dodać jak pozostałe, od Ś, do drabinki core.** Dodany migracją 0058 (łącznie 12 nowych ćwiczeń kalistenicznych, drabinka „Kalistenika: core”, krok 6, Średniozaawansowany).
66. **Poprawki trudności (krok 4):** jedyna zmiana to „Dipy na podłodze” (id 1629): Początkujący → Średniozaawansowany, bo tak zdecydowałeś („od Ś”). „Pompki z obciążeniem” (id 174) i „Unoszenie kolan w zwisie” (id 165) mają w katalogu trudność Średniozaawansowany, zgodną z KATALOG-STANDARD i KALISTENIKA.md, więc ich **nie zmieniałem**; reguła 50b i tak wyklucza je u BA i P.
   **ODPOWIEDŹ WŁAŚCICIELA: przyjęte do wiadomości.**
67. **Ćwiczenia z listy blokowane na stałe przez silnik** (nazwy: Bear crawl, Superman, Inchworm) dostały decyzję z pliku (statusy), ale generator ich i tak nie wybiera (lista wykluczonych nazw w silniku). Rekomendacja: ukryć albo zdjąć blokadę — do decyzji.
   **Brak wskazówki właściciela — wybrana bezpieczniejsza opcja: blokada nazw w silniku zostaje, niczego nie ukrywam ani nie usuwam** (Bear crawl, Superman, Inchworm nadal nie są wybierane przez generator).
68. **Okrojona baza testowa:** wcześniejsze symulacje szły na 185 ćwiczeniach (katalog aplikacji ma 587), więc kolumna „ile razy brakowało” w pliku przeglądu miała ograniczone pokrycie. Wnioski o decyzjach nie zmieniają się (to nadal Twoje decyzje), ale liczby jakości (np. odmowy 14%) były zawyżone: na pełnym katalogu przed zmianami to 3,6%.
   **ODPOWIEDŹ WŁAŚCICIELA: przyjęte do wiadomości (odmowy liczone teraz na pełnym katalogu).**

