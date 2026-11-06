# Przegląd katalogu — jak czytać `docs/PRZEGLAD-KATALOGU.csv` (decyzje 52–54)

**Nic w bazie nie zostało zmienione.** `suitable_for_no_activity`, weryfikację i zatwierdzenie ustawi dopiero Twoja decyzja z tego pliku (kolumna „decyzja właściciela”).

- **Co jest w pliku:** 150 ćwiczeń, które nie mają jeszcze pełnej decyzji (z 446 takich w katalogu 561 aktywnych). Kolejność: najpierw bez sprzętu, z gumą i używane u BA/P, w grupach wg „ile razy brakowało”.
- **„Ile razy brakowało”:** symulacja 1000 profili (3981 dni) dwa razy: stan faktyczny i katalog „odblokowany” (tylko na bazie testowej, potem przywrócona). Liczymy dni, które faktycznie były odrzucone lub miały mniej niż 4 ćwiczenia, a po odblokowaniu użyły tego ćwiczenia. Odblokowanie całego katalogu zmniejsza odmowy dnia z 14,1% do 11,0%, a powtarzalność planu „Generuj od nowa” u BA na siłowni z 92% do 22%.
- **„Ile usunie wg PROPOZYCJI”:** to samo, ale tylko dla poziomów, którym dane ćwiczenie byłoby dostępne po propozycji. Np. „Pompki z obciążeniem” dają 82 dni, ale propozycja „tylko od Ś” nie pomaga BA/P (0), bo to ćwiczenie jest zbyt trudne. Suma dla całego pliku: 173 dni.
- **PROPOZYCJA** to heurystyka (trudność, trudność uczenia, obciążenie stawów, pliometria, duplikaty), nie decyzja: zatwierdź = dla wszystkich poziomów łącznie z BA; tylko od P; tylko od Ś; ukryj. Reguła 50a (BA/P bez trudności „Zaawansowany”) jest już wdrożona; pełna reguła „trudność ≤ poziom” (50b) po Twoim przeglądzie.
- **Sekcja 2 (decyzja 54.4):** 13 brakujących ćwiczeń kalistenicznych (nazwa, opis w 1 zdaniu, szczebel). W dokumencie kalisteniki było napisane „12”, a lista ma 13 pozycji. Ich nie ma w bazie.
- Odtworzenie: `SIM_DUMP=… scripts/generator-sim.sh 1000` (stan faktyczny i odblokowany), potem `scripts/przeglad-katalogu.py zrzut_bazowy.json zrzut_odblokowany.json`.
