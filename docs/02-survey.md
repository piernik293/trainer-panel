# Ankieta Treningowa (Client Survey) — v2

Ten dokument opisuje aktualny stan ankiety wypełnianej przez klienta przed rozpoczęciem współpracy z trenerem ("Wywiad Treningowy"). Dotyczy dwóch miejsc w kodzie, które muszą pozostać zsynchronizowane:

- `artifacts/client-landing/src/components/SurveyForm.tsx` — formularz publiczny wypełniany przez klienta.
- `artifacts/trainer-app/src/pages/SurveyForm.tsx` — formularz edycji ankiety w panelu trenera.
- `artifacts/trainer-app/src/pages/ClientDetail.tsx` — podgląd ankiety w panelu trenera (ten sam komponent obsługuje widok na ekranie i wydruk/PDF przez `window.print()`).
- `lib/db/src/schema/surveys.ts` — schemat tabeli `surveys` (Drizzle).
- `lib/api-spec/openapi.yaml` — kontrakt API (walidacja request/response, generowany kod w `lib/api-zod` i `lib/api-client-react`).

---

## 1. Cel ankiety

Ankieta zbiera dane potrzebne trenerowi do przygotowania indywidualnego planu treningowego, zanim rozpocznie współpracę z klientem. Ma trzy główne zadania:

1. Zebrać dane demograficzne i podstawowe parametry fizyczne klienta (wiek/data urodzenia, płeć, wzrost, waga).
2. Zebrać preferencje i ograniczenia treningowe (cel, doświadczenie, partie mięśniowe, kontuzje, metody intensyfikacji).
3. Dać trenerowi kontekst do szybkiego przygotowania planu — bez podejmowania decyzji za klienta i bez automatycznych "diagnoz". Wszelkie podpowiedzi w ankiecie (płeć → partie priorytetowe, BMI → cel treningowy) mają charakter wyłącznie informacyjny/wizualny.

---

## 2. Aktualne pola

Pola przechowywane w tabeli `surveys` (patrz `lib/db/src/schema/surveys.ts`):

| Pole | Typ w DB | Wymagane przy nowym zgłoszeniu | Opis |
|---|---|---|---|
| `trainingGoal` | text | nie | Cel treningowy (np. Budowa sylwetki, Redukcja tkanki tłuszczowej, Inny) |
| `experienceLevel` | text | tak (klient) | Początkujący / Średniozaawansowany / Zaawansowany |
| `trainingDuration` | text | nie | Jak długo klient trenuje |
| `healthLimitations` | text | nie | Kontuzje / ograniczenia ruchowe / choroby |
| `weeklyFrequency` | integer | nie | Liczba treningów w tygodniu (1–7) |
| `sessionDuration` | text | nie | Czas trwania jednej sesji |
| `preferredMuscles` | text | nie | Partie mięśniowe do priorytetowego rozwoju |
| `avoidedMuscles` | text | nie | Partie do pominięcia |
| `avoidedExercises` | text | nie | Ćwiczenia do bezwzględnego unikania |
| `favoriteExercises` | text | nie | Ulubione ćwiczenia |
| `advancedMethodsToAvoid` | text[] (default `[]`) | nie | Lista zaawansowanych metod intensyfikacji, których klient nie chce stosować |
| `additionalInfo` | text | nie | Dodatkowe informacje od klienta (styl życia, dieta, uwagi) |
| `age` | integer | nie (legacy) | Wiek — pole historyczne, zastąpione przez `dateOfBirth`; nadal odczytywane jako fallback |
| `dateOfBirth` | date | tak (klient) | Data urodzenia — źródło prawdy dla wieku |
| `gender` | text | tak (klient) | Płeć — obecnie tylko `"Mężczyzna"` / `"Kobieta"` dla nowych zgłoszeń |
| `heightCm` | integer | tak (klient) | Wzrost w cm |
| `weightKg` | integer | tak (klient) | Waga w kg |
| `activityLevel` | text | tak (klient) | Poziom aktywności w ciągu dnia |
| `sleepHours` | text | tak (klient) | Średnia liczba godzin snu |
| `stressLevel` | integer | nie (default 5) | Poziom stresu 1–10 |
| `planStylePreference` | text | tak (klient) | Preferowany styl planu |
| `avoidsAdvancedMethods` | boolean | nie | Czy klient zgłasza przeciwwskazania do metod intensyfikacji (pytanie tak/nie poprzedzające listę checkboxów) |

Dodatkowo, dane kontaktowe klienta (`firstName`, `lastName`, `email`, `phone`) żyją w tabeli `clients`, nie w `surveys`, ale są zbierane w tym samym formularzu publicznym.

Pola `firstName`, `lastName`, `dateOfBirth`, `gender`, `heightCm`, `weightKg`, `experienceLevel`, `activityLevel`, `sleepHours`, `planStylePreference` są wymagane przy **nowym** zgłoszeniu publicznym (`PublicSurveySubmission` w OpenAPI). Formularz trenera (`SurveyInput`, edycja istniejącego klienta) traktuje większość pól jako opcjonalne, aby nie blokować zapisu częściowo wypełnionych/starszych ankiet.

---

## 3. Logika dynamiczna

Formularz nie jest statyczny — sekcje i podpowiedzi pokazują się warunkowo, w zależności od wcześniejszych odpowiedzi:

- **Sekcja "Metody intensyfikacji"** (`avoidsAdvancedMethods` + `advancedMethodsToAvoid`) jest widoczna tylko dla `experienceLevel` = Średniozaawansowany lub Zaawansowany (`isIntermediateOrAdvanced`). Lista konkretnych metod (`ADVANCED_METHODS`) rozwija się dodatkowo tylko wtedy, gdy klient odpowie "Tak" na pytanie o przeciwwskazania.
- **Wiek** jest liczony dynamicznie z `dateOfBirth` (funkcja `calculateAge`); pole `age` służy jako fallback tylko dla starszych rekordów bez daty urodzenia.
- **BMI** jest liczone dynamicznie z `heightCm` i `weightKg` (`calculateBmi`), nigdy nie jest zapisywane do bazy danych — patrz sekcja 7.
- **Podpowiedź partii mięśniowych** zależy od wybranej płci — patrz sekcja 6.
- Wszystkie te zależności są realizowane przez `form.watch(...)` w React Hook Form i renderowane warunkowo (`AnimatePresence`/proste `{condition && ...}`) — nie wpływają na wysyłany payload poza polami, które klient faktycznie wypełnił.

---

## 4. Zachowanie dla początkujących (beginner behavior)

Gdy `experienceLevel === "Początkujący"` (`isBeginner`):

- Sekcja "Metody intensyfikacji" jest **całkowicie ukryta** — początkujący nie musi znać ani wybierać zaawansowanych technik.
- W sekcji "Informacje dodatkowe" wyświetla się neutralny komunikat: *"Jako początkujący/a nie musisz znać zaawansowanych technik treningowych — trener dobierze je za Ciebie."*
- Dodatkowo, tylko dla początkujących, może się pojawić podpowiedź BMI (sekcja 7) — obie podpowiedzi (wyjaśnienie o metodach zaawansowanych i podpowiedź BMI) współistnieją i nie zastępują się nawzajem.
- Przy zapisie na backend, jeśli klient nigdy nie zobaczył pytania o `avoidsAdvancedMethods` (bo jest początkujący), pole to zostaje wysłane jako `undefined`/`false`, a `advancedMethodsToAvoid` jako pusta lista — żadne domyślne metody nie są przypisywane automatycznie.

---

## 5. Zachowanie metod zaawansowanych (advanced training methods)

Dla Średniozaawansowanych i Zaawansowanych:

1. Klient odpowiada Tak/Nie na pytanie o przeciwwskazania do metod intensyfikacji.
2. Jeśli "Tak" — pokazuje się lista checkboxów (`ADVANCED_METHODS`: superserie, serie złożone, drop sety, serie do upadku mięśniowego, serie wymuszone, rest-pause), gdzie klient zaznacza konkretne metody, których **nie** chce stosować.
3. Jeśli "Nie" lub pytanie nie zostało jeszcze odpowiedziane — `advancedMethodsToAvoid` zostaje wysłane jako pusta lista.
4. W panelu trenera (`ClientDetail.tsx`), jeśli klient zgłosił przeciwwskazania, ale nie wskazał konkretnych metod, wyświetla się neutralny komunikat informacyjny; jeśli wskazał konkretne metody — pokazywane są jako lista badge'y.

Ważne: to pole opisuje metody, których klient **chce uniknąć**, nie listę metod stosowanych w planie — nazewnictwo i logika muszą to odzwierciedlać w każdej przyszłej zmianie.

---

## 6. Podpowiedzi partii mięśniowych na podstawie płci

Po wybraniu płci, przy pytaniu o "Partie mięśniowe do priorytetowego rozwoju" pojawia się subtelna podpowiedź tekstowa (identyczna w formularzu klienta i formularzu trenera):

- **Kobieta:** "Podpowiedź: Często wybierane cele sylwetkowe: pośladki, uda, brzuch, barki."
- **Mężczyzna:** "Podpowiedź: Często wybierane cele sylwetkowe: klatka piersiowa, barki, plecy, ramiona."

Zasady:

- Podpowiedź pojawia się **tylko po wybraniu płci** — bez wyboru nie jest wyświetlana.
- Jest **czysto informacyjna** — nigdy nie ustawia automatycznie żadnej partii mięśniowej i nie modyfikuje pola `preferredMuscles`.
- Nie zastępuje istniejących wyjaśnień dla początkujących (np. komunikatu o metodach zaawansowanych) — obie podpowiedzi mogą być widoczne równocześnie w różnych sekcjach formularza.
- Fraza zaczyna się zawsze od "Często wybierane..." — celowo nieprzekaźna/nieprzymuszająca forma, nie instrukcja.

---

## 7. Podpowiedź BMI dla początkujących

Zasady wyświetlania (identyczne w formularzu klienta, formularzu trenera i panelu trenera):

- BMI liczone jako `waga_kg / (wzrost_m)²`, wyłącznie po stronie frontendu — **nigdy nie jest zapisywane w bazie danych**.
- Podpowiedź pojawia się tylko gdy **wszystkie trzy warunki** są spełnione:
  1. `experienceLevel === "Początkujący"`,
  2. wzrost i waga są podane,
  3. obliczone BMI ≥ 25.
- Dla Średniozaawansowanych i Zaawansowanych podpowiedź **nigdy** się nie pojawia, niezależnie od wartości BMI.
- Treść podpowiedzi (fiksowana, neutralna, bez wartościowania):

  > "Podpowiedź: BMI wskazuje podwyższoną masę ciała. Pamiętaj, że BMI nie rozróżnia masy mięśniowej i tkanki tłuszczowej. W takim przypadku często warto rozważyć redukcję tkanki tłuszczowej lub rekompozycję sylwetki."

- Podpowiedź **nie wybiera automatycznie** celu treningowego "Redukcja tkanki tłuszczowej" i nie zmienia wyboru dokonanego przez klienta — klient zawsze sam wybiera swój cel.
- Opcjonalnie, obok pól wzrostu/wagi wyświetla się subtelny odczyt "BMI: X.X" (np. "BMI: 27.4") — nie jest to główny element formularza.
- W panelu trenera (`ClientDetail.tsx`, ten sam komponent obsługuje ekran i wydruk/PDF), BMI jest pokazywane jako osobny blok informacyjny, a przy spełnieniu tych samych trzech warunków wyświetla się karta oznaczona etykietą **"Automatyczna podpowiedź"** z tą samą treścią — nigdy nie prezentowana jako diagnoza medyczna.

---

## 8. Notatki o kompatybilności ze starszymi ankietami

Ankieta była rozwijana iteracyjnie; poniższe reguły zapewniają, że starsze rekordy nie powodują błędów aplikacji:

- **Wiek:** starsze rekordy mogą mieć wypełnione tylko pole `age` (bez `dateOfBirth`). Wiek wyświetlany jest przez `dateOfBirth`, jeśli istnieje, w przeciwnym razie przez fallback na `age`.
- **Płeć:** starsze rekordy mogą zawierać usunięte już trzecie legacy wartości (np. "Inna"). Kolumna `gender` w bazie danych nie ma restrykcji enum na poziomie schematu — to zapewnia, że stare wartości nie powodują błędu przy odczycie. W panelu trenera (ekran i wydruk/PDF) każda wartość inna niż `"Mężczyzna"`/`"Kobieta"` jest wyświetlana bezpiecznie jako **"Nieokreślono"**. W formularzu edycji trenera legacy wartość po prostu nie dopasowuje się do żadnej opcji w rozwijanej liście (placeholder), co jest akceptowalnym zachowaniem — aplikacja się nie crashuje.
- **Walidacja przy zapisie (write-side):** enumy `gender` w `SurveyInput`/`PublicSurveySubmission` (OpenAPI) są ograniczone do dwóch wartości i wymuszane po stronie serwera. Odczyt (`Survey` — GET response) pozostaje nieograniczonym stringiem, żeby stare dane nadal się parsowały.
- **BMI:** dla starszych rekordów bez `heightCm`/`weightKg` funkcja liczenia BMI bezpiecznie zwraca `undefined` — żaden blok BMI/podpowiedzi się nie renderuje, bez błędów.
- **Metody zaawansowane:** `advancedMethodsToAvoid` ma domyślną wartość `[]` na poziomie schematu bazy, więc starsze rekordy bez tej kolumny wypełnionej nie powodują błędów renderowania.
- Zasada ogólna na przyszłość: każda zmiana pola ankiety, która zawęża wartości dopuszczalne (enum, wymagalność), powinna być stosowana tylko do **nowych zgłoszeń** (write-side schema), a odczyt (`Survey`/GET) powinien pozostać tolerancyjny dla starych wartości, chyba że wykonana zostanie pełna migracja danych.

---

## 9. Czego NIE należy już dodawać do ankiety

Aby ankieta pozostała krótka, neutralna i nie przeistoczyła się w formularz medyczny/diagnostyczny:

- **Nie dodawać** kolejnych automatycznych "diagnoz" na podstawie danych fizycznych (np. klasyfikacji wagowych, ocen sylwetki, wskaźników tkanki tłuszczowej wyliczanych bez pomiaru).
- **Nie dodawać** oceniającego/wartościującego języka w żadnej podpowiedzi (np. "masz nadwagę", "musisz schudnąć", "powinieneś zredukować") — każda nowa podpowiedź musi zachować neutralny, sugerujący ton ("Podpowiedź: często...").
- **Nie dodawać** logiki, która automatycznie wybiera lub zmienia odpowiedź klienta (cel treningowy, partie mięśniowe, poziom doświadczenia itp.) na podstawie innych pól — wszystkie podpowiedzi mają być czysto wizualne.
- **Nie dodawać** trzeciej opcji płci lub innych wartości enum bez wcześniejszego ustalenia z użytkownikiem/product ownerem strategii migracji starych danych.
- **Nie przechowywać** wartości wyliczanych (BMI i podobne) w bazie danych, chyba że architektura zostanie świadomie rozszerzona o przechowywanie wartości derywowanych (obecnie tego nie robimy).
- **Nie dodawać** pól wymagających danych medycznych wykraczających poza podstawowe kontuzje/ograniczenia zgłaszane przez klienta własnymi słowami (`healthLimitations`) — to nie jest formularz medyczny.
- **Nie zmieniać** architektury formularza (wielosekcyjny, jednostronicowy z animowanymi sekcjami warunkowymi) bez wyraźnej decyzji projektowej — obecny format jest świadomie prosty i lekki.

---

## 10. Rekomendacje na przyszłość

Poniższe kierunki NIE są zaimplementowane — to propozycje do rozważenia w kolejnych iteracjach produktu, wykraczające poza samą ankietę:

- **Panel trenera:** rozszerzenie widoku klienta o historię zmian ankiety (kto i kiedy edytował, diff pomiędzy wersjami), oznaczanie ankiet jako "przegląd zakończony", oraz filtrację/sortowanie listy klientów po statusie ankiety, celu treningowym lub poziomie doświadczenia.
- **Biblioteka ćwiczeń:** osobny moduł z katalogiem ćwiczeń (nazwa, partia mięśniowa, poziom trudności, wariant sprzętowy), który mógłby być powiązany z polami `favoriteExercises`/`avoidedExercises` ankiety zamiast wolnego tekstu — ułatwiłoby to trenerowi budowanie planu i analitykę popularności ćwiczeń.
- **Edytor planu treningowego:** narzędzie do budowania planu treningowego na podstawie odpowiedzi z ankiety (cel, doświadczenie, partie priorytetowe, metody do unikania, ograniczenia zdrowotne) — z możliwością generowania szkicu planu i edycji przez trenera przed wysłaniem klientowi.
- **Portal klienta:** miejsce, gdzie klient mógłby zobaczyć swój plan, zaktualizować dane ankiety (np. zmianę wagi/celu w trakcie współpracy) i komunikować się z trenerem, zamiast jednorazowego formularza publicznego.
- **AI:** wykorzystanie danych ankietowych (cel, doświadczenie, ograniczenia, preferencje partii mięśniowych, BMI jako sygnał pomocniczy — nigdy jako samodzielna diagnoza) jako kontekstu dla asystenta AI wspierającego trenera w tworzeniu pierwszej wersji planu treningowego lub w sugerowaniu pytań uzupełniających do klienta. Każda funkcja AI powinna zachować te same zasady co obecne podpowiedzi: informacyjność, brak automatycznych decyzji za klienta, neutralny ton.
