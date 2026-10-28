# Jakość generatora — symulacja (28.10.2026)

**Jak to powtórzyć:** `scripts/generator-sim.sh [liczba_profili=1000] [ziarno]` (baza `trainer_panel_test`, ok. 5 min dla 1000 profili; surowy raport: `docs/generator-sim-report.json`). Mniejsza próbka (24 profile) jest w zwykłych testach: `src/__tests__/generator-sim.test.ts`. Kontrola po każdej zmianie generatora.

**Metoda.** Losowe, odtwarzalne profile (ziarno 20261028): 4 poziomy (z regułą 2 lat → poziom efektywny), 6 celów, 5 miejsc (siłownia, dom bez sprzętu / z gumą / z hantlami, siłownia plenerowa), 2–6 dni, 30–90 min, 35% z zgłoszonym stawem (połowa tekstem z wywiadu, połowa raportem bólu), 20% z wykluczonymi ćwiczeniami, 6% bez zgody zdrowotnej, odpowiedź o skokach przy celu sportowym. Tydzień powstaje tak jak w kreatorze (podział z `recommendSplitType`/`getDayTemplate`, kolejne `generate-day` z pamięcią tygodnia), potem plan jest zapisywany i generowany ponownie („Generuj od nowa”). Kontrole robi **niezależny sprawdzacz** na wierszach katalogu w bazie, nie na odpowiedzi generatora.

## Wynik (1000 profili, 3981 dni, 17 970 ćwiczeń, po poprawkach)
| Kontrola | Wynik |
|---|---|
| Ćwiczenie na zgłoszony staw | **0** |
| BA bez `suitableForNoActivity = true`; BA/P bez `learningDifficulty` | **0** |
| BA/P z ćwiczeniem niezatwierdzonym przez trenera (importy) | **0** |
| Pliometria wbrew zasadom (poziom/doświadczenie, cel, BA) | **0** |
| Ukryte ćwiczenie; wykluczone w wywiadzie | **0** |
| Brak zgody zdrowotnej a wysokie obciążenie stawów | **0** |
| Sprzęt lub miejsce spoza listy klienta | **0** |

## Naprawione naruszenia (z testami regresji)
1. **Odmienione nazwy stawów w wywiadzie były ignorowane** („problem z biodrem”, „ból biodra”, „w biodrze”, „ból w ramieniu”). Wzorzec znał tylko „biodro/bioder” i „bark/ramię”, więc taki klient dostawał przysiady, wykroki i glute bridge obciążające zgłoszone biodro (16 przypadków na 150 profili). Poprawka: `services/warmupSelection.ts` (`biodr`, `ramien`). Testy: `warmupSelection.test.ts` (odmiany) i `joint-exclusion.integration.test.ts` (każdy staw tekstem w odmienionej formie przez wszystkie ścieżki; dotąd połowa stawów szła tylko raportem bólu, więc dziura była niewidoczna).
2. **Blok pliometryczny omijał tryb „brak zgody zdrowotnej”** (filtr nie dostawał `jointStress`), np. „Skok jednonóż” dla zaawansowanego bez zgody. To samo w „zamianie ćwiczenia” (`planSwap`). Poprawka: `planDraftGenerateDay.ts`, `planSwap.ts`. Test: `conservative-generator.test.ts` (pada bez poprawki; kontrola, że bez flagi ćwiczenia wysokiego obciążenia się pojawiają).

## Struktura (do oceny, nie jest błędem)
- **Odmowy dnia (422): 917 z 3981 dni (23%).** Wszystkie z tego samego powodu: po filtrach bezpieczeństwa zostaje poniżej 4 ćwiczeń („minimum 4 exercises required, got N”). Najczęściej dni górne/przyciągania w domu i w plenerze (brak drążka/gumy → brak ćwiczeń na plecy), ale też 125 odmów na siłowni (poziom BA/P: tylko ok. 27 ćwiczeń ma `suitableForNoActivity = true`). To działanie zgodne z regułami (nie ma fallbacku na ćwiczenia niebezpieczne), ale trener widzi błąd zamiast planu.
- Skutek: w 489 z 1000 planów brak serii przyciągania, w 187 stosunek pchanie : przyciąganie poza 0,5–2. Łącznie pchanie : przyciąganie = 1,98; kolano : biodro = 2,19 (przewaga kolana).
- Objętość (mediana serii roboczych na trening): BA 12, P 16, Ś 21, Z 21. Szacunek czasu (40 s serii + przerwa + 6 min): mediana do deklarowanego: BA 0,56, P 0,70, Ś 0,95, Z 0,98. 1015 dni poniżej 60% deklarowanego czasu (głównie BA/P), 521 powyżej 130%. To szacunek orientacyjny.
- Cel: plan z pliometrią — Cel sportowy 130/158, Poprawa kondycji 59/143 i Poprawa sprawności 58/180 (tylko od Ś), pozostałe cele **0**. Zgodne z tabelą celów.

## Różnorodność
- Duplikaty w planie tygodniowym: 553 z 1000 planów (powtórzenie bezpiecznego ćwiczenia, gdy pula się wyczerpie; reguła na to pozwala).
- Udział odmian (`parent_exercise_id`): 0% — generator bierze ćwiczenie główne, odmiany tylko gdy główne nie pasuje.
- „Generuj od nowa” — mediana powtórzeń ćwiczeń z poprzedniego planu: **siłownia P 8%, Ś 25%, Z 25%** (dobrze); **dom/plener 69–100%** i **BA 92–100%** (pula za mała — to ograniczenie katalogu, nie logiki).
- Najczęściej wybierane: Glute bridge 6,9%, Skoki pogo 4,1%, Przysiad do skrzyni z masą 4,0%, Wspięcia na palce 3,9%.

## Do decyzji właściciela (wpisane w `docs/DO-DECYZJI.md`)
1. **„Ćwiczenie ponad poziom”** nie ma twardej reguły (trudność to tylko punktacja; filtr istnieje wyłącznie dla pliometrii). 1022 przypadków, 937 u początkujących: m.in. „Pompki z obciążeniem”, „Pompki z gumą oporową”, „Unoszenie kolan w zwisie”. Propozycja: twardy filtr „trudność ≤ poziom efektywny” dla BA/P (BA = Początkujący) — kosztem większej liczby odmów (patrz niżej), więc razem z uzupełnieniem katalogu.
2. **Status „do weryfikacji”** nie jest wymuszany dla początkujących (opisane w KATALOG-STANDARD): 27% ćwiczeń w planach P to „do weryfikacji”. Włączenie bez uzupełnienia `suitable_for_no_activity` wyczyściłoby większość katalogu.
3. **Odmowy dnia**: pozwolić na dzień z 3 ćwiczeniami (z komunikatem dla trenera) zamiast błędu? To zmiana widocznego zachowania. Alternatywa: czytelny komunikat „brakuje bezpiecznych ćwiczeń na plecy — dodaj gumę/drążek”.
4. **Katalog dla domu bez sprzętu i dla osób nieaktywnych** jest za mały (powtarzalność, odmowy). Kalistenika (blok 2) częściowo to rozwiązuje.
