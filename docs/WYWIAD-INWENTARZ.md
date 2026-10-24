# Wywiad treningowy — inwentarz (stan na 23.10.2026, przed Wywiadem 2.0)

Źródło: formularz klienta `artifacts/client-landing/src/components/SurveyForm.tsx` (strona
`/client-landing/survey/:token`), opcje i reguły w `lib/survey-config/src/index.ts`, zapis
`POST /api/public/survey/:token` w `artifacts/api-server/src/routes/public.ts` (walidacja
`SubmitPublicSurveyBody` z `lib/api-zod`, nieznane pola są odrzucane). Wszystkie pola trafiają do
tabeli `surveys` (nowy wiersz), wyjątki opisane w kolumnie „Dokąd”.
Formularz trenera (`trainer-app/src/pages/SurveyForm.tsx`) nie jest objęty zmianą.

Skróty „kto używa”:
- **GEN** — generator szkicu planu: `services/planDraftInputService.ts` (wejście generatora) i dalej
  `ExerciseSelectionEngineV0.ts`, `goalProfileService.ts`, `splitRecommendationService.ts`,
  `safetyAndCardioRules.ts`, `athleteAndPlyoRules.ts`, `planDraftVolumeDecisionService.ts`,
  trasy `planDraftGenerateDay.ts`, `planDraftDayRecommendations.ts`; stary silnik `lib/recommendation-engine.ts`.
- **CARDIO** — generator cardio w panelu (`trainer-app/src/lib/cardioGenerator.ts`, `components/CardioSection.tsx`) i `routes/plans.ts`.
- **PROFIL** — profil klienta w panelu (`pages/ClientDetail.tsx`, zakładki Przegląd / Wywiad treningowy).
- **KREATOR** — kreator szkicu planu (`pages/PlanDraftWizard.tsx`, krok „Dane wejściowe”).
- **KOMPL** — kompletność wywiadu (`lib/survey-status.ts`: pole wymagane do statusu „Wypełniona”).
- **KALK** — kalkulatory: dziś tylko BMI (`calculateBmi`, podgląd w wywiadzie i na profilu). BMR/TDEE nie istnieją w kodzie.

## 1. Pytania

| # | Pole (payload) | Treść (etykieta) | Typ | Opcje / zakres | Wymagane | Walidacja / zachowanie | Warunek wyświetlenia | Dokąd | Kto używa |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `firstName` | Imię * | tekst | — | tak | min 1 znak | zawsze | `clients.first_name` tylko przy nowym kliencie* | PROFIL, listy |
| 2 | `lastName` | Nazwisko * | tekst | — | tak | min 1 znak | zawsze | `clients.last_name`* | PROFIL, listy |
| 3 | `email` | E-mail * | e-mail | wstępnie z zaproszenia | tak | trim + format e-mail | zawsze | `clients.email`* | PROFIL, powiadomienie |
| 4 | `phone` | Telefon | tel | — | nie | — | zawsze | `clients.phone`* | PROFIL, lista klientów |
| 5 | `dateOfBirth` (+ `age` liczone) | Data urodzenia * | data DD.MM.RRRR + kalendarz | wiek 0–100 | tak | „❌ Wprowadzona data…”; podgląd „Wiek: N lat”; API: nie w przyszłości | zawsze | `surveys.date_of_birth`, `age` | PROFIL (wiek), KOMPL |
| 6 | `gender` | Płeć * | jednokrotny | Mężczyzna, Kobieta | tak | — | zawsze | `surveys.gender` | PROFIL, KOMPL |
| 7 | `heightCm` | Wzrost (cm) * | liczba | 80–260 | tak | komunikat zakresu | zawsze | `surveys.height_cm` | PROFIL, KALK (BMI), KOMPL |
| 8 | `weightKg` | Waga (kg) * | liczba dziesiętna (przecinek→kropka) | 20–400 | tak | komunikat zakresu; podgląd BMI | zawsze | `surveys.weight_kg` | PROFIL, KALK (BMI), KOMPL |
| 9 | `trainingGoal` | Cel treningowy * | jednokrotny | Budowa sylwetki, Zwiększenie siły, Redukcja tkanki tłuszczowej, Poprawa kondycji, Poprawa sprawności, Cel sportowy | tak | wybór ≠ „Cel sportowy” czyści #10–11; „Cel sportowy” przy poziomie „Brak aktywności fizycznej” czyści #13; podpowiedź BMI gdy początkujący/brak aktywności i BMI ≥ 25 | zawsze | `surveys.training_goal` | GEN, CARDIO, PROFIL, KREATOR |
| 10 | `athleteStatus` | Jak uprawiasz sport? * | jednokrotny | Hobbystycznie, Zawodowo | tak, gdy warunek | wysyłane jako „Tak — amatorsko” / „Tak — zawodowo”; bez sportu zawsze „Nie” | cel = Cel sportowy | `surveys.athlete_status` | GEN (athleteAndPlyoRules, split, goalProfile), KREATOR |
| 11 | `sportPerformanceNeeds` + `sportsPriorities` | Główne priorytety sportowe (opcjonalne) | wielokrotny | Dynamika, Szybkość, Stabilizacja | nie | jedna odpowiedź → 2 pola: nazwy (`sportPerformanceNeeds`) i klucze `dynamika/szybkosc/stabilizacja` (`sportsPriorities`); bez sportu `[]` | cel = Cel sportowy | `surveys.sport_performance_needs`, `sports_priorities` | GEN (needs); PROFIL (priorities) |
| 12 | `trainingMotivation` | Dlaczego chcesz trenować? | tekst | — | nie | — | zawsze | `surveys.training_motivation` | PROFIL |
| 13 | `experienceLevel` | Który poziom najlepiej opisuje Twoje doświadczenie treningowe? * | jednokrotny z opisami | Brak aktywności fizycznej (ukryte przy celu sportowym), Początkujący, Średniozaawansowany, Zaawansowany | tak | dopisek „Nie kieruj się wyłącznie liczbą lat treningu…” | zawsze | `surveys.experience_level` | GEN (objętość, bezpieczeństwo, split), CARDIO, PROFIL, KREATOR, listy |
| 14 | `trainingDuration` | Jak długo trenujesz? | tekst („np. 2 lata”) | — | nie | — | poziom ≠ Brak aktywności (i wybrany) | `surveys.training_duration` | PROFIL (tylko wyświetlanie) |
| 15 | `injuryStatus` | Czy masz jakiekolwiek kontuzje, dolegliwości bólowe lub ograniczenia ruchowe…? * | jednokrotny | Tak, Nie | **gwiazdka, ale brak walidacji** | „Nie” wysyłane jako „Brak” | zawsze | `surveys.injury_status` | GEN (safetyAndCardioRules), CARDIO |
| 16 | `healthLimitations` | Opisz zdrowie i ograniczenia * | tekst wielowierszowy | przykłady w opisie | tak, gdy warunek | przy „Nie” wysyłane jako `""`; dla początkujących dopisek „Te informacje są zawsze uwzględniane…” | #15 = Tak | `surveys.health_limitations` | GEN (bezpieczeństwo), CARDIO, PROFIL, KREATOR, podgląd szkicu |
| 17 | `desiredWeeklyFrequency` | Ile treningów tygodniowo chciałbyś wykonywać? * | liczba | 1–7 (przycinane) | tak | podpowiedź zależna od poziomu (#13) | zawsze | `surveys.desired_weekly_frequency` | GEN (dni w tygodniu), PROFIL |
| 18 | `sessionDuration` | Ile czasu realnie możesz poświęcić na pojedynczy trening? * | jednokrotny | 30–45 min, 45–60 min, 60–90 min, 90+ min | tak | — | zawsze | `surveys.session_duration` | GEN (czas sesji, objętość), PROFIL, KREATOR |
| 19 | `trainingLocation` | Gdzie najczęściej będziesz trenować? * | jednokrotny z opisami | Siłownia, Dom, Siłownia plenerowa | tak | — | zawsze | `surveys.training_location` | GEN (dobór ćwiczeń), PROFIL, KREATOR |
| 20 | `equipment` | Jakim sprzętem dysponujesz? * | wielokrotny + pole „Inny sprzęt” | Hantle, Sztanga i talerze, Ławeczka treningowa, Kettlebell, Gumy oporowe, Drążek do podciągania, TRX / pasy treningowe, Rower stacjonarny / orbitrek, Kółka gimnastyczne, Uchwyty do pompek, Brak sprzętu | tak, gdy warunek | wysyłane jako jeden tekst „a, b, inny” | miejsce = Dom lub Siłownia plenerowa | `surveys.equipment` | GEN (equipmentNormalizer, dobór), PROFIL |
| 21 | `cardioPreference` | Jak uwzględnić cardio? | jednokrotny | „Uwzględnij w planie” → Chętnie uwzględnię cardio w planie; „Tylko niezbędne minimum” → Wolę ograniczyć cardio do niezbędnego minimum | nie | przy „minimum” dopisek uspokajający; baner rekomendacji cardio, gdy cel = redukcja/kondycja/sport lub aktywność = Siedzący | zawsze | `surveys.cardio_preference` | CARDIO, PROFIL |
| 22 | `cardioFrequency` | Jak często wykonujesz cardio? | jednokrotny | Brak, 1× / tydz., 2–3× / tydz., 4+× / tydz. (wartości pełne z survey-config) | nie | — | zawsze | `surveys.cardio_frequency` | CARDIO, PROFIL |
| 23 | `preferredCardioType` | Jaka forma aktywności tlenowej najbardziej Ci odpowiada? | jednokrotny | Marsz, Bieganie, Rower + „Pokaż więcej”: Szybki marsz, Sport (rekreacyjny), Orbitrek, Pływanie, Wioślarz, Schody (Stepper / schody) | nie | — | zawsze | `surveys.preferred_cardio_type` | CARDIO, PROFIL |
| 24 | `activityLevel` | Jak dużo ruszasz się na co dzień poza treningami? * | jednokrotny z opisami | Siedzący, Lekko aktywny, Praca fizyczna, Bardzo aktywny (etykiety: Siedzący tryb dnia / Umiarkowana / Duża / Bardzo duża aktywność) | tak | — | zawsze | `surveys.activity_level` | GEN (regeneracja, cardio), CARDIO, PROFIL, KOMPL |
| 25 | `sleepHours` | Ile godzin średnio sypiasz w ciągu doby? * | jednokrotny | Poniżej 5 godzin, 5–6, 6–7, 7–8 godzin, Powyżej 8 godzin | tak | — | zawsze | `surveys.sleep_hours` | GEN (regeneracja → objętość), PROFIL, KREATOR, KOMPL |
| 26 | `stressLevel` | Jak oceniasz swój poziom stresu? | suwak | 1–10, domyślnie 5 | nie (zawsze wysyłane) | — | zawsze | `surveys.stress_level` | GEN (regeneracja → objętość), PROFIL, KREATOR |
| 27 | `planStylePreference` | Jaki styl planu Ci odpowiada? * | jednokrotny z opisami | Maksymalna efektywność, Balans efektywności i wygody, Prosty i łatwy do utrzymania | tak | dla początkujących pod spodem notka o traktowaniu wyborów jako wskazówki | zawsze | `surveys.plan_style_preference` | KREATOR (wyświetlane), KOMPL; generator nie czyta wartości |
| 28 | `avoidedExerciseIds`, `avoidedExerciseReasons`, `avoidedExerciseOtherText`, `avoidedExerciseOtherReason` | Ćwiczenia do unikania | wyszukiwarka katalogu + powód + „inne” z powodem | katalog ćwiczeń | nie | — | poziom = Średniozaawansowany lub Zaawansowany | `surveys.avoided_exercise_*` | GEN (wykluczenia), planAnalyzer, PROFIL, KREATOR, krok 4 kreatora |
| 29 | `favoriteExercises` | „Jakie są Twoje ulubione ćwiczenia?” / dla początkujących „Ćwiczenia preferowane” | wyszukiwarka katalogu (wiele) | katalog ćwiczeń | nie | wysyłane jako tekst „nazwa, nazwa” | zawsze (inny tekst dla początkujących) | `surveys.favorite_exercises` | GEN (ExerciseSelectionEngineV0: słowa kluczowe), PROFIL |
| 30 | `priorityMuscle1..3` | Partie priorytetowe (Priorytet 1–3) | 3 × lista z wyszukiwaniem | klatka piersiowa, plecy, barki, biceps, triceps, brzuch, uda, pośladki, łydki | nie | opis inny dla początkujących | zawsze | `surveys.priority_muscle_1..3` | GEN (priorytety objętości), PROFIL, statystyki |
| 31 | `avoidsAdvancedMethods` | Czy chcesz, aby w planie były uwzględniane metody intensyfikacji treningu? | jednokrotny | Tak, Nie | nie | wysyłane jako true / false / brak | poziom = Średniozaawansowany lub Zaawansowany | `surveys.avoids_advanced_methods` | PROFIL (tylko wyświetlanie) |
| 32 | `advancedMethodsToAvoid` | (lista metod pod #31) | wielokrotny | Superserie, Serie złożone (Compound Set), Drop sety, Serie do upadku mięśniowego, Serie wymuszone, Rest-Pause | nie | wysyłane tylko gdy #31 = Tak, inaczej `[]` | #31 = Tak (i poziom jak w #31) | `surveys.advanced_methods_to_avoid` | PROFIL (tylko wyświetlanie) |
| 33 | `hasAdditionalInfo` | Czy jest coś jeszcze, co powinienem wiedzieć? | jednokrotny | Tak, Nie | nie | **nie trafia do bazy** (API odrzuca pole) | zawsze | — | nikt (tylko pokazuje #34) |
| 34 | `additionalInfo` | (pole pod #33) „Krótko dopisz tylko to, co może mieć znaczenie dla planu.” | tekst wielowierszowy | — | nie | — | #33 = Tak | `surveys.additional_info` | PROFIL |

\* Imię, nazwisko, e-mail i telefon zapisują się tylko wtedy, gdy zaproszenie tworzy nowego klienta.
Przy zaproszeniu przypiętym do istniejącego klienta (`survey_invites.client_id`) API je pomija —
wymagane w formularzu, ale nigdzie nie zapisane.

Stałe w payloadzie (bez pytania): `age` (z daty urodzenia), `sportDiscipline: undefined`.

**Liczba pytań: 34** (licząc #30 jako jedno pytanie z trzema polami i #28 jako jedno).

## 2. Warunki wyświetlania (dokładnie jak w kodzie)

| Pytanie | Warunek | Co się dzieje po zmianie warunku |
|---|---|---|
| #10, #11 | `trainingGoal === "Cel sportowy"` | zmiana celu na inny **czyści** #10 i #11 |
| opcja „Brak aktywności fizycznej” w #13 | ukryta, gdy cel = Cel sportowy | wybór celu sportowego przy tym poziomie **czyści** #13 |
| #14 | poziom ∈ {Początkujący, Średniozaawansowany, Zaawansowany} | odpowiedź **zostaje** i jest wysyłana także po zmianie na Brak aktywności |
| #16 | `injuryStatus === "Tak"` | przy „Nie” wysyłane `""` (czyszczone przy wysyłce) |
| #20 | miejsce ∈ {Dom, Siłownia plenerowa} | zaznaczony sprzęt **zostaje** i jest wysyłany także przy Siłowni |
| #28, #31 | poziom ∈ {Średniozaawansowany, Zaawansowany} | odpowiedzi **zostają** i są wysyłane także po zmianie na poziom początkujący |
| #32 | `avoidsAdvancedMethods === "Tak"` (i jak #31) | przy „Nie” wysyłane `[]`; przy zmianie poziomu — **zostaje** |
| #34 | `hasAdditionalInfo === "Tak"` | tekst **zostaje** i jest wysyłany także po zmianie na „Nie” |
| podpowiedź BMI przy #9 | poziom początkujący/brak aktywności **i** BMI ≥ 25 | zależy od #13, które jest **później** |
| podpowiedź częstotliwości przy #17 | poziom wybrany | tekst z `TRAINING_FREQUENCY_RECOMMENDATIONS` |
| baner cardio przy #21 | cel ∈ {Redukcja, Poprawa kondycji, Cel sportowy} lub aktywność = Siedzący | zależy od #24, które jest **później** |
| dopiski dla początkujących (#16, #27, #29, #30) | poziom ∈ {Brak aktywności, Początkujący} | tylko tekst |

## 3. Ścieżki według poziomu

Zawsze widoczne (25): #1–9, #12, #13, #15, #17–19, #21–27, #29, #30, #33.
Warunkowe dodatki: sport (#10, #11), ból/kontuzja (#16), dom/plener (#20), dodatkowe info (#34).

| Ścieżka | Pytania poziomu | Razem (min–max) |
|---|---|---|
| Brak aktywności fizycznej | stałe 25 (bez #14; cel sportowy niedostępny) | 25–28 |
| Początkujący | stałe 25 + #14 | 26–31 |
| Średniozaawansowany | stałe 25 + #14, #28, #31 (+ #32) | 28–34 |
| Zaawansowany | jak średniozaawansowany | 28–34 |

**Skąd poziom:** klient wybiera go sam (#13) na podstawie opisów. W kodzie nie ma reguły „~2 lata =
średniozaawansowany”. #14 („Jak długo trenujesz?”) to wolny tekst, którego nic nie analizuje, a
formularz wręcz prosi, by nie kierować się samą liczbą lat. **Rozbieżność z regułą z CLAUDE.md:**
reguła nie jest nigdzie egzekwowana ani podpowiadana.

## 4. Szacowany czas wywiadu (dziś)

Typowa ścieżka początkującego (siłownia, bez kontuzji, bez dodatkowych informacji): ok. **26 pytań,
~5–6 min** (w tym ok. 1,5 min na przewijanie długiej strony i czytanie opisów sekcji).
Ścieżka zaawansowanego z kontuzją, treningiem w domu i ćwiczeniami do unikania: ok. **32–34
pytania, ~9–10 min** (wyszukiwarki ćwiczeń i opisy tekstowe zajmują najwięcej).

## 5. Podział na etapy (propozycja do Wywiadu 2.0 — bez zmiany pytań)

9 etapów + Podsumowanie. Każde pytanie zależne jest po pytaniu, od którego zależy. Grupy na jednym
ekranie tylko dla pól „myślanych razem”.

| Etap | Ekrany (pytania) | Warunkowe |
|---|---|---|
| 1. O Tobie | ① imię + nazwisko (#1, #2) · ② e-mail + telefon (#3, #4) · ③ data urodzenia + płeć (#5, #6) · ④ wzrost + waga (#7, #8, podgląd BMI) | — |
| 2. Cel | ⑤ cel (#9) · ⑥ jak uprawiasz sport (#10) · ⑦ priorytety sportowe (#11) · ⑧ dlaczego chcesz trenować (#12) | ⑥⑦ tylko przy celu sportowym |
| 3. Doświadczenie | ⑨ poziom (#13) · ⑩ jak długo trenujesz (#14) | ⑩ poziom ≠ Brak aktywności |
| 4. Miejsce i sprzęt | ⑪ miejsce (#19) · ⑫ sprzęt (#20) | ⑫ dom / plener |
| 5. Czas i częstotliwość | ⑬ treningi w tygodniu (#17, z podpowiedzią dla poziomu) · ⑭ czas jednego treningu (#18) | — |
| 6. Zdrowie i ograniczenia | ⑮ kontuzje / ból (#15) · ⑯ opis (#16) | ⑯ przy „Tak” |
| 7. Styl życia i regeneracja | ⑰ codzienna aktywność (#24) · ⑱ sen (#25) · ⑲ stres (#26) | — |
| 8. Cardio | ⑳ jak uwzględnić cardio (#21, baner gdy dotyczy) · ㉑ jak często (#22) · ㉒ forma (#23) | — |
| 9. Preferencje planu | ㉓ styl planu (#27) · ㉔ ćwiczenia do unikania (#28) · ㉕ ulubione ćwiczenia (#29) · ㉖ partie priorytetowe (#30) · ㉗ metody intensyfikacji (#31) · ㉘ które metody (#32) · ㉙ coś jeszcze? (#33) · ㉚ opis (#34) | ㉔㉗ śr./zaaw.; ㉘ przy #31 = Tak; ㉚ przy #33 = Tak |
| Podsumowanie | lista etapów z „Zmień” → „Wyślij trenerowi” | — |

Zmiana kolejności względem dzisiejszych sekcji (tylko kolejność wyświetlania, dane bez zmian):
„Miejsce i sprzęt” przed „Czas”, „Zdrowie” po „Czas”, „Styl życia” przed „Cardio” — dzięki temu
baner cardio zależny od aktywności (#24) jest po pytaniu, od którego zależy.

Szacowany czas po zmianie (te same pytania): ścieżka początkującego **~4–5 min** (bez przewijania i
długich opisów sekcji, auto-przejście przy pojedynczym wyborze), ścieżka zaawansowanego **~8 min**.

## 6. Kandydaci do usunięcia lub przeniesienia do późniejszego check-inu (do Twojej decyzji)

Nic nie zostało usunięte. Kolumna „oszczędność” = szacunek dla typowej ścieżki.

| Pytanie | Kto używa | Propozycja | Oszczędność |
|---|---|---|---|
| #33 „Czy jest coś jeszcze…?” (Tak/Nie) | nikt (nie trafia do bazy) | połączyć z #34 w jedno opcjonalne pole tekstowe | 1 ekran, ~5 s |
| #31–32 metody intensyfikacji | tylko profil (generator nie czyta) | przenieść do check-inu po 4–6 tygodniach | 1–2 ekrany, ~20 s (śr./zaaw.) |
| #14 „Jak długo trenujesz?” | tylko profil | zostawić, jeśli ma służyć sprawdzeniu poziomu (reguła ~2 lata); inaczej przenieść | ~10 s |
| #12 „Dlaczego chcesz trenować?” | tylko profil | zostawić (motywacja przydaje się trenerowi) albo przenieść do pierwszej rozmowy | ~25 s |
| #22, #23 częstotliwość i forma cardio | generator cardio w panelu | zostawić | — |
| #27 styl planu | kreator (wyświetla), kompletność; generator nie czyta | zostawić (pole wymagane do statusu „Wypełniona”) lub podłączyć do generatora | — |
| #1–4 dane kontaktowe przy zaproszeniu do istniejącego klienta | ignorowane przez API | wypełnić z danych klienta i pominąć ekrany | 2 ekrany, ~20 s |

Czas typowej ścieżki początkującego: **dziś ~5–6 min → po zmianie formy ~4–5 min → po przyjęciu
wszystkich propozycji ~3,5–4 min**.

## 7. Znaleziska do decyzji (bez zmian w kodzie)

1. **#15 ma gwiazdkę „wymagane”, ale walidacja tego nie sprawdza** — można wysłać wywiad bez
   odpowiedzi o kontuzjach. Pytanie bezpieczeństwa; proponuję uczynić je wymaganym ([STOP-5]).
2. **Odpowiedzi ukrytych pytań są wysyłane** (#14, #20, #28, #31–32, #34 — patrz sekcja 2). Zadanie
   (krok 4) wymaga czyszczenia odpowiedzi po zmianie warunku, a jednocześnie identycznego payloadu jak
   stary formularz — dla tych przypadków to się wyklucza. Proponuję: czyścić (np. sprzęt „Dom” nie
   powinien trafić do generatora przy Siłowni). Do decyzji.
3. **Sen „Poniżej 5 godzin” i „Powyżej 8 godzin” generator traktuje jak brak danych**
   (`parseInt` w `planDraftInputService.ts:294` daje NaN → null). Błąd generatora (osobna poprawka).
4. Opcja „Cardio może być dodatkiem do planu” istnieje w `survey-config` i w formularzu trenera, ale
   klient jej nie widzi (#21 ma 2 z 3 opcji).
5. Reguła „~2 lata = średniozaawansowany” nie istnieje w kodzie (sekcja 3).
6. Podpowiedź BMI przy celu (#9) zależy od poziomu (#13), który jest później. W krokach pokaże się
   tylko, gdy klient wróci do celu po wybraniu poziomu. Propozycja: przenieść podpowiedź na ekran
   poziomu albo na ekran wzrostu i wagi.
7. Generator nie korzysta z #27 (styl planu) ani z #31–32 (metody), choć klient je wypełnia.
8. #26 (stres) ma domyślnie 5 i zawsze jest wysyłany — nie da się odróżnić „5” od „nie ruszałem suwaka”.


---

# Wywiad 2.0 — wdrożenie (kroki 3–4, 23.10.2026)

Decyzje zatwierdzone przez właściciela i ich realizacja:

| Decyzja | Realizacja |
|---|---|
| „Czy jest coś jeszcze?” + pole tekstowe → jedno opcjonalne pole | ekran `additional` (pole `additionalInfo`); `hasAdditionalInfo` nie jest już wysyłane (API i tak go nie zapisywało) |
| Dane osobowe istniejącego klienta → z danych klienta, pominąć | `GET /public/survey/:token` zwraca `existingClient`; ekrany `name` i `contact` pomijane, payload bierze dane z rekordu klienta. Imię z zaproszenia (`clientName`) wypełnia pole „Imię” |
| Metody intensyfikacji i „Dlaczego chcesz trenować?” zostają, opcjonalne | ekrany `methods`, `methodsList`, `motivation` bez wymagań |
| Kontuzje wymagane naprawdę | ekran `injury` blokuje „Dalej”; **API odrzuca wywiad bez `injuryStatus`** (400) i „Tak” bez opisu |
| Czyść ukryte odpowiedzi | `normalizeAnswers()` — lista w tabeli poniżej; test payloadu |
| BMI | **klient nie widzi w wywiadzie żadnej wartości BMI ani komentarza**; trener widzi BMI i neutralną wskazówkę w profilu klienta |
| Sen w generatorze | commit `ccec66a` |
| Opcja „Cardio może być dodatkiem do planu” dla klienta | dodana na ekranie `cardioPref` (3 opcje jak w formularzu trenera) |
| Stres bez wartości domyślnej | suwak bez wartości początkowej, „Nie odpowiadam”; brak odpowiedzi → pole nie jest wysyłane (w bazie `NULL`) |
| „Jak długo trenujesz?” używane | reguła 2 lat (niżej) |

## Reguła 2 lat (STOP-5, zatwierdzona)

Poziom efektywny = **niższy z (wybór klienta, poziom wynikający ze stażu)**; staż < 2 lata → co najwyżej „Początkujący”.
Kod: `artifacts/api-server/src/lib/effectiveLevel.ts`. Generator (`planDraftInputService`,
`planDraftGenerateDay`, `planDraftDayRecommendations`, `recommendations`) dostaje ankietę z poziomem efektywnym,
więc reguły bezpieczeństwa początkującego działają na nim.
- Staż czytany z tekstu: „2 lata”, „1,5 roku”, „pół roku”, „18 miesięcy”, „1 rok 6 mies.”, samo „5” = lata.
  Nieczytelny lub pusty staż → **wybór klienta bez zmian** (bez cichych obniżek).
- Nigdy nie podnosi poziomu; „Brak aktywności fizycznej” i „Początkujący” zostają.
- Trener widzi ostrzeżenie `EFFECTIVE_LEVEL_ADJUSTED` w danych wejściowych generatora: „Klient wybrał X, staż Y — plan jako Z.”
  oraz kartę „Poziom używany przez generator planu” w profilu klienta (zakładka Wywiad) z ręcznym nadpisaniem
  (`PATCH /api/clients/:id/experience-level`, kolumna `clients.experience_level_override`, migracja `0017`, nullable).
- Plan zapisany wcześniej zachowuje swój `experienceLevelUsed`.

## Ekrany (29) i etapy (9) — pytanie → etap → warunkowe → test

Testy: `src/lib/surveyWizard.test.ts` (payload identyczny jak stary formularz dla 7 ścieżek, warunki, czyszczenie,
walidacja, autozapis) i `src/components/SurveyWizard.test.tsx` (interfejs: kroki, auto-przejście, ekran warunkowy,
licznik wielokrotnego wyboru, podsumowanie „Zmień”, wysyłka, wznowienie, klawiatura).

| Etap | Ekran (pytania z inwentarza) | Warunkowy? |
|---|---|---|
| O Tobie | `name` (#1,#2) · `contact` (#3,#4) · `birth` (#5,#6) · `body` (#7,#8 + BMI) | `name`, `contact` pomijane dla istniejącego klienta |
| Cel | `goal` (#9) · `sportStatus` (#10) · `sportNeeds` (#11) · `motivation` (#12) | `sportStatus`, `sportNeeds`: cel = Cel sportowy |
| Doświadczenie | `level` (#13) · `duration` (#14) | `duration`: poziom ≠ Brak aktywności |
| Miejsce i sprzęt | `location` (#19) · `equipment` (#20) | `equipment`: Dom / Siłownia plenerowa |
| Czas i częstotliwość | `frequency` (#17) · `session` (#18) | — |
| Zdrowie i ograniczenia | `injury` (#15) · `healthDesc` (#16) | `healthDesc`: injury = Tak |
| Styl życia | `activity` (#24) · `sleep` (#25) · `stress` (#26) | — |
| Cardio | `cardioPref` (#21) · `cardioFreq` (#22) · `cardioType` (#23) | — |
| Preferencje planu | `planStyle` (#27) · `avoided` (#28) · `favorite` (#29) · `priority` (#30) · `methods` (#31) · `methodsList` (#32) · `additional` (#33+#34) | `avoided`, `methods`: średnio./zaawansowany; `methodsList`: methods = Tak |

**Liczba pytań:** przed 34, po 33 — różnica to zatwierdzone połączenie #33 z #34 w jedno pole. Pozostałe 33 pytania
istnieją, z tymi samymi opcjami i walidacją (ekranów jest 29, bo grupy pól są na jednym ekranie).

## Co zmienia się w payloadzie względem starego formularza (wszystko zatwierdzone)

| Przypadek | Wcześniej | Teraz |
|---|---|---|
| Sprzęt zaznaczony, potem miejsce „Siłownia” | sprzęt wysyłany | pusty |
| Staż wpisany, potem poziom „Brak aktywności” | wysyłany | pusty |
| Opis zdrowia, potem „Nie” | już czyszczony | bez zmian |
| Ćwiczenia do unikania / metody, potem poziom początkujący | wysyłane | puste |
| Dane sportowe, potem cel inny niż sportowy | już czyszczone | bez zmian |
| Stres bez ruszania suwaka | `5` | brak pola (`NULL`) |
| `hasAdditionalInfo` | wysyłane, odrzucane przez API | nie wysyłane |

## Do decyzji (nie wdrożone)

1. Podpowiedź BMI ≥ 25 pokazuje się teraz każdemu, nie tylko początkującym (poziom jest pytany później).
2. Opisy poziomów doświadczenia są długie — ekran poziomu wymaga krótkiego przewinięcia na telefonie.
3. Stary komponent `SurveyForm.tsx` (portal) zostaje w repo nieużywany jako odniesienie; do usunięcia po Twojej zgodzie.
4. Jak kojarzyć odpowiedzi „Poniżej 5 godzin” / „Powyżej 8 godzin” snu z objętością — wartości 4 h i 9 h przyjęte arbitralnie.

## Korekta (23.10.2026, po przeglądzie)
- Ekran poziomu: usunięto zdanie „Nie kieruj się wyłącznie liczbą lat treningu…” (kłóci się z regułą 2 lat). Nowe zdanie:
  „Wybierz opis, który najlepiej do Ciebie pasuje. Trener dostosuje plan do Twojego doświadczenia.”
- Ekran wzrostu i wagi: bez BMI; zdanie wprowadzające: „Wzrost i waga pomagają dobrać obciążenia i tempo progresji.”

## Korekta (23.10.2026, wieczór): pytanie o metody intensyfikacji
- **Co było źle.** Stary formularz (i pierwsza wersja kreatora) pytał „Czy chcesz, aby w planie były uwzględniane metody intensyfikacji?” (Tak/Nie), a po „Tak” prosił o zaznaczenie metod, które klient **chce stosować** — ale zapisywał je w polach o znaczeniu odwrotnym: `avoids_advanced_methods` i `advanced_methods_to_avoid` („unikane”). W bazie lista i flaga w starych wywiadach znaczą więc co innego, niż mówi ich nazwa.
- **Co jest teraz.** Jeden ekran „Metody do unikania” (tylko poziom efektywny średniozaawansowany i zaawansowany): lista zaznaczona = metody do unikania; `avoids_advanced_methods` = lista niepusta.
- **Stare wywiady.** Odpowiedzi zapisane przed `METHODS_QUESTION_FIXED_AT` (`lib/survey-config`, 23.10.2026 20:55 UTC) traktujemy jako **brak danych**: flaga i lista są ignorowane. Panel trenera pokazuje przy nich „Brak danych — odpowiedź z wcześniejszej wersji pytania”, a formularz trenera nie wstępnie wypełnia tych pól. Dane w bazie nie są zmieniane ani usuwane. Generator i tak nie stosuje dziś żadnych metod intensyfikacji.
