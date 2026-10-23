/**
 * Client-facing helper texts of the interview, verbatim from the former form (SurveyForm.tsx, git 259bb38^).
 * components/SurveyHelpTexts.test.tsx compares them with the old list, so nothing disappears unnoticed.
 */

/** Section descriptions of the former form — shown on the first screen of the matching group. */
export const SECTION_TEXT = {
  "basic": "Podstawowe informacje pozwalają mi lepiej Cię poznać oraz uwzględnić wiek, wzrost i wagę przy doborze obciążeń i tempa progresji.",
  "goal": "Twój cel wyznacza kierunek całego planu — od doboru ćwiczeń, przez intensywność, aż po proporcje treningu siłowego i cardio.",
  "level": "Poziom zaawansowania decyduje o tym, jak dobieram technikę, złożoność ćwiczeń oraz sposób prowadzenia planu.",
  "health": "Informacje o kontuzjach i dolegliwościach są kluczowe dla bezpieczeństwa — pozwalają wykluczyć ryzykowne ćwiczenia i dobrać bezpieczne alternatywy.",
  "time": "Realny czas i częstotliwość treningów pozwalają ułożyć plan, który będzie możliwy do utrzymania na dłuższą metę, a nie tylko przez pierwsze tygodnie.",
  "place": "Miejsce oraz dostępny sprzęt decydują o tym, jakie ćwiczenia i warianty obciążeń będą dla Ciebie realnie wykonalne.",
  "cardio": "Pomaga dobrać ilość aktywności wspierającej redukcję, kondycję i ogólną wydolność.",
  "life": "Sen, poziom stresu oraz codzienna aktywność wpływają na zdolność organizmu do regeneracji, co bezpośrednio przekłada się na dobór objętości treningowej.",
  "prefs": "Twoje preferencje dotyczące stylu planu, priorytetowych partii oraz technik treningowych pomagają dopasować plan nie tylko pod cel, ale i pod Twój komfort.",
  "additional": "Miejsce na wszystko, co może mieć znaczenie przy przygotowaniu planu."
} as const;

/** Hints under single questions. */
export const HINT_TEXT = {
  "sportNeeds": "Zaznacz obszary, które są dla Ciebie najważniejsze. Pomogą dobrać odpowiednie elementy treningowe.",
  "motivation": "Krótko napisz, po co chcesz trenować i co chcesz poprawić.",
  "healthExamples": "Przykłady: ból kolan, ból barków, ból odcinka lędźwiowego, strzelający łokieć, problemy z nadgarstkami, ograniczona ruchomość, przebyte operacje, inne przewlekłe dolegliwości.",
  "beginnerHealth": "Te informacje są zawsze uwzględniane przy doborze ćwiczeń i nie są traktowane jedynie jako preferencja.",
  "frequency": "Pozwoli to lepiej dopasować plan do Twoich oczekiwań oraz możliwości.",
  "stress": "1 = bardzo niski poziom stresu, 10 = bardzo wysoki poziom stresu",
  "avoided": "Wyszukaj po nazwie lub opisz ćwiczenie, jeśli nie znasz jego nazwy.",
  "favBeginner": "Możesz wskazać ćwiczenia, które lubisz, ale trener może wybrać prostsze lub lepiej dopasowane warianty do Twojego poziomu.",
  "favOther": "Wyszukaj po nazwie — możesz dodać kilka ćwiczeń.",
  "priBeginner": "Wybierz jedną partię, na której chcesz się skupić. Plan i tak rozwinie całe ciało.",
  "priOther": "Wybierz do 3 partii mięśniowych, na których zależy Ci najbardziej.",
  "methods": "Zaznacz tylko te metody, które chcesz stosować w planie.",
  "additional": "Krótko dopisz tylko to, co może mieć znaczenie dla planu."
} as const;

/** Descriptions of the training place options (client wording; the config holds the trainer wording). */
export const LOCATION_DESC: Record<string, string> = {
  "Siłownia": "Mam dostęp do pełnego wyposażenia siłowni.",
  "Dom": "Trenuję w domu.",
  "Siłownia plenerowa": "Trenuję głównie na drążkach, poręczach oraz sprzęcie dostępnym na świeżym powietrzu."
};

/** Descriptions of the plan style options (client wording). */
export const PLAN_STYLE_DESC: Record<string, string> = {
  "Maksymalna efektywność": "Najważniejsze są dla mnie jak najlepsze efekty.",
  "Balans efektywności i wygody": "Chcę osiągać dobre efekty przy zachowaniu komfortu treningów.",
  "Prosty i łatwy do utrzymania": "Zależy mi na prostym, przejrzystym planie, który będzie łatwy do realizacji nawet w gorsze dni."
};
