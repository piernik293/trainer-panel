# Zasada „brak aktywności” a „początkujący” (blok 7, 24.10.2026)

**Zasada (zatwierdzona):** ta sama liczba serii tygodniowo na partię dla „brak aktywności” i „początkujący” (wg wytycznych dla początkującego). Różnica: trudność ćwiczeń (szczebel drabinki) i intensywność (RIR). Wszystkie filtry bezpieczeństwa bez zmian.

## Objętość: stare → nowe
Dane: `volume_guidelines` (wersja aktywna). Format: serie na sesję (min–max) / tygodniowy sufit preferowany / tygodniowy sufit absolutny. Wiersze „brak aktywności” zostają w tabeli, ale nie są czytane — `volumeRowsLevel()` (`services/volumeCalculator.ts`) kieruje „brak aktywności” do wierszy „początkujący” w czterech miejscach odczytu (kalkulator, decyzja o objętości, rozkład dni, endpoint wytycznych). Nic nie usunięto z bazy; cofnięcie = usunięcie jednego wywołania.

| Partia (cel objętości) | Stare („brak aktywności”) | Nowe (= „początkujący”) |
|---|---|---|
| Brzuch | 1–2 / 4 / 6 | 2–3 / 6 / 9 |
| Grupa kulszowo-goleniowa | 2–2 / 3 / 5 | 3–3 / 6 / 6 |
| Mięsień czworoboczny grzbietu | 2–2 / 4 / 8 | 4–4 / 8 / 12 |
| Mięsień czworogłowy uda | 2–2 / 4 / 8 | 4–4 / 8 / 10 |
| Mięsień dwugłowy ramienia | 1–1 / 2 / 3 | 2–2 / 4 / 4 |
| Mięsień najszerszy grzbietu | 1–2 / 4 / 6 | 2–4 / 8 / 8 |
| Mięsień piersiowy większy | 1–2 / 4 / 8 | 2–4 / 8 / 10 |
| Mięsień trójgłowy ramienia | 1–1 / 2 / 3 | 2–2 / 4 / 4 |
| Mięsień trójgłowy łydki | 1–1 / 2 / 3 | 2–2 / 4 / 4 |
| Mięśnie naramienne | 1–2 / 4 / 8 | 2–4 / 8 / 12 |
| Mięśnie pośladkowe | 2–2 / 4 / 8 | 4–4 / 8 / 10 |
| Przywodziciele | 2–2 / 3 / 4 | 3–3 / 6 / 6 |

Brzuch (rdzeń) w kalkulatorze `coreVolumeService`: **4 → 6** serii tygodniowo (bez priorytetu), **6 → 8** z priorytetem — jak początkujący.

## RIR
| Poziom | Stare | Nowe |
|---|---|---|
| Brak aktywności fizycznej | 2 (domyślnie dla wszystkich) | **3–4** (domyślnie 3) |
| Początkujący | 2 | **2–3** (domyślnie 2) |
| Pozostałe | 2 | bez zmian |
Domyślne RIR przy dodawaniu ćwiczenia do szkicu: `defaultRirForLevel()` (`trainer-app/src/lib/exerciseDraftHelpers.ts`). Trener może zmienić ręcznie (nadpisanie). `rirLevelHint()` zwraca miękką wskazówkę poza zakresem (nie pokazana jeszcze w UI).

## Dobór szczebla
Jak w `docs/DRABINKI.md` i `services/ladderSelection.ts`: poziom efektywny → szczebel tego poziomu; nigdy wyżej; pusty szczebel = dotychczasowy dobór.

## Testy zmienione (nowa reguła, nie osłabienie bezpieczeństwa)
- `coreVolumeBlock.test.ts`: „No Activity → 4 sets” → 6 (= początkujący); z priorytetem 6 → 8.
- `experience-levels.test.ts` #18: „sufity brak aktywności niższe niż początkujący” → **równe** (porównanie po `volumeTargetId`; wcześniej błędnie po nieistniejącym `targetId`, więc test porównywał z pierwszym wierszem).
- Nowe: `volumeRowsLevel.test.ts`, `rirByLevel.test.ts`.
