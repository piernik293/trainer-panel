# Generator: priorytety — audyt i propozycja (25.10.2026)

**Status: tylko dokument (STOP-5). Nic w kodzie generatora nie zostało zmienione w tym bloku.** Opisuję, jak generator działa dziś (stan po scaleniu `feature/import-odmiany`, 527 aktywnych ćwiczeń), i porównuję z hierarchią właściciela. Przy każdym punkcie: **zgodne / różnica**, co zmienić (plik), ryzyko.

Skrót architektury: trasa `routes/planDraftGenerateDay.ts` buduje pulę (filtry twarde), silnik `services/ExerciseSelectionEngineV0.ts` wybiera ćwiczenia w slotach (typ dnia → sloty mięśniowe), potem dawkowanie (`exercisePrescriptionService`), wyrównanie tygodnia (`weekBalance`, `planDraftBalanceWeek`) i aktywacja planu (`routes/plans.ts`, blokada objętości).

---

## 1. Bezpieczeństwo (nigdy do złamania)

| Reguła | Dziś | Ocena |
|---|---|---|
| Ból / staw z wywiadu lub zgłoszenia z 30 dni | `services/jointExclusion.ts`: staw z opisu zdrowia (wyrażenia regularne) + zgłoszenia „Coś boli?” z 30 dni → pula jest cięta raz, przed każdą ścieżką wyboru (generate-day, rekomendacje dnia, rekomendacje, zamiana). Ręczne dodanie przez trenera: ostrzeżenie „Dodać mimo to?”, nie blokada. | **Zgodne.** Słabe punkty: (a) opis zdrowia jest wolnym tekstem, rozpoznawany słowami kluczowymi — synonimy mogą umknąć; (b) ćwiczenia bez znacznika stawu (137 z 527) nie podlegają filtrowi. Zmiana: uzupełnić znaczniki stawów (dane, nie kod); ryzyko niskie. |
| Poziom efektywny i trudność | `lib/effectiveLevel.ts` (reguła 2 lat + nadpisanie trenera) → `withEffectiveLevel`; drabinki (`ladder.allowed`: nigdy ponad szczebel klienta); `learningDifficulty ≤ 2` dla BA/P w `pick()`. | **Zgodne.** |
| BA tylko `suitableForNoActivity` | Silnik: `isNoActivityClient` wymaga `suitableForNoActivity === true` w slotach, zamiennikach i wyrównaniu. W puli 57 takich ćwiczeń. | **Zgodne.** |
| BA/P tylko zweryfikowane | `isGeneratorSafe` (25.10): `reviewed_by_trainer = false` tylko dla Ś/Z. | **Zgodne**, ale z jedną rozbieżnością danych: dwie flagi — `reviewed_by_trainer` i `verification_status`. Dziś 117 ćwiczeń ma `reviewed = true`, a status `do_weryfikacji`; rozgrzewka używa statusu, generator główny flagi. Zmiana: jedna reguła „zweryfikowane” (flaga), status wyprowadzony z niej; plik `exerciseRoles.ts` + migracja danych; ryzyko średnie (zmienia pulę BA/P). |
| Wykluczenia z wywiadu | `avoidedExerciseIds` → `isAvoided` w puli, silnik odrzuca. **Dodatkowo** `FAMILY_BLOCKING_MAP` w trasie blokuje całe rodziny po fragmencie nazwy (martwy ciąg, wiosłowanie, przysiad, wyciskanie nad głowę i sztangą). | **Różnica** (patrz „Dodatkowo: wykluczenia”). |

**Błąd znaleziony w audycie (mój, z 25.10):** `preferMainOverVariants` jest wykonywane PRZED oznaczeniem ćwiczeń wykluczonych (`isAvoided`). Jeśli klient wykluczył ćwiczenie główne, jego odmiany są usuwane z puli (bo „główne jest w puli”), a potem silnik odrzuca samo główne — zostaje dziura. Poprawka: najpierw usunąć wykluczone i ukryte z listy, dopiero potem `preferMainOverVariants` (trasa `planDraftGenerateDay.ts`, ~10 linii + test). Czekam na zgodę (zakaz zmian w tym bloku).

## 2. Wykonalność: miejsce i sprzęt

Dziś: siłownia = pełny katalog (+ zaznaczone), plener = zaznaczone + guma, dom = zaznaczone (`equipmentNormalizer.expandEquipmentForLocation`); zgodność przez `isEquipmentCompatible` (AND/OR) i miejsce ćwiczenia; pusty sprzęt w domu = masa ciała + ostrzeżenie. Worek bokserski w pełnym wyposażeniu siłowni, młot z oponą tylko gdy klient zaznaczy. **Zgodne.**

## 3. Struktura (orientacyjnie)

| Element | Dziś | Ocena / zmiana |
|---|---|---|
| Dni | `splitRecommendationService`: dla BA/P twardy limit dni i dozwolone podziały (pełne ciało, własny), dla Ś/Z lista zgodnych podziałów; niezalecany podział → ostrzeżenie. | **Zgodne** (BA/P twardo, Ś/Z podpowiedź). |
| Czas | `sessionDuration` służy do domyślnych parametrów i przerw w portalu; w trasie generatora i silniku nie znalazłem jego użycia do liczby ćwiczeń (silnik: sloty, min. 4 ćwiczenia). | **Różnica** (niewielka): plan nie dopasowuje długości do deklarowanego czasu. Zmiana: orientacyjny limit liczby ćwiczeń z czasu + „Zalecany zakres” dla trenera; `ExerciseSelectionEngineV0.ts`; ryzyko średnie. |
| Równowaga wzorców | `requiredPatternsForSession` + `applyBeginnerBalancingPass` tylko dla BA/P. | **Różnica:** Ś/Z bez kontroli; wystarczy brakujące wzorce zgłaszać trenerowi jako podpowiedź. |
| Objętość tygodniowa | Wytyczne per poziom i cel mięśniowy (`volume_guidelines`: preferowany sufit i absolutny sufit). Propozycja startowa = sufit absolutny dla wszystkich poziomów (`planDraftVolumeDecisionService`); `weekBalance` tnie serie do sufitu; **aktywacja planu jest twardo blokowana** powyżej sufitu absolutnego dla każdego poziomu (`routes/plans.ts`, „Aktywacja zablokowana…”). | **Różnica.** Właściciel: Ś/Z → ostrzeżenie, BA/P → blokada zostaje. Zmiana: w `plans.ts` blokada tylko dla BA/P; dla Ś/Z odpowiedź 200 z listą ostrzeżeń; w panelu (`VolumePanel`) statusy zamienić na „Objętość: w zalecanym zakresie ✓” / „powyżej zalecanego zakresu — sprawdź” / „poniżej…”. Ryzyko: średnie (to ścieżka aktywacji; testy aktywacji do zmiany świadomie). Osobno: propozycja startowa na górze zakresu (nie w środku) — do decyzji. |

## 4. Cel i priorytet partii

| Element | Dziś | Ocena / zmiana |
|---|---|---|
| Cel decyduje o TYPIE treningu | `goalProfileService.buildGoalProfile` → profile: sylwetka (izolacja ceniona, dodatkowe sloty rąk i barków), siła (wielostawowe, izolacja po złożonych), redukcja (jak sylwetka, cardio osobno), kondycja (proste, powtarzalne), sprawność (jednonóż, bez nasycenia mocą), sport (siła, moc, obciążenie nerwowe). Profile wpływają na KOLEJNOŚĆ kandydatów, nie na filtry. | **Zgodne** co do kierunku; brakuje: kondycja „obwody, całe ciało” (nie ma obwodów), pliometria dla sportu/sprawności/kondycji — dodana 25.10 w bloku pliometrycznym. |
| Priorytet partii → rozkład serii | Tier A/B tylko dla Ś/Z (`isPriorityEligible`). Początkujący może w wywiadzie wskazać 1 partię, ale **silnik ją ignoruje**; BA nie ma priorytetu. | **Różnica:** właściciel chce P max 1. Zmiana: `isPriorityEligible` także dla P z jedną partią (Tier A), BA bez; `planDraftGenerateDay.ts`; ryzyko średnie (zmienia plany P). |
| Ćwiczenia przypisane do celu mają pierwszeństwo | `scoreTrainingGoal` daje +20 pkt, gdy `exercises.training_goals` zawiera DOKŁADNIE nazwę celu klienta. | **Różnica poważna — dane:** w katalogu są stare nazwy celów (Masa mięśniowa 132, Siła 71, Zdrowie ogólne 48), **Redukcja tkanki tłuszczowej: 0 ćwiczeń**, Budowa sylwetki 10, Zwiększenie siły 23, Poprawa kondycji 15; 294 ćwiczenia (56%) nie mają celów w ogóle. Bonus działa więc prawie wyłącznie dla sprawności i sportu. Zmiana: (1) mapowanie starych nazw na 6 celów (jak `normalizeTrainingGoal`) w porównaniu i w danych, (2) uzupełnienie `cele` dla głównych ćwiczeń (po akceptacji właściciela), (3) pomiar wpływu punktów na wybór — silnik slotowy sortuje kandydatów wg priorytetu/trudności/id, a punkty wpływają głównie na kolejność wstępną puli. Ryzyko: wysokie dla wyników (zmienia wybory) — wdrażać z testem porównawczym przed/po. |

## 5. Dobór

| Reguła | Dziś | Ocena |
|---|---|---|
| Szczebel drabinki wg poziomu | `buildLadderRules`: bez wyższego szczebla; bonus za szczebel własny. | **Zgodne.** |
| Główne przed odmianą | `preferMainOverVariants` (25.10) — z błędem opisanym w pkt 1. | **Zgodne po poprawce.** |
| Wielostawowe przed jednostawowym | Kolejność w dniu: pliometria → główne złożone → wtórne złożone → izolacja → brzuch (`sessionOrderRank`); w slotach złożone mają pierwszeństwo wg profilu celu. | **Zgodne.** |
| Zweryfikowane przed niezweryfikowanym | Tylko bramka: dla BA/P niezweryfikowane wyłączone; dla Ś/Z zweryfikowane i niezweryfikowane są równe (importy: 331 niezweryfikowanych, 117 bez statusu). | **Różnica.** Zmiana: dla Ś/Z lekka premia za zweryfikowane (`lib/recommendation-engine.ts` albo sortowanie w silniku); ryzyko niskie. |

## 6. Kolejność w treningu

Dziś: rozgrzewka (osobno, portal) → [blok pliometryczny, klasa „plyometric_power”, ranga 0] → główne złożone → wtórne → izolacja → brzuch; schłodzenie osobno (od 25.10 osobny kafelek). **Zgodne.**

---

## Dodatkowo

### Stałość i długość cyklu
- Dziś: plan to jeden blok o długości 4–12 tygodni (domyślnie 6, BA zawsze 4); w obrębie bloku ćwiczenia się nie zmieniają (nie ma rotacji), więc „główne stałe” jest spełnione trywialnie, ale **pomocnicze też są stałe**. Między generacjami działa „zimna lista” (`client_exercise_usage_log`, ostatnie 4 generacje) — zmienia także ćwiczenia główne, co jest sprzeczne z intencją stałości głównych między kolejnymi planami.
- Hierarchia właściciela: BA/P 8–12 tygodni, Ś 6–8, Z 4–6 (trener może zmienić). **Różnica:** dziś BA = 4 (twardo), P/Ś/Z = 6 domyślnie. Zmiana: domyślne i dozwolone zakresy w `planDraftInputService.ts` i `routes/planDraftInput.ts` (BA zakres 8–12 zamiast sztywnych 4), plus w nowej generacji kolejnego bloku — zachowanie wybranych głównych (flaga „stałe główne”) i rotacja tylko pomocniczych. Ryzyko: średnie; BA 8–12 zmienia dziś twardą regułę „4 tygodnie” — wymaga decyzji.

### Wykluczenia z wywiadu
- Dziś: wykluczenie działa dla wybranego ćwiczenia ORAZ całej rodziny po nazwie (6 rodzin). Lista do wyboru w wywiadzie (`AvoidedExercisesPicker`) pochodzi z wyszukiwania katalogu; odmiany są w katalogu, ale nie ma widocznego rozróżnienia ćwiczenie/odmiana.
- Hierarchia: tylko dokładnie wybrana pozycja (RDL ze sztangą wyklucza ten wiersz, RDL z hantlami zostaje), lista zawiera odmiany. **Różnica.** Zmiana: usunąć `FAMILY_BLOCKING_MAP` (trasa generate-day), upewnić się, że picker pokazuje odmiany z podpisem „odmiana: …”; poprawka kolejności z pkt 1; testy. Ryzyko: średnie dla bezpieczeństwa — klient, który wykluczył „martwy ciąg”, dostanie dziś zablokowaną rodzinę, po zmianie tylko tę pozycję; wywiad musi to wyraźnie komunikować („wykluczasz tylko to ćwiczenie”).

### Metody do unikania
- Dziś: pole `advancedMethodsToAvoid` jest zapisywane, ale generator go nie czyta — plan nie zawiera metod intensyfikacji (dropsety, supersery), więc nic nie trzeba wykluczać; jeśli metody pojawią się w planie (np. w module kondycyjnym lub przez trenera), generator nie może ich używać wbrew polu. **Zgodne w praktyce, bez zabezpieczenia.** Zmiana: zasada w kodzie przyszłych metod + test „metoda z listy do unikania nigdy nie trafia do planu”.

---

## Plan wdrożenia (kroki, każdy osobno, z testami)

1. **Poprawka kolejności** `preferMainOverVariants` po usunięciu wykluczonych (pkt 1) + test. Małe, bezpieczne.
2. **Wykluczenia dokładne:** usunięcie `FAMILY_BLOCKING_MAP`, picker z odmianami, tekst w wywiadzie, testy (RDL sztanga/hantle).
3. **Aktywacja: ostrzeżenie zamiast blokady dla Ś/Z**, blokada zostaje dla BA/P; komunikaty „Zalecany zakres” w panelu objętości.
4. **Jedna flaga „zweryfikowane”** (reviewed ⇒ status), migracja danych dla 117 ćwiczeń po akceptacji właściciela.
5. **Cele w katalogu:** mapowanie starych nazw + uzupełnienie `cele` dla ćwiczeń głównych (lista do akceptacji), potem pomiar wpływu na wybory (test porównawczy).
6. **Priorytet partii dla P (1 partia).**
7. **Długości cykli** (BA/P 8–12, Ś 6–8, Z 4–6) i stałość głównych między blokami.
8. **Orientacyjny czas sesji / równowaga wzorców dla Ś/Z** jako podpowiedzi.

## Pytania do właściciela (z rekomendacją)

1. **Czy zacząć od kroków 1–2 (poprawka kolejności i dokładne wykluczenia)?** Rekomendacja: tak, to korekty bezpieczeństwa i spójności; krok 1 to błąd z mojego wdrożenia odmian.
2. **Blokada aktywacji dla Ś/Z → ostrzeżenie: czy dotyczy to też celu „Redukcja”, gdzie objętość bywa wysoka?** Rekomendacja: tak, dla wszystkich celów Ś/Z, z wyraźnym komunikatem; BA/P bez zmian.
3. **Długość bloku BA: dziś 4 tygodnie twardo; hierarchia mówi 8–12. Czy zmieniać?** Rekomendacja: tak, ale z domyślnymi 8 i zakresem 8–12, bo dłuższy blok daje więcej czasu na naukę techniki; trener może skrócić.
4. **Czy uzupełnić `cele` w katalogu (294 ćwiczenia bez celów, 0 dla redukcji)?** Rekomendacja: tak — najpierw mapowanie starych nazw (automat), potem lista ~60 ćwiczeń głównych do Twojej akceptacji.
5. **Czy wykluczenie ma dotyczyć tylko wybranej pozycji także dla bardzo zbliżonych odmian tego samego ruchu (np. ten sam chwyt, inny uchwyt)?** Rekomendacja: tak — dokładna pozycja, zgodnie z hierarchią; wywiad pokazuje odmiany, więc klient może zaznaczyć kilka.


---

## Cele w katalogu — mapowanie i reguły przypisania (wdrożone 25.10.2026, migracja 0033)

**Mapowanie starych nazw na 6 celów z bazy** (dotyczy ćwiczeń, które już miały cele): Masa mięśniowa, Hipertrofia → Budowa sylwetki; Siła → Zwiększenie siły; Kondycja, Wytrzymałość siłowa → Poprawa kondycji; Zdrowie ogólne, Stabilizacja → Poprawa sprawności.

**Reguły dla ćwiczeń głównych i pomocniczych bez celów** (rozgrzewki, rozciąganie, technika biegu — bez celów, bo nie są ćwiczeniami planu głównego):
| Cel | Reguła |
|---|---|
| Budowa sylwetki | każde ćwiczenie główne i pomocnicze |
| Zwiększenie siły | wielostawowe + priorytet „Wysoki”/„Bardzo wysoki” + obciążenie zewnętrzne (sztanga, hantle, kettlebell, maszyna, wyciąg, landmine, talerz) |
| Redukcja tkanki tłuszczowej | wielostawowe (dużo mięśni naraz) |
| Poprawa kondycji | wielostawowe i (całe ciało albo masa ciała/kettlebell/TRX/piłka lekarska/guma we wzorcach przysiad, wykrok, zawias, pchanie/przyciąganie poziome, lokomocja) |
| Poprawa sprawności | wielostawowe jednonóż lub we wzorcach wykrok, stabilizacja, anty-ekstensja, anty-rotacja, rotacja, lokomocja; oraz stabilizacja/anty-/rotacja także izolowane |
| Cel sportowy | ma intensywność (skoki/moc) albo wielostawowe z obciążeniem nerwowym ≥ 4 |

**Liczba aktywnych ćwiczeń na cel po zmianie** (ćwiczenie może mieć kilka celów): Budowa sylwetki 375 · Poprawa sprawności 121 · Redukcja tkanki tłuszczowej 104 · Zwiększenie siły 94 · Cel sportowy 47 · Poprawa kondycji 42. Wcześniej: Redukcja 0, Budowa sylwetki 10, Zwiększenie siły 23, Poprawa kondycji 15. Ćwiczenia główne i pomocnicze bez celów: 0 (zostały tylko rozgrzewki/rozciąganie).

Uwagi: (1) to zmienia punktację dopasowania do celu (+20), czyli może zmienić wybory generatora — przed szerszym użyciem warto porównać plany przed/po; (2) skrypt zasilający świeżą bazę (`seeds/catalogueSeed.ts`) nadal zawiera stare nazwy — po jego użyciu trzeba powtórzyć migrację 0033.

## Wdrożone 27.10.2026 (gałąź `feature/generator-priorytety`, blok 1)
- **1a** Wykluczenie z wywiadu dotyczy tylko wybranej pozycji (RDL ze sztangą out, RDL z hantlami zostaje); martwa „mapa rodzin” usunięta. Lista wyboru w wywiadzie zawiera odmiany (208 widocznych odmian w katalogu).
- **1b** „Generuj od nowa”: ćwiczenia poprzedniego planu klienta są wykluczone w pierwszym przebiegu; wracają tylko tam, gdzie nie ma innej bezpiecznej opcji (trener widzi notatkę „Powtórzone z poprzedniego planu…”). „Zamień na inne” (`POST /plans/:id/exercises/:id/swap`): zamiennik ten sam wzorzec i partia, inny niż usunięty i niż wszystkie w planie, te same filtry bezpieczeństwa, nigdy wyższy szczebel; brak opcji → miejsce puste do ręcznego wyboru. Wpisy w historii planu. Zamiana na odmianę też nie powtarza ćwiczenia z planu.
- **1c** Aktywacja: BA i P — górny limit serii nadal blokuje; Ś i Z (także cel Redukcja) — plan się aktywuje, a trener widzi „Objętość: w zalecanym zakresie ✓” albo „powyżej zalecanego zakresu — sprawdź”.
- **1d** Długość cyklu: BA/P 8–12 (domyślnie 8), Ś 6–8 (6), Z 4–6 (4); trener może wybrać każdą z 4–12 (poza zakresem — tylko informacja).
- **1e** Cele rozgrzewek i rozciągania: migracja 0037 — 61 ćwiczeń (22 rozgrzewki + 39 rozciągań) bez celu dostało wszystkie 6 celów (są uniwersalne). **Porównanie planów przed/po: 0 zmian** — wybór rozgrzewek i rozciągania (`warmupSelection`, `cooldown`) nie czyta celów ćwiczenia, a punktacja celu (`scoreTrainingGoal`) działa tylko dla ćwiczeń planu głównego (rozgrzewki i rozciąganie są z niego wyłączone przez `mainPlanRoleCondition`). Dane gotowe na przyszłe użycie (np. rozgrzewka wg celu).
- **1f** Katalog w panelu: zakładki „Ćwiczenia treningowe” / „Rozgrzewka i rozciąganie”.
