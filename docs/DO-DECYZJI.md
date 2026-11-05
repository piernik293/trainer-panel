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


## Z nocy przed betą — blok 3 (`qa/pierwsze-minuty`)
- **N3-1. Wywiad wpisywany przez trenera (ścieżka C) był ślepym zaułkiem:** „Rozpocznij Wywiad” / „Wypełnij Wywiad Treningowy” prowadziły do pustego ekranu „Klient nie wypełnił jeszcze wywiadu treningowego.”. Na gałęzi: dla klienta bez wywiadu od razu otwiera się formularz (tytuł „Wywiad Treningowy”, przycisk „Zapisz wywiad”). Mała zmiana zachowania widoczna dla trenera, odwracalna. **Czy zostawić?** (Rekomendacja: tak.)
- **N3-2. Nowe konto trenera nie ma drogi do dostępu** (ekran „To konto nie ma jeszcze dostępu trenera… Napisz do nas” bez adresu i przycisku; portal dla konta bez klienta nie pokazuje karty „Prowadzę podopiecznych”). Nie zmieniałem. **Do decyzji:** w becie zamkniętej konta trenerów zakłada właściciel (wtedy wystarczy dopisać adres kontaktowy do tego ekranu — jaki?), czy mamy dodać przycisk „Poproś o dostęp”?
- **N3-3. Panel trenera ma logowanie po angielsku.** Poprawka = dodanie `@clerk/localizations` do panelu (pakiet już jest w portalu; zmiana `package.json`/lockfile). Nie robiłem (zmiana pakietów). **Czy dodać?**
- **N3-4. Plank i inne ćwiczenia izometryczne w planie jako „12–15 powtórzeń”** (brak `default_duration_seconds` w danych). Dane katalogu — nie zmieniałem. **Czy uzupełnić czasy?** (osobna migracja danych z kopią.)
- **N3-5. Limity planu Free w becie:** 1 automatyczny plan miesięcznie i 3 klientów. Trener to odkrywa dopiero przy drugim kliencie. Nie zmieniałem limitów. **Czy beta ma dostać wyższy limit albo ostrzeżenie na starcie?**
## Z nocy przed betą — blok 5 (monitoring, gałąź `ops/monitoring`)
- **N5-1. Straż nie jest włączona w cronie.** Skrypt leży na gałęzi i zadziała po scaleniu; wpis do crona zapisany w `CLAUDE.md`. Mail na `OWNER_NOTIFY_EMAIL` jest skonfigurowany, połączenie SMTP sprawdzone (bez wysyłania). **Czy włączyć po scaleniu?** (Rekomendacja: tak.)
- **N5-2. Maszyna bywa wyłączona** (uruchomiona od 27.10 23:58; kopia z 27.10 03:15 nie powstała). Wtedy ani kopia, ani straż nie działają. **Do decyzji:** (a) dopisać do crona `@reboot` z kopią „jeśli dziś jeszcze nie było” (bezpłatne), (b) zewnętrzne sprawdzanie dostępności (np. darmowa usługa z limitem — wymaga Twojej zgody, bo to nowa usługa), (c) zostawić.
- **N5-3. Test przywracania kopii był zbyt surowy** (porównywał liczby z bazą „na żywo”, więc po każdej zmianie schematu dawał błąd). Teraz różnice „baza ma więcej niż kopia” są tylko opisane; błędem jest brak tabeli, pusta tabela kluczowa albo więcej tabel w kopii niż w bazie. To zmiana skryptu testu, nie kopii.
## Z nocy przed betą — blok 4 („Zgłoś uwagę”, gałąź `feature/zglos-uwage`)
- **N4-1. Flaga `FEEDBACK_ENABLED` jest wyłączona** (nie włączałem). Po scaleniu: migracja 0062 (nowa tabela `user_feedback`) zastosuje się sama przy `scripts/db-setup-gcp.sh` (addytywna; przed nią backup). Do włączenia w becie: `FEEDBACK_ENABLED=1` w `.env` + restart API. **Czy włączyć na start bety?** (Rekomendacja: tak — to najtańszy sposób na zbieranie uwag.)
- **N4-2. Uwaga ze słowami o zdrowiu jest odrzucana** (jak w dzienniku błędów — ochrona danych): komunikat „Wygląda na to, że uwaga zawiera dane zdrowotne. Opisz sprawę bez nich.” Lista słów jest szeroka (np. „lekko”, „ból”); możliwe fałszywe odrzucenia. **Akceptujesz, czy zawęzić listę?**
- **N4-3. Brak kontaktu zwrotnego:** zapisujemy tylko skrót autora i rolę, bez e-maila — nie da się odpowiedzieć osobie. **Czy dodać opcjonalne pole „Chcę odpowiedź” (zapisuje e-mail z konta)?**
- **N4-4. Limit:** 5 uwag na godzinę na osobę (próby odrzucone też się liczą). **Czy wystarczy?**
- **N4-5. Mail do właściciela** idzie na `OWNER_NOTIFY_EMAIL`, a gdy pusty — `ADMIN_EMAIL`. Bez SMTP nie jest wysyłany (uwagi są i tak w panelu administratora). Mail nie zawiera adresu autora.
## Osiągnięcia (28.10.2026, gałąź `feature/osiagniecia`; projekt: `docs/OSIAGNIECIA.md`)
56. **Projekt i silnik za przełącznikiem `ACHIEVEMENTS_ENABLED` (wyłączony) są gotowe.** Pięć pytań z rekomendacjami jest w sekcji 5 dokumentu: cel tygodnia (wszystkie dni planu), ochrona serii (1 tydzień na 6), urlop/choroba (kto i na ile), wyzwanie miesięczne (opcjonalne, domyślnie wyłączone), powiadomienia poza aplikacją (na razie nie).
   **ODPOWIEDŹ WŁAŚCICIELA: wszystkie 5 rekomendacji zatwierdzone** (cel tygodnia = wszystkie dni planu; ochrona serii 1 tydzień na 6; urlop/choroba: podopieczny i trener, do 4 tygodni jednorazowo, dłuższe tylko trener; wyzwanie miesięczne opcjonalne i domyślnie wyłączone; powiadomienia poza aplikacją na razie nie) — tak jak wdrożone. **Dodatkowo teksty bez płci:** przejrzane wszystkie teksty portalu, lista zmian w `docs/TEKSTY-PLEC.md`, strażnik w testach.
57. **Migracja 0056 (dwie nowe tabele) jest zastosowana tylko w bazie testowej** (backup `~/backups/trainer_panel_przed_0056_*`). Do bazy aplikacji trafi przy scaleniu gałęzi.

## Ekrany Solo i „Postępy” (28.10.2026, gałąź `feature/solo-ekrany`; zrzuty: `docs/screens/solo/`)
58. **Prototyp do oceny**: dolny pasek Dziś · Plan · Postępy · Ty, ekrany Postępy i Ty, start Solo. Za flagami (wyłączone). Wygląd i układ zatwierdzasz Ty — to nowa nawigacja.
   **ODPOWIEDŹ WŁAŚCICIELA: kierunek zatwierdzony; poprawki wykonane na `feature/solo-ekrany`:** „Dziś” — kroki tylko jako mały wiersz z polem (wykres tylko w „Postępach”); „Ty” — jeden napis „Prowadzę podopiecznych”; linki w „Dokumentach” min. 44 px (zmierzone: 44 px); teksty bez płci (jak 56). Nowe zrzuty w `docs/screens/solo/`. Bez scalania.
59. **Solo nie jest jeszcze domknięte**: brak serwerowego „sterownika” generowania planu dla osoby bez trenera (opisane w bloku 11), więc po starcie Solo ekran uczciwie mówi „wkrótce” zamiast prowadzić do wywiadu. Reszta (reguły Solo, filtry bezpieczeństwa) jest gotowa.
   **ODPOWIEDŹ WŁAŚCICIELA: sterownik Solo PO przeglądzie katalogu; teraz tylko krótki plan.** Plan: `docs/SOLO-STEROWNIK.md`.
60. **Przy włączonej fladze krótki „mignięcie” klasycznego widoku** zanim portal odczyta flagi (jedno zapytanie). Przy wyłączonych flagach nic się nie zmienia. Rekomendacja: zostawić do czasu zatwierdzenia wyglądu; potem flagi czytać razem z planem.
   **ODPOWIEDŹ WŁAŚCICIELA: zgoda na rekomendację** (flagi czytać razem z planem po zatwierdzeniu wyglądu; do tego czasu bez zmian).
61. **Drabinki kalisteniczne** (`feature/kalistenika`) dołączą do liczenia awansów po scaleniu obu gałęzi.
   **ODPOWIEDŹ WŁAŚCICIELA: OK.**
   **ODPOWIEDŹ WŁAŚCICIELA: migracja 0056 przy scaleniu — zgoda (pg_dump przed).** Backup przed scaleniem zrobię przy scalaniu gałęzi; do tej pory migracja tylko w bazie testowej.

## Decyzje właściciela po raporcie „Pierwsze minuty” i scaleniach (29.10.2026)
**ZGODA:** scalenie gotowych gałęzi (A1–A6): opisy 140 ćwiczeń (0061 zatwierdzone), `qa/pierwsze-minuty` w tym N3-1, `ops/monitoring` + wpis straży do crona + 1 mail testowy, `feature/zglos-uwage` (flaga `FEEDBACK_ENABLED` wyłączona), kalistenika/osiągnięcia/Solo (0056; flagi wyłączone), dokumenty. Poprawki „łatwe” B1–B7, „średnie” C1–C4 (ćwiczenia na czas, aktywacja po zapisie, krótszy wywiad dla BA/P, wartości z planu w treningu), D1–D2 (flaga `BETA_NO_LIMITS`, domyślnie wyłączona; uprzedzenie o limitach tylko gdy wyłączona). Na później (nie robić): propozycje 5, 8, 10, krótszy kreator. Nie wolno: włączać flag, usuwać danych/kont/gałęzi, zmieniać nazw ćwiczeń ani `suitable_for_no_activity`, ponosić kosztów, publikować strony.
- Odpowiedzi na pozycje z nocy: N3-1 zgoda (zostaje); N3-2 → B1 (przycisk „Poproś o dostęp trenera”); N3-3 → B2; N3-4 → C1; N3-5 → D1/D2; N4-1 flaga zostaje wyłączona; N5-1 zgoda (straż w cronie, wpisana 29.10 12:40).

### C1 — ćwiczenia na czas (29.10.2026, gałąź `feature/izometria`)
- Lista (9 ćwiczeń izometrycznych + 11 sprawdzonych, które zostają na powtórzenia z uzasadnieniem): `docs/IZOMETRIA.csv`. Reguła: czas z poziomu planu — Brak aktywności 15 s, Początkujący 20 s, Średniozaawansowany 30 s, Zaawansowany 45 s (dolne końce widełek z polecenia; widełki 15–20 / 20–30 / 30–45 / 45–60 s zostają jako zakres progresji); L-sit i V-sit nie dłużej niż ich domyślny czas (10–15 s).
- Wykonanie: migracja 0063 — kolumna `exercises.is_timed`, kolumna `set_logs.duration_seconds`, wyzwalacz w bazie (każde ćwiczenie izometryczne w planie dostaje typ „czas”, także przy ręcznej zmianie na powtórzenia), jednorazowe przeliczenie istniejących planów z kopią w `isometry_backup`; cofnięcie: `scripts/izometria-cofnij.sql`. Dodanie kolumn i wyzwalacza to zmiana schematu (addytywna) — w zakresie zgody C1.

### C3 — krótszy wywiad (29.10.2026, gałąź `feature/wywiad-krotszy`)
- Dla poziomu efektywnego „Brak aktywności” i „Początkujący” (liczonego z regułą 2 lat) pomijamy: „Ćwiczenia preferowane”, „Partie priorytetowe” i drugi ekran o cardio („Jak uwzględnić cardio w planie?”; zostaje „Jak często wykonujesz cardio?”). Generator wybiera sam; brak odpowiedzi o cardio = domyślnie cardio w planie (tak jak przy braku odpowiedzi do tej pory). Pytania o zdrowie, ból, stawy i zgodę bez zmian.
- „Wzrost i waga”: pole „Wolę nie podawać wzrostu i wagi”; API przyjmuje ankietę bez wzrostu i wagi (podane nadal sprawdzane w widełkach), status ankiety „Wypełniona” nie zależy już od tych pól. Generator nie używa wzrostu ani wagi (sprawdzone: brak odwołań w silniku). BMI w panelu pokazuje się tylko, gdy dane są.
- Ekrany początkującego: 22 → 19. Zmieniono testy opisujące stare zachowanie (22 ekrany, jedna partia priorytetowa dla początkującego, podpowiedź „favBeginner” bez ekranu).

### D1/D2 — beta bez limitów (29.10.2026, gałąź `feature/beta-bez-limitow`)
- Flaga `BETA_NO_LIMITS` (domyślnie WYŁĄCZONA, w `.env.example`): po ustawieniu `1` i restarcie API trenerzy mają limity „Unlimited” (klienci, plany automatyczne, własne ćwiczenia), podsumowanie pokazuje „Wersja beta — bez limitów” i nie proponuje planów; administrator bez zmian. **Nie włączałem** (zasada: flagi włącza właściciel).
- D2: przy pierwszej wizycie na pulpicie (plan Free, flaga wyłączona) karta „Plan Free: do 3 klientów, 1 automatyczny plan miesięcznie i do 10 własnych ćwiczeń. Ręczne plany i ich edycja są bez limitu.” z przyciskiem „Rozumiem”. Przy okazji: „Osiągnąłeś limit klientów” → „Osiągnięto limit klientów” (bez formy zależnej od płci).

### PILNE: poprawka po scaleniu `feature/solo-ekrany` (29.10.2026)
- Strona podglądu Solo (`pages/solo-preview.tsx`) podmieniała `window.fetch` już przy imporcie, a `App.tsx` importuje ją zawsze — po scaleniu wszystkie wywołania `/api/*` w portalu klienta zwracały atrapę 404 (portal był niesprawny dla klientów od scalenia do tej poprawki; testy API i test dymny tego nie wykrywają, bo nie uruchamiają przeglądarki). Wykryte przy ponownym pomiarze „pierwszych minut”. Poprawka: podmiana tylko na ścieżce `/solo-preview` w trybie dev + test pilnujący tego. Błąd był w gałęzi `feature/solo-ekrany` z nocy (nie w dzisiejszych zmianach).

## Decyzje właściciela z 29.10.2026 (po scaleniach)
1. **Flagi włączone w `.env`:** `FEEDBACK_ENABLED=1`, `BETA_NO_LIMITS=1`, `CALISTHENICS_ENABLED=1`, `ACHIEVEMENTS_ENABLED=1`. **Zostają wyłączone:** `SOLO_ENABLED`, `CONDITIONING_ENABLED`. Kopia `.env` sprzed zmiany: `~/backups/env-przed-flagami-*.bak` (prawa 600).
2. **N5-2:** wpis `@reboot` w cronie → `scripts/backup-if-missing.sh` (po 2 min od startu, jeśli dziś nie ma kopii dziennej, robi ją `backup-db.sh`). Bez nowych usług.
3. **N3-2:** adres kontaktowy w konfiguracji (`CONTACT_EMAIL` w `.env`, teraz `TU_ADRES`), pokazywany na ekranie „Poproś o dostęp trenera” przez `GET /api/contact`; wartość bez „@” = nieustawiony (nic się nie pokazuje). **Do uzupełnienia:** wpisz prawdziwy adres w `.env` i zrestartuj API.

### Potwierdzenie decyzji (29.10.2026, druga wiadomość)
- Pkt 1 (flagi) i 2 (`@reboot` z kopią) — wykonane wcześniej, bez zmian.
- **N3-2 zmiana:** `CONTACT_EMAIL` w `.env` jest **pusty** (zamiast szablonu `TU_ADRES`); wtedy ekran „Poproś o dostęp trenera” pokazuje tylko przycisk. Adres właściciel poda później — wpisać w `.env` i zrestartować API.

## Jedno logowanie (U1/U2) — wykonane 2.11.2026, gałąź `feature/jedno-logowanie`
- Stare → nowe: dwa wejścia („Panel trenera” i „Portal klienta”) → jedna strona „Zaloguj się do Optimatren” (`/sign-in`); po zalogowaniu serwer kieruje wg roli (panel / portal / zablokowany); konto bez trenera zamiast „Klient nie znaleziony” widzi „Witaj w Optimatren — połącz się z trenerem”; przełącznik [Mój trening] [Podopieczni] w panelu i portalu. Wygląd: zdjęcie siłowni jako przyciemnione tło całej strony, formularz na środku (także 1440 px), logo i nazwa nad nim.
- Poprawka błędu znalezionego w teście: podopieczny zaakceptowany jako trener nie mógł otworzyć panelu (`CLIENT_ACCOUNT`) — teraz może (zasada „bez akceptacji nie ma trenera” bez zmian).
- **Do decyzji:** (1) trener bez własnego konta podopiecznego nie ma co przełączać — przełącznik pokazuje się dopiero, gdy ma wiersz klienta (przy włączonym Solo można mu go zakładać automatycznie; teraz Solo jest wyłączone); (2) strona rejestracji jest wspólna — ludzie z linku od trenera nadal najlepiej rejestrują się przez link (ekran zaproszenia), nie przez `/sign-up`.

## Decyzje właściciela z 2.11.2026: „Mój trening” i rejestracja
1. Po akceptacji wniosku trener automatycznie dostaje profil „Mój trening” (własny podopieczny, bez trenera prowadzącego); dotyczy też obecnych trenerów (migracja 0064 po `pg_dump`). Szczegóły i zasady: `docs/KONTA.md`. Uwaga: panel administratora w liczbie klientów trenera pokazuje też ten profil (do poprawienia, jeśli będzie przeszkadzać).
2. Rejestracja zostaje jak jest (wspólne `/sign-up`).

## Logowanie bez zniechęcania + „Zobacz, jak to działa” (2.11.2026)
- Diagnoza w `docs/LOGOWANIE.md`: kod przy logowaniu hasłem pojawia się na NOWYM urządzeniu (Clerk Client Trust / Device Trust) — to właściciel wyłącza w dashboardzie Clerk (instrukcja w pliku; ustawień Clerk nie zmieniałem). Rejestracja e-mailem: kod raz (zostaje).
- Zmiany: Google jako pierwszy i największy przycisk, krótkie teksty, zdanie o kodzie przy rejestracji, „Nie pamiętam hasła”. Tryb podglądu bez konta za flagą `GUEST_DEMO_ENABLED` — **włączona w `.env`** (ZGODA właściciela do testów); kopia `.env` w `~/backups/env-przed-demo-*.bak`.
- **Do decyzji:** po wyłączeniu Client Trust zostaje ryzyko samego hasła (opisane w 1 zdaniu w `docs/LOGOWANIE.md`).

## Solo jako podstawa konta (2.11.2026) — decyzje i do potwierdzenia
- **Limit planów Solo:** 1 nowy plan na 14 dni (rozsądny limit zgodnie z poleceniem; zapis w `workout_plans.created_by='solo'`); przy `BETA_NO_LIMITS=1` bez limitu. **Czy 14 dni?**
- **Dawkowanie Solo v1** z silnika, bez ręcznego bilansu objętości trenera (uproszczenie opisane w `docs/SOLO-STEROWNIK.md`).
- **Odmowa dnia:** dzień bez wystarczającej liczby bezpiecznych ćwiczeń jest pomijany (plan ma krótszy tydzień); gdy żaden dzień się nie uda: „Połącz się z trenerem — ułoży plan ręcznie”. W symulacji 3,6% dni.
- **Zgoda na historię:** domyślnie niezaznaczona; mechanizm (archiwum wywiadów i bólów + data widoczności planów i treningów) — patrz `docs/KONTA.md`; do dokończenia pełny przegląd tras trenera.
- **Konto Solo z danymi + link od trenera:** nie łączy automatycznie (żeby nie zgubić danych) — dostaje wskazówkę o kodzie; konto puste łączy się samo.
- **S6: `SOLO_ENABLED=1` włączone w `.env`** (ZGODA właściciela po zielonych testach). `CONDITIONING_ENABLED` zostaje wyłączone.
- Uwaga operacyjna: uruchamianie `scripts/db-setup-gcp.sh` na bazie TESTOWEJ wykonuje migracje danych (0064) na pozostałych fixturach i psuje testy — po takim uruchomieniu skasuj wiersze „Mój trening” w bazie testowej.

## Odpowiedzi właściciela po Solo (3.11.2026)
- **Limit planów Solo 1 na 14 dni — ZATWIERDZONY.** **Dawkowanie Solo v1 z silnika — ZATWIERDZONE.** **Link od trenera dla konta Solo z danymi: zostaje podpowiedź kodu, bez automatycznego łączenia — ZATWIERDZONE.**
- **Ukrywanie historii — DOKOŃCZONE (blok 0, `fix/solo-domkniecie`).** Przegląd wszystkich odczytów trenera i administratora. Bez zgody niewidoczne: wywiady i zgłoszenia bólu (archiwum), plany (lista, szczegóły i wszystkie podtrasy przez wspólne sprawdzenie planu, historia, ostrzeżenia stawów, podgląd portalu), treningi (dwa widoki sesji, rekordy), kroki, kondycja (logi i check-iny), przerwy, raport miesięczny (PDF), pulpit i skrzynka uwag, wgląd administratora. Dane dzienne (kroki, przerwy, raport) są widoczne od dnia następnego po połączeniu (nie mają godziny). Test izolacji dla każdej trasy: `solo-historia.test.ts`.
- **Testy odporne na „Mój trening” z migracji 0064:** `globalSetup` testów API czyści te wiersze w bazie testowej przed przebiegiem (tylko `*_test`), więc `db-setup-gcp.sh` na bazie testowej nic nie psuje.

## Maile przy wniosku trenera (blok 1, 3.11.2026)
- **Diagnoza:** wysyłka z serwera działa (test: serwer wysłał 1 mail „Nowy wniosek o konto trenera (test)” na `OWNER_NOTIFY_EMAIL`; połączenie i logowanie SMTP w porządku). Wniosek ShiiFuu zapisał się poprawnie (status „oczekuje”); kod przy wysyłce **nie zostawiał w logu żadnego śladu** (ani sukcesu, ani porażki, ani braku konfiguracji), a log serwera sprzed restartu jest już skasowany — dlatego nie da się ustalić, czy mail zaginął po drodze (np. spam), czy wysyłka nie zadziałała. Jeśli testowy mail doszedł (sprawdź także spam), to najbardziej prawdopodobny jest folder „Spam” albo chwilowy błąd SMTP.
- **Naprawione:** każda wysyłka loguje wynik (bez adresów i haseł), wiadomość do właściciela zawiera imię i e-mail wnioskodawcy oraz notatkę, adres bierze z `OWNER_NOTIFY_EMAIL`, a gdy pusty z `ADMIN_EMAIL`. Po akceptacji mail „Twoje konto trenera jest aktywne — zaloguj się”, po odrzuceniu krótka odmowa z możliwością ponownego wniosku za 14 dni (test z atrapą SMTP). W panelu administratora karta „Wnioski (N)” z licznikiem i otwarcie od razu na niej, gdy są nowe. Wniosku ShiiFuu nie rozpatrywałem.

## Okres próbny trenera (blok 7, 3.11.2026)
- **Zasada:** po akceptacji wniosku trener ma 14 dni pełnego dostępu (daty w `trainers.trial_started_at/trial_ends_at`, migracja 0066, addytywna). Obecni trenerzy dostali 14 dni liczone od dnia migracji. Po terminie obowiązuje ich pakiet (domyślnie Free: 3 podopiecznych, 1 plan, 10 własnych ćwiczeń); dane trenera i podopiecznych nigdy nie są blokowane ani usuwane — limit dotyczy tylko dodawania nowych rzeczy.
- Pakiet ustawiony ręcznie przez administratora (Pro/Unlimited) wyłącza okres próbny i jego komunikaty. `BETA_NO_LIMITS=1` nadal znosi wszystkie limity, komunikaty o okresie próbnym są wtedy ukryte.
- Administrator: w zakładce Trenerzy widać datę końca okresu próbnego, przycisk „Przedłuż o 14 dni” (od końca, jeśli trwa; od dziś, jeśli minął) i „Ustaw pakiet”.
- **Wybrałem (do potwierdzenia):** dni liczone w górę (ostatni dzień = „1 dzień”); w ostatnich 3 dniach komunikat w ciepłym, nie czerwonym kolorze. Solo: bez żadnych tekstów o płatności; limit planu to „Nowy plan możesz ułożyć za X dni — ciało potrzebuje czasu na efekty.”

## Wywiad: cardio (blok 2, 4.11.2026)
- Jedno pytanie „Czy chcesz uwzględnić cardio w planie?” — Tak / Nie, pod spodem tylko „Możesz to zmienić później.” Usunięte: „Jak często wykonujesz cardio?”, „Tylko niezbędne minimum” i teksty namawiające/uspokajające. To samo w wywiadzie wpisywanym przez trenera.
- **Nie** = brak rekomendacji cardio, kroków i elementów kondycyjnych, także przy celu Redukcja (trener może dodać ręcznie). **Tak** = jak dotąd.
- Starsze wywiady: „Tylko niezbędne minimum” / „Wolę ograniczyć…” / „Nie wykonuję cardio” → Nie; reszta → Tak; nowa odpowiedź Tak/Nie ma pierwszeństwo przed starym polem częstotliwości. Dane w bazie nie są zmieniane (mapowanie przy odczycie, `wantsCardio` w `lib/survey-config`).
- **Do potwierdzenia:** osoby początkujące i bez aktywności nadal nie widzą tego pytania (skrócony wywiad), więc u nich cardio zostaje domyślnie „Tak”, jak dotąd.

## Wywiad: partie priorytetowe jako kafelki (blok 3, 4.11.2026)
- Kafelki (max 3, pytanie dalej opcjonalne, nadal pomijane dla „Brak aktywności” i „Początkujący”): Nogi · Pośladki · Plecy · Klatka · Barki · Ręce · Brzuch. Mapowanie w `lib/survey-config`: Ręce = biceps + triceps, Nogi = uda + łydki, reszta 1:1. **Przedramion nie ma w katalogu partii**, więc „Ręce” ich nie obejmują — do decyzji, jeśli mają być osobno.
- W bazie zapisuje się etykieta kafelka w istniejących polach `priority_muscle_1..3` (bez zmiany schematu); generator rozwija ją do partii (kolejność priorytetu zachowana: kafelek 1 = tier A). Starsze wywiady z pojedynczymi partiami (np. „uda”) działają bez zmian, a w formularzach pokazują się jako kafelek.
- Ten sam wybór kafelków w formularzu trenera.

## Jakość planu (blok 4, 4.11.2026)
- **Jeden wzorzec na dzień:** warianty tego samego ruchu (dipy na poręczach i na ławce, dwa rodzaje pompek, dwa podciągania, dwa martwe ciągi, dwa przysiady lub dwa wykroki) nie trafiają do jednego dnia (`services/exerciseFamily.ts`, rodzina z nazwy ćwiczenia — nazw w katalogu nie zmieniałem). Szersze wzorce (np. wiosłowanie i wiosłowanie drugim sprzętem, wyciskanie poziome i skośne) zostają dozwolone jako zwykła objętość na partię. Metryka symulacji „duplikaty wzorca w dniu” (`stat.patternDupDays`): 150 profili, seed 21 — standard 121 dni → 8, kalistenika 131 → 27.
- **Wyjątek (do decyzji):** dom bez sprzętu, poziom „Brak aktywności”/„Początkujący”, dzień pchania — jedyne bezpieczne ćwiczenia pchające to stopnie pompek; wtedy dzień zawiera dwa ich warianty, bo inaczej miałby mniej niż 3 ćwiczenia i byłby odrzucony. Wolę taki dzień niż pusty; można go zmienić na odrzucenie dnia.
- **Zakresy powtórzeń zależą od ćwiczenia** (`refinePrescription`): negatywy 3 × 3–5 (przerwa 150 s), wiosłowanie 8–12, łydki 12–20, dipy i podciąganie 6–10, trudne stopnie (z obciążeniem, jednonóż) 5–8; rdzeń, skoki i ćwiczenia na czas bez zmian; początkujący zachowują bezpieczną bazę (poza negatywami, łydkami i wiosłowaniem).
- **Nazwy dni wg akcentu** w planach Solo: „Drążek i poręcze”, „Nogi i skoki”, „Góra ciała”… (powtórzenia dostają A/B); sprzęt w nagłówku dnia generatora (kalistenika) tylko ten, który dzień naprawdę wykorzystuje. Plany układane ręcznie przez trenera mają nazwy od trenera — bez zmian.
- **„Zapisywanie…” w portalu:** przyczyna — po tymczasowym błędzie (błąd serwera, wygasła sesja) kolejka zapisów czekała do następnego zdarzenia „online”, więc etykieta wisiała bez końca, a ikona braku sieci pokazywała się także online. Teraz: ponawianie co 15 s i po powrocie do aplikacji, kółko zamiast ikony braku sieci, po 20 s „Ponawiam zapis — dane są bezpieczne na telefonie”. Ikona braku sieci tylko offline.

## Metody intensyfikacji (blok 5, 4.11.2026)
- Projekt w `docs/METODY.md`, 5 pytań z rekomendacjami (Solo bez rest-pause/upadku; drop sety dla Ś na maszynach; „Dobierz za mnie” przy Sile bez metod; nowe kolumny w modelu planu; drop set i rest-pause jako +1 seria). Do czasu odpowiedzi blok 6 używa rekomendacji jako założenia i nie jest scalany.

## Metody intensyfikacji — wdrożenie próbne (blok 6, gałąź `feature/metody`, NIE scalona)
- Za flagą `METHODS_V2_ENABLED` (domyślnie 0, wpis w `.env.example`; w `.env` nie włączana). Zrobione: kafelki w wywiadzie portalu (Solo: tylko Superserie i Drop sety), dobór metod w generatorze (`services/methods.ts`) wg `docs/METODY.md` z założeniem rekomendacji z pytań 1–5, „Metody do unikania” respektowane, zapis w planie (migracja `0067_metody.sql` — nowe kolumny: `surveys.preferred_methods`, `workout_plan_exercises.method/method_group/method_note`), para ćwiczeń obok siebie, opis „Dlaczego?” w podglądzie dnia w portalu, status `/api/methods/status`.
- **Nie zrobione (do dokończenia po akceptacji):** pole metod w formularzu wywiadu trenera i opcja „Dobiorę sam”, edycja metody w edytorze planu trenera, wspólny ekran pary w „Dziś”, korekta analizatora objętości (+1 seria przy drop secie i rest-pause).
- **Odstępstwo od projektu:** reguła „nigdy w pierwszym tygodniu cyklu” nie jest zakodowana — plan jest taki sam co tydzień; zamiast tego do ustalenia, czy metody mają się włączać od drugiego tygodnia (np. w ekranie „Dziś”).
- Migracja 0067 zastosowana tylko w bazie testowej (kopia przed: `~/backups/trainer_panel_test_przed_0067_*`). Przed scaleniem: kopia bazy aplikacji i `scripts/db-setup-gcp.sh`.

## Zmienność planów i „Zamień na inne” w Solo (4.11.2026)
- **Zmienność:** wśród równorzędnych kandydatów, którzy przeszli wszystkie filtry bezpieczeństwa, wybór zależy od ziarna z konta (id klienta) i numeru planu tego konta (`services/variation.ts`): ćwiczenia główne z 3 najlepszych, dodatkowe z 12 najlepszych, rozgrzewka i schłodzenie losowo wśród trafnych dla partii dnia. Bez ziarna zachowanie jak dawniej. Pomiar: 200 par identycznych profili (Solo, seed 5), pokrycie = zgodność ćwiczeń planu (Jaccard): wcześniej 100% → teraz 49% średnio (mediana 48%), rozgrzewka 100%→40%, schłodzenie 100%→14%, pojedynczy dzień 100%→29%. 0 naruszeń bezpieczeństwa i wykonalności. Pozostałe pokrycie to głównie profile z małą pulą (dom bez sprzętu).
- **Solo — zamiana ćwiczenia:** przycisk „Zamień na inne” w podglądzie dnia (portal), `POST /api/solo/plan-exercises/:id/swap`, limit 3 zamiany w ciągu 7 dni (tabela `solo_exercise_swaps`, migracja 0068, addytywna). Zamiennik pochodzi z tego samego silnika z regułami Solo (tylko zatwierdzone, bez ćwiczeń z bólem, filtry poziomu i sprzętu), tej samej partii, nie z ćwiczeń planu i bez dublowania wzorca w dniu; gdy brak bezpiecznego — komunikat, ćwiczenie zostaje i zamiana nie jest liczona.

## Metody — dokończenie bloku 6 (4.11.2026, po odpowiedziach właściciela)
- Zrobione: pole metod w formularzu trenera (kafelki + „Dobiorę sam”), edycja metody/pary/„Dlaczego?” w edytorze planu, para na ekranie „Dziś” (pierwsze ćwiczenie „bez przerwy — od razu: …”, baner z opisem), korekta objętości (+1 seria przy drop secie i rest-pause), wyjątek Siły (superserie na ćwiczeniach dodatkowych przy czasie do 45 min), pytanie o cardio dla wszystkich poziomów.
- Symulacja z flagą (200 profili, Solo i trener): 0 naruszeń bezpieczeństwa i wykonalności (w tym ≤2 metody w dniu, para obok siebie, Solo bez rest-pause/upadku/serii złożonych, brak martwego ciągu i sztangi nad głową).
- Nie zrobione: zmiana kolejności pary w edytorze przeciąganiem (numer pary wpisuje się ręcznie).

## Decyzje właściciela z 4.11.2026 — ZAMKNIĘTE
- **METODY.md:** pyt. 1 TAK (Solo bez rest-pause/upadku) · pyt. 2 TAK (drop sety dla Ś na maszynach) · pyt. 3: przy Sile bez metod, wyjątek — superserie tylko na ćwiczeniach dodatkowych przy krótkim czasie (zrobione, do 45 min) · pyt. 4 TAK (nowe kolumny planu) · pyt. 5 TAK (+1 seria przy drop secie i rest-pause).
- **Wyjątek pompek** dla początkujących w domu (dwa różne warianty w dniu pchania): OK.
- **Przedramiona poza kafelkiem „Ręce”:** OK.
- **Pytanie o cardio dla wszystkich poziomów:** OK; sprawdzone w kodzie — krok `cardioPref` w `surveyWizard.ts` nie ma warunku poziomu, więc widzą go także początkujący i nieaktywni.
- **Pozycje 39–45** (przegląd przed betą): zamknięte, zrobione 28.10; w kodzie potwierdzone: 39 okrąg „maskotka” ukryty (test `Training.test.tsx`), 41 nowy komunikat w `routes/public.ts`, 42 polskie nazwy dni (`soloPlanDriver`/`dayNaming`), 43 etykieta „Konto …” w `admin.ts`, 44 „Nie ma takiej strony” (`not-found.tsx`), 40 `TrainerApplyCard` użyty w koncie i na ekranie osoby bez trenera (`RoleRows`). Poz. 45 (dane QA w bazie) — nie usuwane, nadal wg `docs/BETA-START.md` pkt 10.

## CZĘŚĆ 1 — logo i byczek (04.11.2026)
49. **Statyczne ikony (favicon, apple-touch, PWA 192/512/maskable, manifest) są podmienione od razu**, bo plików statycznych nie da się przełączać flagą `BRAND_V1_ENABLED`. Pozostałe elementy marki (logo w nagłówkach, byczek, nagłówek maili) działają dopiero z flagą. Jeśli wolisz stare ikony do czasu włączenia flagi — przywróć `public/*.png` z gitu.
50. Logo w mailu: klienci pocztowi nie pokazują SVG ani zdalnych obrazków, więc „Rogate O” jest w mailu uproszczone do pierścienia „O” (bez rogów). Pełne logo w mailu wymagałoby obrazka z domeny (po otwarciu na świat).

## Porządki przed betą (lista; zamknąć przed otwarciem)
- [x] **Test `solo-zamiana.test.ts` był niestabilny — naprawiony w kodzie, nie pominięty** (05.11.2026). Przyczyna: `swapExercise` wykluczał tylko ćwiczenia będące w planie, więc po zamianie ćwiczenie, które wypadło z planu, mogło wrócić przy kolejnej zamianie (komentarz w kodzie mówił „nie wracamy do żadnego”). Teraz wykluczone są też ćwiczenia już zamienione w tym planie (`soloExerciseSwapsTable`). Test przeszedł 12× z rzędu; pełny przebieg API w ramach bloku 6.
- [ ] Konta QA/demo i `qaSolo…+clerk_test` do sprzątania skryptem `usun-konta-demo.sh` (blok 9, tylko lista).

## CZĘŚĆ 3 (05.11.2026)
- **`ROADMAP_ENABLED` (karta „Wkrótce” z głosowaniem)** — zbudowana i przetestowana, **wyłączona**. Włączyć? (docs/WKROTCE.md) Pozycje startowe i ich opisy do Twojej akceptacji.
- **`TERMS_ENABLED` (akceptacja Regulaminu + „Pobierz moje dane”)** — zbudowane i przetestowane, **wyłączone**. Treść Regulaminu to projekt do prawnika (decyzje [DECYZJA] w tekście: wiek 18/16, autor przy ćwiczeniu we wspólnej bibliotece). Włączyć na betę z paskiem „Wersja testowa”, czy dopiero po prawniku? (docs/REGULAMIN-W-APLIKACJI.md)
- **`BODY_LOG_ENABLED` (masa i obwody w „Postępach”)** — zbudowane i przetestowane, **wyłączone**. Włączyć? Czy trener ma widzieć te liczby za zgodą podopiecznego? (docs/KONKURENCJA-POPRAWKI.md)
- **Ćwiczenia „na czas” przy kopiowaniu planu** zostają „na czas” (typ wynika z katalogu, nie z kopii) — zachowanie zgodne z importem.
