# Zewnętrzna baza ćwiczeń — analiza (bez importu)

Stan: 23.10.2026. Gałąź `feature/baza-cwiczen-analiza`. **Nic nie trafiło do bazy ani seedu.** Narzędzia: `scripts/baza/` (analiza, reguły, ręczne paczki decyzji). Pełna lista: `docs/BAZA-KANDYDACI.csv` (średnik, UTF-8 z BOM), propozycja celów dla naszych ćwiczeń: `docs/BAZA-CELE-NASZE.csv`.

## 1. Źródło i licencja
- Źródło: https://github.com/yuhonas/free-exercise-db, sklonowane poza repo (`~/free-exercise-db-source`, `--depth 1`); nie instalowano zależności ani nie uruchamiano jego kodu.
- **OpenGym i exercises-dataset odrzucone** (licencja niekomercyjna / AGPL / media tylko dla OpenGym) — nie użyto ani danych, ani nazw, ani opisów.
- `LICENSE.md`: **Unlicense (domena publiczna)** — „sell, use … for any purpose, commercial or non-commercial”. Dotyczy repozytorium jako całości; **README nie odróżnia danych (JSON) od obrazów** i nie podaje oddzielnej licencji ani źródła zdjęć.
- Zastrzeżenie: README mówi, że dane są „restrukturyzacją” innego zbioru (`wrkout/exercises.json`); pochodzenie ich tekstów i zdjęć nie jest w repo udokumentowane. Dlatego, zgodnie z Twoją decyzją, bierzemy **wyłącznie listę ruchów jako ściągę** (nazwa, sprzęt, mięśnie, poziom). Nie kopiujemy ani nie linkujemy zdjęć, nie używamy ich tekstów instrukcji; opisy piszemy własne, z wiedzy trenerskiej (wg `KATALOG-STANDARD.md`).
- **Co wolno w aplikacji komercyjnej:** sama lista ruchów (fakty: że takie ćwiczenie istnieje, jaki sprzęt, jaki mięsień) — tak. Teksty instrukcji i zdjęcia — formalnie Unlicense, ale pochodzenie niepotwierdzone, więc nie używamy. Nic niejasnego nie wchodzi do produktu, więc nie ma punktu STOP licencyjnego.

## 2. Inwentarz
- 876 ćwiczeń, jeden plik `dist/exercises.json` (+ po jednym JSON na ćwiczenie), wszystko po angielsku; ID tekstowe (np. `Barbell_Curl`), nazwy unikalne.
- Pola: `name`, `force` (push/pull/static; brak w 30), `level` (beginner 525 / intermediate 294 / expert 57), `mechanic` (compound 491 / isolation 298 / brak 87), `equipment` (brak w 77; 13 wartości: barbell 170, dumbbell 123, other 122, body only 111, cable 81, machine 67, kettlebells 56, bands 20, medicine ball 17, exercise ball 12, foam roll 11, e-z curl bar 9), `primaryMuscles` (17 wartości) / `secondaryMuscles`, `category` (strength 584, stretching 123, plyometrics 61, powerlifting 38, olympic weightlifting 35, strongman 21, cardio 14), `instructions` (brak w 5), `images` (brak w 3).
- Media: dwa zdjęcia na ćwiczenie (JPG). **Nie używamy.**

## 3. Mapowanie na `KATALOG-STANDARD.md`
| Pole źródła | Nasze pole | Jak |
|---|---|---|
| `name` | nazwa (PL) | własne tłumaczenie/ujednolicenie, w paczkach (`scripts/baza/paczki.tsv`) |
| `level` | poziom | beginner → Początkujący, intermediate → Średniozaawansowany, expert → Zaawansowany (to etykieta źródła, **nie** `suitableForNoActivity`) |
| `primaryMuscles[0]` | partia główna | słownik 17 → nasza lista (np. lats/middle back/lower back/traps → Plecy) |
| `secondaryMuscles` | partie dodatkowe | ta sama mapa (na etapie importu) |
| `equipment` | sprzęt (zamknięta lista) | barbell/e-z → Sztanga, cable → Wyciąg, bands → Gumy oporowe, kettlebells → Kettlebell, body only/brak → Masa własnego ciała; `other` wg nazwy (TRX, poręcze, drążek, kółka, talerz); medicine ball i foam roll poza listą → pomiń |
| `mechanic`, `category` | rola | compound → główne, isolation → pomocnicze, stretching → rozciąganie, nazwy „circles/mobil” → rozgrzewka |
| nazwa/`force` | wzorzec ruchu | reguły na nazwie (`scripts/baza/reguly.py`), ~25 wzorców; do przeglądu przy imporcie |
| wzorzec | stawy obciążane | z tabeli wzorzec → stawy (Kolano, Biodro, Plecy — dół, Bark, Łokieć, Nadgarstek) |
| — | `suitableForNoActivity` | **zawsze puste** — decyduje trener |
| `instructions`, `images` | — | nie używamy |

## 4. Wyniki (876 pozycji)
| Decyzja | Liczba |
|---|---|
| **nowe** (do dodania po Twoim przeglądzie) | **91** (po aktualizacji z 24.10.2026; pierwotnie 121) |
| duplikat naszego id | 142 (pierwotnie 131) |
| wariant-zamiennik ćwiczenia id X | 29 (pierwotnie 179) |
| do decyzji (niska pewność) | 1 (pierwotnie 3) |
| pomiń | 613 (pierwotnie 442) |

- Duplikaty/warianty: pewność wysoka 96, średnia 214, niska 3 (te 3 ma „do decyzji”). **Niska pewność nigdy nie jest automatyczna.**
- Metoda (wielostopniowa): (1) normalizacja nazwy EN (małe litery, liczba pojedyncza, bez słów pustych, synonimy typu db/dumbbell, flye/fly); (2) angielskie odpowiedniki naszych 185 ćwiczeń (`scripts/baza/ours_en.py`) i porównanie zbiorów tokenów; (3) kontrola sprzętu i partii; (4) **ręczny przegląd wszystkich par o podobieństwie ≥ 0,6** i całej reszty „nowych” przy tłumaczeniu (stąd np. `Pushups` = nasze 117, `Butterfly` = 119, `Pullups` = 2, `Side Bridge` = 161, `Thigh Abductor` = 111); (5) duplikaty wewnątrz źródła (np. `Squats - With Bands` vs `Squat with Bands`).
- Przykłady zaakceptowane synonimy: Romanian Deadlift = martwy ciąg rumuński (100); Goblet Squat = 88; Face Pull = 136; Hammer Curls = 150; Cable Crossover = 120.
- „Wariant” = ten sam ruch w innym chwycie, kącie lub sprzęcie. Wariantów **nie dodajemy automatycznie** — to lista do Twojego wyboru (trener często chce kilka chwytów, ale wiele to rozmnożenie katalogu).

## 5. Selekcja — czego NIE importujemy (pierwotnie 442; po aktualizacji 613, patrz sekcja 8)
| Powód | Liczba |
|---|---|
| pliometria i skoki/dynamika (mamy 12 własnych ćwiczeń skocznych) | 88 |
| egzotyczne / specjalistyczne (sprzęt, technika) | 77 |
| kosmetyczne warianty (mamy wersję podstawową) | 67 |
| wysokie ryzyko (barki, plecy, kolana, łokcie) | 45 |
| podrzut/rwanie/zarzut | 35 |
| strongman | 21 |
| cardio | 16 |
| sztanga z gumami / powerlifting | 16 |
| rolowanie (SMR) | 12 |
| szyja | 12 |
| sprzęt spoza zamkniętej listy (medicine ball, foam roll, inne) | 10 |
| zaawansowana technika / gimnastyka | 9 |
| niejasne, bez wartości | 9 |
| wiosłowanie do brody (ryzyko dla barków) | 7 |
| sprzęt landmine | 6 |
| ćwiczenie na piłce / niestabilne podłoże | 3 |
| inne | 9 |
Powód przy każdej pozycji jest w kolumnie „powód” CSV.

## 6. Pole „przydatne do celu” (propozycja do `KATALOG-STANDARD.md`)
Zamknięta lista: **siła, sylwetka, redukcja, kondycja, sprawność, sport**, tablica `training_goals_v2 text[]` (nullable, addytywnie) albo ujednolicenie istniejącego `training_goals` (dziś mieszane: „Masa mięśniowa” 130, „Siła” 69, „Zdrowie ogólne” 48, „Poprawa kondycji” 9, „Hipertrofia” 2, „Kondycja” 1…). Reguły propozycji (dla naszych i kandydatów):
- złożone z obciążeniem (sztanga/maszyna/hantle/wyciąg) → siła, sylwetka; złożone z masą ciała/kettlebell → sprawność, kondycja; izolowane → sylwetka;
- duże wzorce (przysiad, zawias, wykrok, przyciąganie, pchanie) → + redukcja; core/rotacja/lokomocja → + sprawność, sport; zaawansowane → + sport;
- rozciąganie, rozgrzewka → sprawność.
Rozkład dla naszych 185: sylwetka 128, redukcja 78, sprawność 71, siła 58, sport 33, kondycja 29 (`BAZA-CELE-NASZE.csv`, kolumny: cele obecnie / propozycja). To heurystyka do Twojej korekty — nie zmienia generatora.

## 7. Do decyzji — stan po aktualizacji
Zobacz sekcję 8 (nowe pytania). Pozostałe punkty z pierwszej wersji zostały rozstrzygnięte decyzjami właściciela z 24.10.2026.

## 8. Aktualizacja po decyzjach właściciela (24.10.2026)
**A1 — druga kontrola duplikatów** (wzorzec ruchu + sprzęt + mięsień główny + ustawienie/chwyt, każde z 121 „nowych” względem naszych 185 i względem siebie): z 121 zostało **78** „nowych”; 3 przeszły do duplikatów (np. wyciskanie hantla jednorącz = 190 po przejrzeniu: wyprost łokcia z hantlem), 3 do wariantów, 36 do „pomiń” (głównie duplikaty wewnątrz kandydatów, np. 5 odmian brzuszków i 3 odmiany kettlebell → zostaje po jednej), 1 do „do decyzji”. Zasada: różny sprzęt = nie duplikat (np. „unoszenie bokiem z gumą” zostaje jako nowe).

**A2 — pliometria:** z 88 pominiętych wybrano **12 bezpiecznych podstaw** jako „nowe” (poziom ustawiony na średniozaawansowany, cele: sport, kondycja; **nigdy początkujący ani brak aktywności**): skip A, skip na niskie podwyższenie, wypad skokowy, przysiad z wyskokiem, skok „gwiazda”, skoki z piętami do pośladków, carioca, wspinaczka w podporze, rzut piłką lekarską o ziemię, podanie piłki z klatki, wyrzut piłki z dołu, wyrzut za siebie. 7 pozycji pliometrycznych to nasze duplikaty (wskok na skrzynię = 253, skok w dal = 251, skok boczny = 257 i in.). **Uwaga:** 4 ćwiczenia z piłką lekarską wymagają nowej wartości zamkniętej listy sprzętu („Piłka lekarska”) — decyzja przy imporcie. Reszta pliometrii zostaje pominięta.

**A3 — warianty:** z 179 (+20 po A1) zostaje **29 zamienników** różniących się sprzętem lub będących szczeblem progresji; pozostałe 170 = „pomiń (wariant kosmetyczny)”. Lista z powodem: kolumna „powód” w `BAZA-KANDYDACI.csv` (wiersze „wariant”, powód „zamiennik: …”).

**A4 — „do decyzji”:** `Dumbbell Raise` — źródło podaje barki + biceps jako mięśnie dodatkowe (typowe dla unoszenia w przód), ale pole mięśni nie odróżnia przodu od boku; wpisane jako duplikat naszego 146 (unoszenie hantli w przód) ze średnią pewnością — do potwierdzenia na paczce. `Overhead Stretch` i `Seated Overhead Stretch` = jedno ćwiczenie (nowe; wersja siedząca jako wskazówka). Zostaje 1 „do decyzji”: `One Arm Against Wall` (wariant naszego 326, niska pewność).

**A5 — pole celów: obecne `training_goals` → nowe** (nic nie zmieniono w bazie; wdrożenie = STOP-2/STOP-5):
| Obecna wartość | Nowa wartość | Rekordów (aktywne ćwiczenia, 185) |
|---|---|---|
| Masa mięśniowa | sylwetka | 130 |
| Hipertrofia | sylwetka | 2 |
| Siła | siła | 69 |
| Wytrzymałość siłowa | kondycja | 2 |
| Poprawa kondycji | kondycja | 9 |
| Kondycja | kondycja | 1 |
| Zdrowie ogólne | sprawność | 48 |
| Stabilizacja | sprawność | 1 |
| (puste) | wg reguł z sekcji 6 | 27 |
| — | redukcja, sport | nowe wartości, tylko z reguł sekcji 6 |
Liczba wystąpień wartości (jedno ćwiczenie może mieć kilka). Mapowanie „Zdrowie ogólne → sprawność” i „Wytrzymałość siłowa → kondycja” to propozycja do Twojej decyzji.

**A6 — paczki do przeglądu:** `docs/BAZA-PACZKA-01.csv … 05.csv` (20+20+20+20+11 = 91 „nowych”), kolejność: rozciąganie/rozgrzewka (20), masa ciała, reszta. Kolumny: nazwa_PL, nazwa_EN, poziom, rola, sprzęt, wzorzec, mięśnie, stawy, cele, opis, wskazówki, typowe_błędy, uwaga_bezpieczeństwa, **suitableForNoActivity (puste)**, **decyzja_trenera (puste)**. Opisy własne (`scripts/baza/opisy.tsv`); błędy i uwagi bezpieczeństwa wg wzorca ruchu (teksty domyślne w `scripts/baza/paczki_do_przegladu.py`) — bez języka medycznego i obietnic zdrowotnych. Do paczek nie weszły 29 wariantów-zamienników (osobna zgoda). Import dopiero po Twoim przeglądzie.

### Nowe pytania
1. „Piłka lekarska” jako nowa wartość listy sprzętu (4 ćwiczenia).
2. Mapowanie starych wartości celów (tabela A5).
3. Czy 29 wariantów-zamienników ma wejść do osobnej paczki?
