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

## 2026-10-25T17:49 — import paczki „import-odmiany-2a” (BAZA-IMPORT-2A.csv)
- zaimportowano: 121 (id: 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188)
- pominięto „nie”: 0, pusta decyzja: 0, do poprawy: 0, odrzucone: 0, duplikaty: 0, już były: 0
- kopia bazy: /home/andrzejwysocki769/backups/trainer_panel_przed_importem_import-odmiany-2a_202610251749.sql

