# Wywiad Treningowy (Training Interview) — v1

## 1. Cel (Purpose)

Wywiad treningowy to formularz zbierający informacje o kliencie potrzebne trenerowi do
ułożenia indywidualnego planu treningowego: cel, poziom doświadczenia, dostępność
sprzętu, ograniczenia zdrowotne oraz preferencje dotyczące stylu treningu i cardio.

Formularz istnieje w dwóch miejscach:

- **`client-landing`** (`/client-landing/`) — publiczny formularz, wypełniany
  samodzielnie przez klienta pod unikalnym linkiem.
- **`trainer-app`** (`/clients/:id/survey`) — ten sam zestaw pytań, wypełniany lub
  edytowany ręcznie przez trenera (np. podczas rozmowy telefonicznej albo poprawek).

Oba formularze zapisują dane do tej samej tabeli `surveys` przez API (`api-server`),
a wynik jest wyświetlany w Panelu Trenera (`ClientDetail.tsx`) na ekranie i w
widoku do wydruku/PDF.

## 2. Przebieg (Flow)

1. Klient otrzymuje link do formularza (`client-landing`) lub trener wypełnia go
   samodzielnie w Panelu Trenera.
2. Formularz jest podzielony na sekcje: dane podstawowe, zdrowie i ograniczenia,
   preferencje treningowe, priorytety, sprzęt/miejsce treningu, cardio, metody
   zaawansowane, dodatkowe informacje.
3. Po wysłaniu (`PUT /api/clients/:clientId/survey` lub publiczny endpoint
   submitu) zapisywany jest **nowy wiersz** w tabeli `surveys` — historia
   poprzednich wywiadów nie jest nadpisywana (append-only), dzięki czemu trener
   widzi pełną historię zmian w zakładce "Historia wywiadów treningowych".
4. Najnowszy wiersz jest traktowany jako "aktualny" wywiad i wyświetlany na karcie
   klienta, w podsumowaniu (`Przegląd`) oraz w widoku do wydruku.

## 3. Logika warunkowa (Conditional logic)

| Warunek | Efekt |
|---|---|
| `experienceLevel` = "Początkujący" lub "Brak aktywności fizycznej" | Pokazuje rekomendację BMI (`showBmiRecommendation`); pola priorytetowych partii (`priorityMuscle1-3`) są **skryte**. |
| `experienceLevel` = "Średniozaawansowany" lub "Zaawansowany" | Pokazuje pola priorytetowych partii mięśniowych oraz pytanie o metody zaawansowane. |
| `trainingGoal` = "Inny" | Pokazuje wymagane pole tekstowe "Opisz swój cel treningowy" (`trainingGoalOther`), zarówno w formularzu klienta, jak i (od tej wersji) w formularzu trenera. |
| `trainingLocation` = "Dom" / "Siłownia plenerowa" | Pokazuje checklistę dostępnego sprzętu (`equipment`) z opcją "Inny sprzęt" (pole tekstowe). Przy "Siłownia" pole sprzętu jest zbędne i skryte. |
| `cardioPreference` = "Lubię cardio" | Pokazuje pomocniczy tekst rekomendacji cardio i pole częstotliwości cardio. |
| `cardioPreference` = "Wolę unikać cardio" | Pokazuje tekst uspokajający (nie trzeba robić cardio, aby osiągnąć cel). |
| `avoidsAdvancedMethods` = true | Pokazuje checklistę konkretnych metod do wykluczenia (`advancedMethodsToAvoid`); jeśli zaznaczono "tak", ale nie wybrano żadnej metody, w panelu trenera wyświetlana jest informacja ogólna (bez pustej listy). |
| Brak `dateOfBirth`, ale istnieje starsze pole `age` | Wiek wyliczany jest z `dateOfBirth`, jeśli jest dostępne; w przeciwnym razie używana jest wartość historyczna `age` (oznaczona w panelu jako "wartość historyczna"). |

## 4. Pola wymagane i opcjonalne

**Wymagane (klient — formularz publiczny):**
Imię, nazwisko, e-mail (poprawny format), data urodzenia (nie może być w
przyszłości), płeć, wzrost, waga, cel treningowy (a jeśli "Inny" — opis celu),
poziom doświadczenia, miejsce treningu (a jeśli dom/plener — co najmniej jeden
element sprzętu), czas trwania sesji, preferowana liczba treningów tygodniowo,
poziom aktywności w ciągu dnia, godziny snu, preferowany styl planu.

**Opcjonalne:** ograniczenia zdrowotne, ulubione/unikane ćwiczenia, partie do
pominięcia, partie priorytetowe (tylko dla średnio/zaawansowanych), staż
treningowy, preferencje cardio, dodatkowe informacje.

**Formularz trenera:** te same pola są edytowalne, ale nie wszystkie są
technicznie wymuszone po stronie UI — trener może zapisać częściowo wypełniony
wywiad. Wyjątek: jeśli `trainingGoal` = "Inny", zarówno formularz klienta, jak i
endpoint API wymagają wypełnienia `trainingGoalOther`.

## 5. Walidacja

- Walidacja pól odbywa się po stronie klienta (Zod + React Hook Form) w obu
  formularzach oraz **ponownie po stronie serwera** (`api-server`), aby dane
  zapisane bezpośrednio przez API (np. przez trenera) nie mogły pominąć
  wymagań biznesowych.
- Reguła "jeśli cel = Inny, to opis celu jest wymagany" jest zaimplementowana
  jako `superRefine` w schemacie klienta oraz jako explicit check w
  `PUT /api/clients/:clientId/survey` i w publicznym endpoincie submitu —
  zapewnia to zgodność niezależnie od tego, kto wypełnia formularz.
- Data urodzenia nie może być w przyszłości (walidacja klienta i serwera).
- Liczbowe pola (wzrost, waga, liczba treningów, wiek) mają rozsądne zakresy
  min/max, aby zapobiec ewidentnie błędnym danym.

## 6. Znane ograniczenia (Known limitations)

- **Legacy pole `weeklyFrequency`**: w bazie danych i schemacie API wciąż
  istnieje starsze pole `weeklyFrequency` (zastąpione przez
  `desiredWeeklyFrequency`). Nie jest już wyświetlane w żadnym UI i nie
  powinno być używane w nowym kodzie. Nie zostało usunięte w tej wersji,
  ponieważ wymagałoby to migracji schematu bazy danych, co wykracza poza
  zakres tej stabilizacji — do rozważenia w przyszłym porządkowaniu.
- **Panel trenera nie jest w pełni responsywny na wąskich ekranach mobilnych**
  (stały panel boczny nie chowa się na szerokościach ~390px) — to ograniczenie
  całego układu aplikacji trenera, nie tylko widoku wywiadu, i wymaga osobnej
  pracy nad layoutem/nawigacją, a nie punktowej poprawki formularza.
- Formularz trenera nie wymusza w UI (walidacja pól "required" na poziomie
  formularza) tych samych obowiązkowych pól, co formularz klienta — pozwala to
  trenerowi zapisać częściowe dane, ale oznacza też, że część pól "wymaganych"
  dla klienta jest tam jedynie umownie wymagana; wymuszana jest tylko reguła
  "Inny cel → opis wymagany" (współdzielona z endpointem API).

## 7. Możliwe usprawnienia (Future improvements)

- Usunięcie pola `weeklyFrequency` z bazy danych i specyfikacji API po
  potwierdzeniu, że żadne raporty/eksporty go nie wykorzystują.
- Responsywny layout Panelu Trenera (chowany sidebar / dolna nawigacja na
  mobile).
- Wymuszenie tych samych reguł "required" w formularzu trenera co w
  formularzu klienta (obecnie ograniczone do zgodności z regułą "Inny cel").
- Rozważenie ujednolicenia formularza trenera i klienta we współdzielony
  komponent, aby uniknąć przyszłego rozjazdu funkcjonalności (tak jak w
  przypadku brakującego wcześniej pola `trainingGoalOther` w formularzu
  trenera, naprawionego w tej wersji).
