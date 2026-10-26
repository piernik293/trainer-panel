# Moduł kondycyjny — projekt (25.10.2026, zaktualizowany po decyzjach tego samego dnia)

**Status: tylko projekt, nic nie zbudowano. Punkt STOP-5 — czeka na akceptację właściciela.** Zawiera model danych (STOP-2 — migracje dopiero po zgodzie), ekrany i reguły bezpieczeństwa. Nie obiecujemy efektów zdrowotnych; kondycja to plan wysiłku i zapis tego, co klient zrobił.

## 0. Zatwierdzone: moduł nie jest nowym profilem, tylko elementami planu przypisanymi do celu
Plan podopiecznego składa się z **typów elementów** (trening oporowy, pliometria, kondycja, kroki). Cel klienta określa, które elementy i w jakiej ilości. Tabela zatwierdzona przez właściciela (6 celów z bazy):

| Cel | Trening oporowy | Pliometria | Kondycja | Kroki |
|---|---|---|---|---|
| Zwiększenie siły | główny, ciężkie wielostawowe | nie (trener może dodać) | opcjonalnie 1×/tydz., lekka regeneracyjna | opcjonalnie |
| Budowa sylwetki | główny | nie | opcjonalnie 1×/tydz. | opcjonalnie |
| Redukcja tkanki tłuszczowej | tak | nie | 1–2×/tydz. | tak, z celem |
| Poprawa kondycji | tak, całe ciało, obwody | tylko niska, od Ś | 2–3×/tydz., główny element | tak |
| Poprawa sprawności | tak, całe ciało | tylko niska, od Ś | 1–2×/tydz. marszobieg → bieg/interwały | tak |
| Cel sportowy | tak | wg doświadczenia (zbudowane 25.10, blok 5) | 1–2×/tydz. interwały i sprinty | opcjonalnie |

**Poziom ogranicza formę:** BA — tylko marsz / marszobieg + kroki; P — marszobieg → bieg ciągły, interwały łagodne; Ś/Z — pełny zakres. **Ból i stawy wykluczają też formy kondycyjne** (np. bieg przy bólu kolana → rower, marsz; ta sama lista stawów i okno 30 dni co w generatorze: `jointExclusion`). **Kilka celów:** priorytet 1 decyduje o głównym elemencie; pozostałe tylko dodają elementy opcjonalne z tabeli (bez podwajania częstotliwości — przy konflikcie obowiązuje mniejsza). **Pierwsza jednostka BA/P:** 20–25 min, marsz 2 min / trucht 1 min × 6–8, skala odczuwalnego wysiłku (RPE, skala z pkt 6).

Już zbudowane: kroki wpisywane ręcznie (blok 6 poprzedniego etapu) i blok pliometryczny (blok 5 tego etapu). Moduł kondycyjny dołoży trzeci typ elementu, korzystając z tych samych mechanizmów (portal „Dziś”, kolejka offline, izolacja klient/trener).

### 0.1 Model danych (rozszerzenie pkt 5)
- `plan_element_rules` (słownik, seed, edytowalny przez administratora): cel × typ elementu × poziom → `mode` (`wymagany` / `opcjonalny` / `brak`), `perWeekMin`, `perWeekMax`, `allowedMethods[]`. To zamiast zaszywania tabeli celów w kodzie.
- `conditioning_plans.goal_snapshot` (cel w chwili układania planu) i `conditioning_sessions_planned.element_rule_id` — żeby było wiadomo, z czego wynika częstotliwość.
- Reguły poziomu i stawów jako czysta funkcja `allowedConditioningTools(level, blockedJoints)`; testy tabelaryczne cel × poziom × staw.

### 0.2 Ekrany (dodatek do pkt 6)
- Panel trenera: w ułożonym planie lista elementów „z celu” (z oznaczeniem, dlaczego: „Poprawa kondycji → 2–3×/tydz.”), możliwość dodania/usunięcia elementu ręcznie (ostrzeżenie, nie blokada, poza regułami BA/P).
- Portal: „Dziś” pokazuje elementy dnia jako osobne kafelki (jak rozgrzewka / trening / schłodzenie); kafelek kondycji dopiero po akceptacji.

### 0.3 Testy
Tabela cel × poziom × staw → dozwolone formy i częstotliwość; BA nigdy interwały/tempo/skakanka; kilka celów → priorytet 1; pierwsza jednostka BA/P = 20–25 min i marsz 2 / trucht 1; izolacja klient/trener A/B jak przy krokach.

## 1. Cel i zasady
- Uzupełnienie planu siłowego (FBW) o prosty trening kondycyjny: marszobieg, bieg ciągły, interwały, tempo, fartlek.
- **Bez sprzętu pomiarowego na start.** Intensywność mierzy skala odczuwalnego wysiłku (RPE) i „test rozmowy”, nie tętno.
- Najpierw bezpieczeństwo: początkujący i brak aktywności zaczynają od marszobiegu; progresja wolna i tygodniowa; tydzień lżejszy co 4. tydzień.
- Ten sam model użytkownika co w siłowym: trener układa plan, klient odhacza w portalu (działa offline jak serie i kroki), trener widzi realizację.

## 2. Metody (słownik zamknięty)
| Metoda | Dla kogo | Opis | Intensywność (RPE 1–10) |
|---|---|---|---|
| **Marszobieg** | pierwsza jednostka dla BA i początkujących | naprzemiennie marsz i trucht, np. 1 min trucht / 2 min marsz × 6–8 | trucht 4–5, marsz 2–3 |
| **Bieg ciągły w strefie rozmownej** | P → Z | jedno tempo, w którym da się mówić pełnymi zdaniami | 4–5 |
| **Interwały** | Ś, Z (P dopiero po 6–8 tyg. bazy) | krótkie odcinki szybciej, przerwa marszem/truchtem 1:1–1:2 | odcinek 7–8, przerwa 2–3 |
| **Tempo** | Ś, Z | ciągły odcinek 15–30 min „komfortowo trudno” | 6–7 |
| **Fartlek** | Ś, Z | swobodne przyspieszenia według odczuć w biegu ciągłym | 4–8 zmiennie |
Środki (z grupy G4, nie importowane do katalogu siłowego): bieżnia (marsz/bieg), wioślarz, rower (stacjonarny i zwykły), orbitrek, skakanka, liny (battle ropes), sanki/prowler, bieg w terenie. Każdy środek ma: nazwę, sprzęt, miejsce (Dom/Plener/Siłownia), czy nadaje się do metody (np. skakanka — interwały tak, marszobieg nie), poziom minimalny (skakanka i sanki: Ś).

## 3. Progresja tygodniowa (szablon, trener może zmienić)
- **Zasada:** w tygodniu zwiększamy tylko jedną rzecz (czas albo liczbę odcinków albo intensywność), o ok. 10% łącznego czasu; co 4. tydzień „lżejszy” (−30%).
- **Marszobieg (BA/P), 3 jednostki/tydz.:** tyg. 1–2: marsz 2 min / trucht 1 min × 6–8 (20–25 min); tyg. 3–4: 2/2 × 6; tyg. 5–6: 3/2 × 5; tyg. 7–8: 5/2 × 4; tyg. 9+: bieg ciągły 15–20 min w strefie rozmownej.
- **Bieg ciągły:** start 15 min → +2–3 min co tydzień do 30–40 min; długi bieg raz w tygodniu.
- **Interwały (Ś/Z), 1×/tydz.:** 6 × 1 min (RPE 7–8) / 2 min lekko → +1 odcinek co tydzień do 10; potem odcinki 2 min.
- **Tempo (Ś/Z), 1×/tydz.:** 10 min → 20–30 min.
- **Fartlek:** 20–40 min, 4–6 przyspieszeń 30–60 s według odczuć.
- Regres: po przerwie ≥ 14 dni wracamy do tygodnia o 2 niższego; po zgłoszeniu bólu (jak „Coś boli?”) jednostka zamienia się na marsz.

## 4. Łączenie z treningiem siłowym (FBW)
- FBW 3×/tydz. + kondycja 2×/tydz. = 5 dni; dla BA/P maks. 1–2 jednostki kondycyjne tygodniowo przy 2–3 siłowych.
- Reguły układu: nie stawiamy interwałów/tempa w dzień przed ciężkim dniem nóg; bieg ciągły łagodny może być w dzień siłowy **po** treningu (nie przed ciężkimi nogami); co najmniej jeden dzień całkowitego wolnego.
- Kondycja nie wlicza się do objętości siłowej (osobna tabela, brak wpływu na weekBalance); generator tylko wskazuje kolizje („interwały dzień po nogach”).
- Cel klienta steruje udziałem: redukcja/kondycja — więcej jednostek; siła/sylwetka — 1–2 lekkie.

## 5. Model danych (propozycja, addytywnie)
- `conditioning_plans` (id, client_id, trainer_id, title, status, start_date, weeks, created_at) — plan kondycyjny klienta (jeden aktywny, jak w siłowym).
- `conditioning_sessions_planned` (id, plan_id, week_no, day_of_week, method, tool, total_minutes, structure jsonb — lista bloków `{type: "marsz"|"trucht"|"bieg"|"szybko"|"lekko", seconds, reps, rpe}`, note).
- `conditioning_logs` (id, client_uuid unique, client_id, planned_session_id null, date, method, tool, minutes, rpe_overall, completed bool, note, created_at) — wpis klienta; `client_uuid` zapewnia idempotencję z kolejki offline.
- `conditioning_tools` (słownik środków z pkt 2: nazwa, sprzęt, miejsca, metody, poziom min.) — seed, edytowalny przez administratora katalogu.
- Reuse: `daily_steps` (kroki) zostają osobno; cel kroków można pokazywać obok kondycji, bez sumowania.

## 6. Ekrany
- **Panel trenera:** zakładka „Kondycja” w profilu klienta: plan tygodniowy (siatka dni), szablony metod z progresją (jeden klik „marszobieg 8 tyg.”), kolizje z planem siłowym, realizacja (ukończone / zaplanowane, średni RPE), uwaga „RPE ≥ 9 trzy razy z rzędu → zmniejsz obciążenie”.
- **Portal klienta:** karta „Dziś” obok treningu siłowego: „Marszobieg: 6 × (1 min trucht + 2 min marsz)”, licznik bloków (bez minutnika w pierwszej wersji — podpowiedź tekstowa), po zakończeniu jedno pytanie „Jak ciężko?” (skala 1–10 z opisami) i pole notatki; działa offline.
- **Skala RPE dla klienta:** 1–2 „bardzo lekko”, 3–4 „lekko, swobodna rozmowa”, 5–6 „średnio, mówię zdaniami”, 7–8 „ciężko, mówię pojedyncze słowa”, 9–10 „maksymalnie” (nie używana w planach początkujących).

## 7. Reguły bezpieczeństwa
1. BA i początkujący: tylko marszobieg i bieg ciągły w strefie rozmownej; RPE docelowe ≤ 5; brak interwałów, tempa, skakanki, sanek.
2. Intensywności ≥ RPE 7 tylko dla Ś/Z i dopiero po ≥ 6 tygodniach bazy.
3. Staw zgłoszony jako bolący (wywiad lub „Coś boli?”) → środki o wysokim obciążeniu stawów (bieg, skakanka) zamieniane na rower/orbitrek/marsz; bez zgody trenera nie wracają.
4. Brak „leczenia”: teksty bez obietnic zdrowotnych i bez diagnoz; stały komunikat „przy bólu w klatce piersiowej, zawrotach głowy lub duszności przerwij wysiłek i skonsultuj się z lekarzem” na ekranie startu jednostki (jak komunikat bólu w treningu).
5. Rozgrzewka (5 min marszu) i schłodzenie wbudowane w każdą jednostkę; interwały i tempo wymagają wcześniejszej rozgrzewki.
6. Wiek/uwagi zdrowotne z wywiadu (nadciśnienie, choroby serca, ciąża) → plan kondycyjny wymaga potwierdzenia trenera („Klient ma zgłoszone uwagi zdrowotne — sprawdź przed ułożeniem planu”).
7. Maks. przyrost czasu tygodniowego 10–15%; generator nie przekroczy tego automatycznie, trener może zmienić świadomie (ostrzeżenie jak przy stawach).
8. Dane kondycyjne są prywatne dla klienta i jego trenera (izolacja jak w pozostałych tabelach, testy A/B).

## 8. Etapy budowy (propozycja)
1. Migracje i słownik środków (STOP-2) + API planu i logów + testy izolacji.
2. Portal: karta „Dziś” z logowaniem i kolejką offline.
3. Panel: szablony metod i siatka tygodnia; kolizje z FBW.
4. Później: strefy tętna / zegarki (wymaga aplikacji natywnej — jak kroki w ROADMAP).

## 9. Do decyzji właściciela (max 5, z rekomendacją)
1. **Własny plan kondycyjny czy dodatkowe „dni” w planie siłowym?** Rekomendacja: własna tabela planu kondycyjnego (pkt 5), ale pokazywana razem z planem siłowym w „Dziś” — prostsza progresja i brak wpływu na objętość siłową.
2. **Czy skala RPE wystarcza na start?** Rekomendacja: tak; test rozmowy jako podpowiedź tekstowa przy skali, bez osobnego pytania.
3. **Tempo progresji dla początkujących: szablony z pkt 3 (marsz 2 min / trucht 1 min × 6–8 → 3/2 → 5/2 → bieg ciągły po ok. 8 tyg.)?** Rekomendacja: tak, z tygodniem lżejszym co 4. tydzień.
4. **Czy tabela celów (pkt 0) ma być w bazie jako edytowalny słownik (`plan_element_rules`)?** Rekomendacja: tak — zmiana częstotliwości bez wdrażania kodu, zmiany tylko przez administratora.
5. **Czy pokazywać klientowi tygodniowy cel czasu kondycji (np. 90 min) obok celu kroków?** Rekomendacja: nie na start — jeden cel tygodniowy na ekranie, pierwszy: liczba jednostek.
