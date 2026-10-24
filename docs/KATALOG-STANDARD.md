# Standard opisu ćwiczenia w katalogu — propozycja do decyzji

Stan: 23.10.2026, na podstawie `lib/db/src/schema/exercises.ts`, słowników w `artifacts/trainer-app/src/lib/exercise-constants.ts` i 158 aktywnych ćwiczeń w bazie. **Nic nie zmieniono w bazie ani w kodzie.** Dokument opisuje, jak ma wyglądać kompletny opis ćwiczenia, i wskazuje luki.

## 1. Zasada nadrzędna
- **Brak danych w polu wymaganym = status „do weryfikacji”.** Ćwiczenie „do weryfikacji” jest widoczne dla trenera (z oznaczeniem), ale **nie trafia do planów klientów początkujących ani nieaktywnych** (generator je odrzuca; ręcznie trener może je dodać po świadomym potwierdzeniu). Zgodne z regułą z CLAUDE.md: `learningDifficulty` null → odrzucenie, `suitableForNoActivity` musi być wprost `true`.
- Status `zweryfikowane` nadaje trener/admin katalogu po uzupełnieniu wszystkich pól wymaganych.
- Dziś (stan faktyczny): `suitable_for_no_activity` jest `null` w **126 z 158** ćwiczeń (true 27, false 5), czyli w praktyce większość katalogu jest „do weryfikacji” dla osób nieaktywnych. `video_url`: brak w 158/158. `safety_notes`: brak w 5.

## 2. Pola: wymagane / opcjonalne / dopuszczone wartości
Legenda: **W** = wymagane do statusu „zweryfikowane”, **O** = opcjonalne, **brak** = pola dziś nie ma w schemacie.

### Tożsamość
| Pole (kolumna) | W/O | Wartości | Uwagi |
|---|---|---|---|
| nazwa (`name`), `slug` (unikalny) | W | tekst | po polsku, bez dopisków w nawiasach poza angielskim odpowiednikiem |
| **rola** | W, **brak** | `główne` / `pomocnicze` / `rozgrzewka` / `rozciąganie` | dziś wyprowadzana z `exercise_type` (Złożone→główne, Izolowane→pomocnicze); rozgrzewka/rozciąganie nie da się wyrazić |
| typ (`exercise_type`) | W | Złożone (87) / Izolowane (71) | |
| aktywne (`is_active`), autor (`created_by_trainer_id`) | W | | NULL autor = katalog publiczny |

### Partie mięśniowe (zamknięta lista `MAIN_MUSCLE_GROUPS`)
Klatka piersiowa, Plecy, Barki, Biceps, Triceps, Przedramiona, Brzuch, Pośladki, Mięśnie czworogłowe uda, Mięśnie dwugłowe uda, Przywodziciele, Odwodziciele, Łydki, Całe ciało, Inne.
- `main_muscle_group` — **W**, jedna wartość z listy. Rozgrzewka/rozciąganie: partia, której dotyczy, albo „Całe ciało”.
- `secondary_muscle_groups` — **O**, tablica z tej samej listy (dziś: Barki 39, Pośladki 34, Triceps 26 …).

### Sprzęt
Dziś `equipment` (tablica) z listy `EQUIPMENT_OPTIONS`: Sztanga, Hantle, Kettlebell, Maszyna, Wyciąg, Drążek, Poręcze, Ławka, Gumy oporowe, TRX, Masa własnego ciała, Piłka, Brak sprzętu, Inny. Wartość „Inny” + `equipment_other` (wolny tekst) — jedno ćwiczenie.
- `equipment` — **W**, co najmniej jedna wartość. `required_equipment_all` — **O** (wszystko wymagane naraz).
- **Propozycja:** rozbić „Maszyna” i „Wyciąg” na konkretne urządzenia (zamknięta lista), bo sam ogólny sprzęt nie wystarcza do dopasowania do siłowni klienta ani do skoku ciężaru: Maszyna — prasa do nóg, wyprost nóg, uginanie nóg leżąc/siedząc, wypychanie klatki, wyciskanie barków, wiosłowanie siedząc, motylek/„pec deck”, suwnica Smitha, hack-przysiad, łydki stojąc/siedząc, brzuch; Wyciąg — wyciąg górny, dolny, bramy (crossover), linka z uchwytem. Pole: `equipment_detail text[]` (nullable, addytywnie).
- Skok ciężaru (tor C): sztanga 2,5 kg, hantle/kettlebell 1 kg, maszyna/wyciąg 2,5 kg, masa ciała — bez ciężaru. Wynika z `equipment`; przy kilku wartościach obowiązuje pierwsza w kolejności: Sztanga > Maszyna/Wyciąg > Hantle/Kettlebell.

### Miejsce
`training_location` — **W**, tablica: Siłownia / Dom / Plener (w UI „Siłownia plenerowa”). Dziś: Siłownia 158, Dom 68, Plener 48.

### Wzorzec ruchu i klasyfikacja
- `movement_pattern` — **W**, zamknięta lista (21 wartości w bazie): Pchanie poziome, Pchanie pionowe, Przyciąganie poziome, Przyciąganie pionowe, Przysiad, Zawias biodrowy, Wykrok, Zgięcie/Wyprost łokcia, Zgięcie/Wyprost kolana, Odwodzenie, Przywodzenie, Zgięcie tułowia, Rotacja, Anti-ekstensja, Anti-rotacja, Stabilizacja tułowia, Wspięcie na palce, Lokomocja, Inne. Dla rozgrzewki/rozciągania dodać: **Mobilizacja**, **Rozciąganie**, **Aktywacja**.
- `movement_category` — O, **do uporządkowania**: wartości mieszane PL/EN (Pchanie 51 / Push 2, Ciągnięcie 47 / Pull 1, Przysiad 15 / Squat 1). Propozycja: zostawić polskie, zmigrować angielskie (osobna zgoda — to zmiana danych).
- `plane_of_motion` — O: Strzałkowa / Poprzeczna / Czołowa. `execution` — W: Obustronne / Jednostronne.
- `resistance_type` — O: dziś „Masa własnego ciała” (41) i „Ciężar własnego ciała” (2) — duplikat do ujednolicenia; reszta jak sprzęt.
- `difficulty_level` (poziom) — W: Brak aktywności fizycznej / Początkujący / Średniozaawansowany / Zaawansowany. `suitable_experience_levels` — W, tablica z tej samej listy.
- `training_goals` — O, dziś mieszane (Hipertrofia 2 obok Masa mięśniowa 130, Kondycja 1 obok Poprawa kondycji 9) → ujednolicić.

### Bezpieczeństwo (wymagane do dopuszczenia początkujących/nieaktywnych)
| Pole | W/O | Wartości |
|---|---|---|
| `learning_difficulty` | **W** | 1–5 (null = odrzucone dla początkujących/nieaktywnych); dziś 158/158 wypełnione |
| `suitable_for_no_activity` | **W** | true / false (null = „do weryfikacji”); dziś 126 null |
| `movement_complexity` | W (wyprowadzane) | Prosta / Umiarkowana / Złożona (z `learning_difficulty`; dla `suitable_for_no_activity` = Prosta) |
| `joint_stress` (obciążenie stawów) | **W** | Niskie / Średnie / Wysokie — **pole już istnieje** (109/34/15), wypełnione 158/158 |
| `requires_spotter` | W | tak/nie (7 tak) |
| `can_be_performed_to_failure` | O | Tak / Nie / Z ostrożnością |
| `safety_notes` | W dla Średnie/Wysokie `joint_stress` | tekst; brak w 5 ćwiczeniach |
| `neurological_fatigue`, `doms_potential` | O | 1–5 |
| `exercise_priority` | O | Bardzo wysoki / Wysoki / Średni / Niski |
| **osobne obciążenie stawów wg stawu** | O, **brak** | np. `joint_stress_areas text[]` (Kolano, Biodro, Plecy — dół, Bark, Łokieć, Nadgarstek) — dopasowanie do listy miejsc z „Coś boli?” i do kontuzji z wywiadu |

### Opis dla klienta
`execution_instructions` (**W**, „Jak wykonać”; dziś 158/158), `common_mistakes`, `coaching_tips`, `breathing_tips`, `tempo`, `range_of_motion` (O), `description` (O), `video_url` (**W** docelowo — dziś 0/158), `image_url` (O).
**Brak:** `quantity` rozgrzewki/rozciągania, czyli ilość jako informacja („10 × na stronę”, „40 s”) — propozycja: `default_reps int null`, `default_duration_seconds int null`, `per_side boolean`.

## 3. Czego dziś brakuje w schemacie — propozycje (addytywne, nullable)
| # | Brak | Propozycja | Dlaczego |
|---|---|---|---|
| 1 | rola ćwiczenia | `role text` (główne/pomocnicze/rozgrzewka/rozciąganie), wypełnić z `exercise_type` | przerwy (C4), dobór rozgrzewki, filtr generatora (rozgrzewka nie może trafić do planu głównego) |
| 2 | status weryfikacji | `verification_status text` (`zweryfikowane` / `do_weryfikacji`), domyślnie wyliczany z pól W | reguła „brak danych = niedopuszczone” w jednym miejscu |
| 3 | stawy | `joint_stress_areas text[]` | filtr „Coś boli?” i kontuzje |
| 4 | konkretne maszyny | `equipment_detail text[]` | dopasowanie do siłowni, skok ciężaru |
| 5 | ilość | `default_reps`, `default_duration_seconds`, `per_side` | rozgrzewka/rozciąganie bez minutnika |
| 6 | pozostałe wartości EN/duplikaty | migracja danych `movement_category`, `resistance_type`, `training_goals` | spójność filtrów |
Punkty 1–5 to nowe kolumny nullable (addytywnie), pkt 6 to zmiana danych — wymaga osobnej zgody. **Czekam na Twoją decyzję; do tego czasu nic się nie zmienia.**

## 4. Kryteria dla listy rozgrzewki/rozciągania
Każda pozycja z `docs/TRENING.md` (sekcja „Propozycja ćwiczeń rozgrzewkowych i rozciągających”) ma wszystkie pola W z tabel wyżej: partia, sprzęt, miejsce, poziom, wzorzec, `learning_difficulty`, `suitable_for_no_activity`, `joint_stress`, ilość, instrukcję. Pozycje bez któregoś pola oznaczono „do weryfikacji”.

## 5. Stan wdrożenia (23.10.2026)
Pola 1–5 z tabeli w sekcji 3 dodane migracją 0019 (nullable): `role`, `verification_status`, `joint_stress_areas`, `equipment_detail`, `default_reps` / `default_duration_seconds` / `per_side`. `role` i `verification_status` uzupełnione z istniejących danych; pozostałe pola puste do czasu akceptacji listy rozgrzewki i uzupełnienia katalogu. Punkt 6 (ujednolicenie EN/PL i duplikatów) — bez zmian, czeka na zgodę. Reguła „do weryfikacji = niedopuszczone dla początkujących/nieaktywnych” jeszcze nie jest włączona (patrz `docs/TRENING.md`).

## 7. Propozycja: pole „przydatne do celu” (24.10.2026)
Szczegóły i reguły: `docs/BAZA-ANALIZA.md` (sekcja 6), dane: `docs/BAZA-CELE-NASZE.csv`. Lista zamknięta: siła, sylwetka, redukcja, kondycja, sprawność, sport. **Propozycja do decyzji, nic nie wdrożono.**
