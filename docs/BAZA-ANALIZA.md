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
| **nowe** (do dodania po Twoim przeglądzie) | **121** |
| duplikat naszego id | 131 |
| wariant ćwiczenia id X | 179 |
| do decyzji (niska pewność) | 3 |
| pomiń | 442 |

- Duplikaty/warianty: pewność wysoka 96, średnia 214, niska 3 (te 3 ma „do decyzji”). **Niska pewność nigdy nie jest automatyczna.**
- Metoda (wielostopniowa): (1) normalizacja nazwy EN (małe litery, liczba pojedyncza, bez słów pustych, synonimy typu db/dumbbell, flye/fly); (2) angielskie odpowiedniki naszych 185 ćwiczeń (`scripts/baza/ours_en.py`) i porównanie zbiorów tokenów; (3) kontrola sprzętu i partii; (4) **ręczny przegląd wszystkich par o podobieństwie ≥ 0,6** i całej reszty „nowych” przy tłumaczeniu (stąd np. `Pushups` = nasze 117, `Butterfly` = 119, `Pullups` = 2, `Side Bridge` = 161, `Thigh Abductor` = 111); (5) duplikaty wewnątrz źródła (np. `Squats - With Bands` vs `Squat with Bands`).
- Przykłady zaakceptowane synonimy: Romanian Deadlift = martwy ciąg rumuński (100); Goblet Squat = 88; Face Pull = 136; Hammer Curls = 150; Cable Crossover = 120.
- „Wariant” = ten sam ruch w innym chwycie, kącie lub sprzęcie. Wariantów **nie dodajemy automatycznie** — to lista do Twojego wyboru (trener często chce kilka chwytów, ale wiele to rozmnożenie katalogu).

## 5. Selekcja — czego NIE importujemy (442)
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

## 7. Do decyzji
1. Czy pozycje „nowe” (121) trafiają do importu w tej liczbie? Najwięcej: rozciąganie 31, masa ciała 51, gumy 13, kettlebell 12.
2. Warianty (179): wybrać, które z nich dodać (domyślnie żadne).
3. 3 pozycje „do decyzji”: `Dumbbell Raise` (przód czy bok?), `Overhead Stretch`, `Seated Overhead Stretch`.
4. Pole celów (6 wartości) i migracja istniejących `training_goals`.
5. `suitableForNoActivity` — dla każdego importowanego ćwiczenia ustawia trener; do tego czasu „do weryfikacji” (nie trafia do planów początkujących i nieaktywnych).
