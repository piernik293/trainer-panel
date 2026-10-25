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


## 2026-10-25T17:55 — import paczki „import-odmiany-2b” (BAZA-IMPORT-2B.csv)
- zaimportowano: 146 (id: 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248, 1249, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268, 1269, 1270, 1271, 1272, 1273, 1274, 1275, 1276, 1277, 1278, 1279, 1280, 1281, 1282, 1283, 1284, 1285, 1286, 1287, 1288, 1289, 1290, 1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298, 1299, 1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308, 1309, 1310, 1311, 1312, 1313, 1314, 1315, 1316, 1317, 1318, 1319, 1320, 1321, 1322, 1323, 1324, 1325, 1326, 1327, 1328, 1329, 1330, 1331, 1332, 1333, 1334)
- pominięto „nie”: 0, pusta decyzja: 0, do poprawy: 0, odrzucone: 0, duplikaty: 0, już były: 0
- kopia bazy: /home/andrzejwysocki769/backups/trainer_panel_przed_importem_import-odmiany-2b_202610251755.sql

