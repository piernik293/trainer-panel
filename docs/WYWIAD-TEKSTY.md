# Teksty pomocnicze wywiadu: stary formularz → gdzie jest teraz

Źródło „starego”: `SurveyForm.tsx` i `lib/survey-config` z commita `259bb38^` (przed usunięciem formularza). Teksty są odtworzone **dosłownie** w `artifacts/client-landing/src/lib/surveyHelpTexts.ts` oraz w konfiguracji (`lib/survey-config`). Test `components/SurveyHelpTexts.test.tsx` renderuje każdy ekran dla czterech profili klienta i sprawdza, że **każdy** tekst z listy (`src/lib/__fixtures__/old-survey-help-texts.json`) jest widoczny — poza dwoma usuniętymi decyzją (z uzasadnieniem w teście).

Uwaga: w starym formularzu **opisy celów treningowych** (np. pod „Budowa sylwetki”) nie istniały — cele były samymi etykietami; jedyny tekst o celu to opis sekcji „Twój cel wyznacza kierunek…”. Również „sugerowany czas treningu dla poziomu” w starym formularzu to ramka z zalecaną liczbą treningów w tygodniu dla poziomu (wiersze „Najczęściej…” poniżej); osobnej sugestii czasu pojedynczego treningu nie było. Jeśli chodziło o coś, co istniało w innej wersji (np. Replit), podaj źródło.

| Rodzaj | Tekst ze starego formularza (dosłownie) | Gdzie jest teraz |
|---|---|---|
| section | Podstawowe informacje pozwalają mi lepiej Cię poznać oraz uwzględnić wiek, wzrost i wagę przy doborze obciążeń i tempa progresji. | ekran „Jak masz na imię?” (opis pod pytaniem) |
| section | Twój cel wyznacza kierunek całego planu — od doboru ćwiczeń, przez intensywność, aż po proporcje treningu siłowego i cardio. | ekran „Jaki jest Twój cel treningowy?” (opis pod pytaniem) |
| section | Poziom zaawansowania decyduje o tym, jak dobieram technikę, złożoność ćwiczeń oraz sposób prowadzenia planu. | ekran poziomu — „Więcej” przy opisie pod pytaniem (żeby ekran mieścił się bez przewijania) |
| section | Informacje o kontuzjach i dolegliwościach są kluczowe dla bezpieczeństwa — pozwalają wykluczyć ryzykowne ćwiczenia i dobrać bezpieczne alternatywy. | ekran „Czy masz kontuzje…?” (opis pod pytaniem) |
| section | Realny czas i częstotliwość treningów pozwalają ułożyć plan, który będzie możliwy do utrzymania na dłuższą metę, a nie tylko przez pierwsze tygodnie. | ekran „Ile treningów tygodniowo…?” (opis pod pytaniem) |
| section | Miejsce oraz dostępny sprzęt decydują o tym, jakie ćwiczenia i warianty obciążeń będą dla Ciebie realnie wykonalne. | ekran „Gdzie najczęściej będziesz trenować?” (opis pod pytaniem) |
| section | Pomaga dobrać ilość aktywności wspierającej redukcję, kondycję i ogólną wydolność. | ekran „Jak uwzględnić cardio w planie?” (+ „(opcjonalnie)”) |
| section | Sen, poziom stresu oraz codzienna aktywność wpływają na zdolność organizmu do regeneracji, co bezpośrednio przekłada się na dobór objętości treningowej. | ekran „Jak dużo ruszasz się na co dzień…?” (opis pod pytaniem) |
| section | Twoje preferencje dotyczące stylu planu, priorytetowych partii oraz technik treningowych pomagają dopasować plan nie tylko pod cel, ale i pod Twój komfort. | ekran „Jaki styl planu Ci odpowiada?” (opis pod pytaniem) |
| section | Miejsce na wszystko, co może mieć znaczenie przy przygotowaniu planu. | ekran „Czy jest coś jeszcze…?” (opis pod pytaniem) |
| hint | Zaznacz obszary, które są dla Ciebie najważniejsze. Pomogą dobrać odpowiednie elementy treningowe. | ekran „Co jest dla Ciebie najważniejsze w sporcie?” |
| hint | Krótko napisz, po co chcesz trenować i co chcesz poprawić. | ekran „Dlaczego chcesz trenować?” |
| hint | Przykłady: ból kolan, ból barków, ból odcinka lędźwiowego, strzelający łokieć, problemy z nadgarstkami, ograniczona ruchomość, przebyte operacje, inne przewlekłe dolegliwości. | ekran „Opisz zdrowie i ograniczenia” (ramka pod opisem) |
| note | Te informacje są zawsze uwzględniane przy doborze ćwiczeń i nie są traktowane jedynie jako preferencja. | ekran „Opisz zdrowie…” (tylko dla początkujących) |
| hint | Pozwoli to lepiej dopasować plan do Twoich oczekiwań oraz możliwości. | ekran „Ile treningów tygodniowo…?” (ramka) |
| hint | 1 = bardzo niski poziom stresu, 10 = bardzo wysoki poziom stresu | ekran „Jak oceniasz swój poziom stresu?” |
| hint | Wyszukaj po nazwie lub opisz ćwiczenie, jeśli nie znasz jego nazwy. | ekran „Ćwiczenia do unikania” (średnio i bardziej zaawansowani) |
| hint | Możesz wskazać ćwiczenia, które lubisz, ale trener może wybrać prostsze lub lepiej dopasowane warianty do Twojego poziomu. | ekran „Ćwiczenia preferowane” (początkujący) |
| hint | Wyszukaj po nazwie — możesz dodać kilka ćwiczeń. | ekran „Jakie są Twoje ulubione ćwiczenia?” (pozostali) |
| hint | Na tym etapie nie musisz wybierać konkretnych priorytetów. Najpierw skupimy się na równomiernym rozwoju całego ciała. | ekran „Partie priorytetowe” (początkujący) |
| hint | Wybierz do 3 partii mięśniowych, na których zależy Ci najbardziej. | ekran „Partie priorytetowe” (pozostali) |
| note | Na początku łatwo pochopnie ocenić, które partie lub ćwiczenia powinny być najważniejsze. Przy Twoim poziomie doświadczenia potraktujemy te wybory jako wskazówkę, a plan będzie przede wszystkim rozwijał całe ciało i uczył podstawowych wzorców ruchowych. | ekran „Partie priorytetowe” (początkujący, ramka) |
| hint | Zaznacz tylko te metody, które chcesz stosować w planie. | ekran „Czy chcesz… metody intensyfikacji?” |
| hint | Krótko dopisz tylko to, co może mieć znaczenie dla planu. | ekran „Czy jest coś jeszcze…?” |
| option | Mam dostęp do pełnego wyposażenia siłowni. | opis opcji „Siłownia” (ekran miejsca) |
| option | Trenuję w domu. | opis opcji „Dom” |
| option | Trenuję głównie na drążkach, poręczach oraz sprzęcie dostępnym na świeżym powietrzu. | opis opcji „Siłownia plenerowa” |
| option | Większość dnia siedzę i mało chodzę. | opis opcji aktywności „Siedzący tryb dnia” |
| option | Regularnie chodzę i wykonuję lekkie codzienne aktywności. | opis opcji „Umiarkowana aktywność” |
| option | Większość dnia jestem w ruchu lub pracuję fizycznie. | opis opcji „Duża aktywność” |
| option | Wykonuję ciężką pracę fizyczną albo intensywnie ruszam się przez większość dnia. | opis opcji „Bardzo duża aktywność” |
| option | Najważniejsze są dla mnie jak najlepsze efekty. | opis stylu „Maksymalna efektywność” |
| option | Chcę osiągać dobre efekty przy zachowaniu komfortu treningów. | opis stylu „Balans efektywności i wygody” |
| option | Zależy mi na prostym, przejrzystym planie, który będzie łatwy do realizacji nawet w gorsze dni. | opis stylu „Prosty i łatwy do utrzymania” |
| option | Nie podejmuję regularnej aktywności fizycznej, nigdy wcześniej nie realizowałem/-am uporządkowanego treningu oporowego lub wracam po długiej przerwie. Chcę spokojnie zacząć, nauczyć się podstawowych wzorców ruchowych i stopniowo przygotować organizm do regularnego wysiłku. | opis poziomu „Brak aktywności fizycznej” (za „Więcej”) |
| option | Mam niewielkie doświadczenie treningowe. Nadal uczę się podstawowych ćwiczeń, poprawnej techniki oraz zasad treningowych i nie czuję się jeszcze pewnie w samodzielnym planowaniu treningów. | opis poziomu „Początkujący” (za „Więcej”) |
| option | Trenuję regularnie i swobodnie wykonuję większość podstawowych ćwiczeń. Rozumiem podstawowe zasady treningowe, potrafię kontrolować technikę i świadomie realizuję plan treningowy. | opis poziomu „Średniozaawansowany” (za „Więcej”) |
| option | Posiadam duże doświadczenie treningowe, bardzo dobrze znam swoje możliwości oraz świadomie wykorzystuję różne metody treningowe do osiągania konkretnych celów. | opis poziomu „Zaawansowany” (za „Więcej”) |
| option | Moc, skoczność, eksplozywność i szybkie generowanie siły. | opis „Dynamika” |
| option | Przyspieszenie, tempo ruchu i szybkie poruszanie się w akcji sportowej. | opis „Szybkość” |
| option | Kontrola ruchu, równowaga, lądowanie i utrzymanie pozycji pod obciążeniem. | opis „Stabilizacja” |
| recommendation | Najczęściej zaleca się rozpoczęcie od 1–3 treningów tygodniowo, aby organizm mógł stopniowo przyzwyczaić się do regularnej aktywności. | ramka „treningi w tygodniu” dla poziomu „Brak aktywności” |
| recommendation | Najczęściej sprawdza się 2–3 treningi tygodniowo, co pozwala rozwijać technikę oraz zapewnia odpowiednią regenerację. | ramka dla poziomu „Początkujący” |
| recommendation | Najczęściej wybierane jest 3–5 treningów tygodniowo. Ostateczna liczba zależy od celu treningowego oraz możliwości regeneracji. | ramka dla poziomu „Średniozaawansowany” |
| recommendation | Najczęściej sprawdza się 4–6 treningów tygodniowo. Liczbę treningów należy dopasować do objętości, celu oraz regeneracji. | ramka dla poziomu „Zaawansowany” |
| recommendation | 💡 Przy tym celu treningi cardio często wspierają osiąganie lepszych efektów. Ostateczna ilość zostanie indywidualnie dopasowana do możliwości, preferencji oraz planu treningowego. | ramka na ekranie cardio (cel redukcja/kondycja/sportowy lub tryb siedzący) |
| recommendation | 👍 To nie problem. W miarę możliwości plan zostanie przygotowany tak, aby ograniczyć ilość cardio lub zastąpić je innymi formami aktywności, jeśli będzie to zgodne z celem treningowym. | ramka po wyborze „tylko niezbędne minimum” |
| recommendation | 💡 Ta informacja pomoże lepiej dopasować plan treningowy do celu oraz preferencji. Cardio nie jest obowiązkowym elementem każdego planu. | ekran „Jak często wykonujesz cardio?” |
| bmi | Podpowiedź: BMI wskazuje podwyższoną masę ciała. Pamiętaj jednak, że BMI nie rozróżnia tkanki tłuszczowej od masy mięśniowej. W wielu przypadkach dobrym rozwiązaniem może być redukcja tkanki tłuszczowej lub rekompozycja sylwetki. | USUNIĘTE celowo (decyzja 23.10): BMI widzi tylko trener, w profilu klienta („Wskazówka dla trenera”) |
| hint | Nie kieruj się wyłącznie liczbą lat treningu. Wybierz poziom, który najlepiej opisuje Twoją wiedzę, umiejętności oraz samodzielność podczas treningów. | USUNIĘTE celowo (decyzja 23.10, reguła 2 lat) → „Wybierz opis, który najlepiej do Ciebie pasuje. Trener dostosuje plan do Twojego doświadczenia.” |
