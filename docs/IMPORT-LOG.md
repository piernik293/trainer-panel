# Dziennik importu ćwiczeń z paczek

Narzędzie: `scripts/baza/import-paczka.ts` (logika `artifacts/api-server/src/services/paczkaImport.ts`). Domyślnie dry-run; zapis tylko z `--apply` po „importuj” od właściciela. Każdy wpis niżej dopisuje skrypt.
Uruchomienie: `set -a; . ./.env; set +a; pnpm --filter @workspace/api-server exec tsx ../../scripts/baza/import-paczka.ts <plik.csv> [--apply] [--batch NAZWA]`; cofnięcie: `… --rollback NAZWA`.
(Wpisy z testów na bazie testowej nie są zapisywane do tego pliku.)

## Mięśnie szczegółowe (od 24.10.2026)

Każda paczka ma kolumny `mięśnie_główne` i `mięśnie_pomocnicze`: nazwy z naszych 28 mięśni (`specific_muscles`), oddzielone przecinkiem. Wypełnia je `scripts/baza/miesnie_paczek.py` z `primaryMuscles` / `secondaryMuscles` źródła (free-exercise-db). Trener może je poprawić w Excelu; skrypt nie nadpisuje niepustych komórek.

Import (`paczkaImport.ts`) odrzuca wiersz, gdy: brak mięśni głównych; nazwa spoza 28 mięśni; ten sam mięsień jest główny i pomocniczy; żaden mięsień główny nie należy do partii z kolumny `mięśnie` (poza „Całe ciało” / „Inne”); brak wskazówek lub typowych błędów. Zapis w jednej transakcji: ćwiczenie + przypisania (główny 1,0, pomocniczy 0,5), `description` = opis, `secondaryMuscleGroups` z partii mięśni pomocniczych. Zaimportowane ćwiczenie spełnia `computeCompleteness` — trafia do puli generatora.

| Źródło (free-exercise-db) | Nasz mięsień szczegółowy | Uwagi |
|---|---|---|
| chest | Mięsień piersiowy większy | |
| lats | Mięsień najszerszy grzbietu | |
| middle back | Mięśnie równoległoboczne | |
| traps | Mięsień czworoboczny grzbietu | |
| lower back | Prostowniki grzbietu | |
| shoulders | Mięsień naramienny (głowa tylna) | nazwa z „rear / reverse / odwrotne / tylne”, albo mięsień pomocniczy we wzorcu „Przyciąganie poziome” |
| shoulders | Mięsień naramienny (głowa przednia) | nazwa z „front / w przód” |
| shoulders | Mięsień naramienny (głowa boczna) | mięsień główny we wzorcu „Pchanie pionowe” lub „Odwodzenie” (jak w katalogu: wyciskanie nad głowę, unoszenie bokiem) |
| shoulders | Mięsień naramienny (głowa przednia) | pozostałe przypadki |
| biceps | Mięsień dwugłowy ramienia | |
| triceps | Mięsień trójgłowy ramienia | |
| forearms | Zginacze nadgarstka i palców | |
| abdominals | Mięsień poprzeczny brzucha | wzorce „Anti-ekstensja”, „Stabilizacja tułowia” (jak plank w katalogu) |
| abdominals | Mięśnie skośne brzucha | wzorce „Rotacja”, „Anti-rotacja” |
| abdominals | Mięsień prosty brzucha | pozostałe przypadki |
| glutes | Mięsień pośladkowy wielki | |
| quadriceps | Mięsień czworogłowy uda | |
| hamstrings | Mięśnie kulszowo-goleniowe | |
| adductors | Mięśnie przywodziciele uda | |
| abductors | Mięśnie odwodziciele uda | |
| calves | Mięsień brzuchaty łydki | gdy łydki są mięśniem głównym, dochodzi „Mięsień płaszczkowaty” jako pomocniczy (jak w katalogu) |
| neck | — | brak w naszym modelu; pomijane (1 wiersz, jako pomocniczy) |

Stan paczek 1–6 (122 wiersze, 24.10.2026 po scaleniu sprzętu): 122/122 przechodzi pełną walidację (w tym mięśnie). Import czeka na decyzje trenera w kolumnie `decyzja_trenera`.
