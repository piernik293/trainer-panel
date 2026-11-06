# Decyzje 52–54: przegląd katalogu — wdrożone (06.11.2026)
**Źródło:** `docs/PRZEGLAD-KATALOGU.csv` (kolumna „decyzja właściciela” wypełniona). **Wdrożenie:** migracja danych `0082_katalog_decyzje_52_54.sql` (kopia bazy `~/backups/trainer_panel_przed_0082_*`, kopia wartości w `catalogue_decision_backup`, cofnięcie: `scripts/katalog-decyzje-cofnij-0082.sql`; nic nie usunięto, „ukryj” = `hidden`).

## Ważne: stan wyjściowy różnił się od pliku
Plik CSV powstał **przed** migracją `0057` (28.10), która wdrożyła wcześniejszą rekomendację (81 od BA / 21 od P / 48 od Ś + 11 ćwiczeń kalistenicznych; L-sit dodała `0058`). Dlatego: (1) z 110 pozycji „zgodnie z PROPOZYCJĄ” 101 już się zgadzało, **9 różniło się** (lista niżej); (2) **wszystkie 13 ćwiczeń z sekcji 2 już są w bazie** — nic nie dodawałem (dodanie drugi raz zrobiłoby duplikaty); poprawiłem tylko szczebel „Pistol z podparciem” (Z → Ś, także w drabince).
- **Reguła 50b („trudność ≤ poziom”) obowiązuje w kodzie od 28.10** (`isGeneratorSafe`), więc E było już „włączone”. Przy decyzji E: symulacja po zmianach **nie pogorszyła** odmów dnia (poprawiła), więc zostaje.

## Co zmieniła migracja (50 ćwiczeń)
- **A:** 20 pozycji → „zatwierdź” (także BA), w tym 89 Przysiad do skrzyni. Zostają „tylko od P”: 227, 163, 164, 108 (227, 163, 108 były dotąd dostępne dla BA — teraz nie).
- **B:** „tylko od P” (nie dla BA): 198, 1110, 1319, 1260, 200, 1281, 1094, 1093, 1629 (trudność Ś → Początkujący), 1180, 1314 (reszta już tak miała); flaga „bark” przy dipach (1093, 1629) **już była** w danych; 1538 Pajacyki → dla wszystkich (u BA tylko jako rozgrzewka: rola „rozgrzewka” nie wchodzi do ćwiczeń głównych).
- **C:** 197, 1092, 1099, 1252 → „tylko od P” (trudność Początkujący, bez dostępu BA). 218 i 1088 bez zmian.
- **Reszta wg PROPOZYCJI (9 różnic względem poprzedniej decyzji):** ukryte: 169 Bear crawl, 201 Superman (był zatwierdzony dla wszystkich), 1084 Inchworm (i tak blokowane w generatorze); zatwierdzone dla wszystkich: 319, 1089, 1202, 1203, 1261, 1618. **Jeśli któraś z tych 9 ma zostać po staremu — napisz, cofnę pojedynczo.**
- **D:** „Pistol z podparciem” → Ś.

## Symulacja 1000 profili, pełny katalog aplikacji (schemat `sim`), przed → po
Naruszenia bezpieczeństwa **0 → 0**, wykonalności **0 → 0**, ćwiczeń ponad poziom **0 → 0**. Odmowy dnia **119 → 88** (3,0% → 2,2% z 3981 dni; dom/plener 117 → 86). Plany z powtórzeniami ćwiczeń: **544 → 551**; BA na siłowni: **13 → 15** z 65 profili (20% → 23%), P na siłowni 64 → 63; mediana zakładki z poprzednim planem 0,27 → 0,25 (plany ze zakładką >50%: 218 → 203). Czyli odmowy spadły, powtarzalność u BA na siłowni **nie spadła** (minimalnie wzrosła) — katalog dla BA na siłowni jest nadal wąski; dalsze odblokowania wymagają osobnej decyzji.
## Testy
Zaktualizowane trzy testy, które pilnowały wcześniejszych decyzji: id 89 (teraz dopuszczony dla BA) i Pistol (szczebel Ś); nowy strażnik migracji `katalog-decyzje-0082.test.ts`.
