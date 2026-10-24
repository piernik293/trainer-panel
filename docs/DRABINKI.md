# Drabinki progresji — propozycja (etap 2a, do decyzji)

Stan: 24.10.2026, gałąź `feature/drabinki`. **Nic nie wdrożono** (ani w bazie, ani w generatorze). Dane do przeglądu: `docs/DRABINKI-DO-PRZEGLADU.csv` (średnik, UTF-8 z BOM, kolumna `decyzja_trenera` pusta), generator: `scripts/drabinki-propozycja.py` (czyta katalog tylko do odczytu).

## 1. Zasady (do zatwierdzenia)
- **Drabinka** = uporządkowana lista ćwiczeń jednego wzorca ruchu, od najłatwiejszego do najtrudniejszego. Szczeble odpowiadają poziomowi: **BA** (brak aktywności) → **P** (początkujący) → **S** (średniozaawansowany) → **Z** (zaawansowany). Na jednym szczeblu może być kilka ćwiczeń (zamienniki sprzętowe).
- Generator bierze **poziom efektywny** klienta (z regułą 2 lat) i wybiera ćwiczenie ze szczebla właściwego dla tego poziomu, spośród tych, które pasują do sprzętu i miejsca klienta.
- **Zamiennik:** najpierw inne ćwiczenie z tego samego szczebla (inny sprzęt), potem sąsiedni szczebel **niżej**. **Nigdy wyżej** dla brak aktywności i początkujących; dla pozostałych poziomów także nie wyżej niż poziom klienta.
- Wszystkie dotychczasowe filtry zostają: dla nieaktywnych `suitableForNoActivity === true`, trudność uczenia ≤ 2, stawy, ból, `learningDifficulty` null = odrzucenie. Szczebel nie wymusza ćwiczenia, które filtry odrzucają — wtedy zamiennik niżej, a gdy go brak, slot zostaje pusty (brak fallbacku na ćwiczenie niebezpieczne).
- **Trener może ręcznie wstawić dowolny szczebel** (np. przysiad do skrzyni zaawansowanemu z problemem kolan) — z potwierdzeniem, jak przy innych ręcznych zmianach.
- Zmiana szczebla w czasie (awans) to osobny temat — patrz `docs/PROGRESJA.md` (nigdy dwie zmiany naraz).

## 2. Propozycje drabinek (9 wzorców)
Źródło: ćwiczenia, które **już są** w katalogu. Szczeble „do uzupełnienia z bazy zewnętrznej” (11 pozycji) wskazują kandydata z `docs/BAZA-KANDYDACI.csv` (część jest już „nowa”, część to wariant-zamiennik). Przykłady zatwierdzone przez właściciela są oznaczone.

### Przysiad

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Przysiad do skrzyni z masą własnego ciała** (id 90) | Początkujący | 1 | tak | Niskie | przysiad do skrzyni z masą ciała — start dla osób nieaktywnych |
| BA | _do uzupełnienia z bazy zewnętrznej_: Chair Squat (wariant 90) | — | — | — | — | przysiad do krzesła (pomocniczy, niższy próg) |
| P | _do uzupełnienia z bazy zewnętrznej_: Bodyweight Squat | — | — | — | — | przysiad z masą własnego ciała |
| P | **Przysiad goblet z hantlem** (id 88) | Początkujący | 2 | tak | Średnie | goblet — nauka wzorca z przeciwwagą |
| P | **Wypychanie nóg na suwnicy 45°** (id 92) | Początkujący | 2 | brak | Średnie | boczna ścieżka maszynowa: suwnica 45° |
| S | **Przysiad ze sztangą** (id 3) | Średniozaawansowany | 4 | nie | Wysokie | przysiad ze sztangą (przykład zatwierdzony) |
| S | **Przysiad na suwnicy Smitha** (id 93) | Średniozaawansowany | 2 | brak | Średnie | boczna ścieżka maszynowa: suwnica Smitha |
| Z | **Przysiad ze sztangą z przodu** (id 191) | Zaawansowany | 5 | nie | Wysokie | przysiad ze sztangą z przodu |
| Z | **Przysiad na jednej nodze (Pistol Squat)** (id 225) | Zaawansowany | 5 | nie | Wysokie | przysiad jednonóż (pistol) |

### Zawias biodrowy

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Glute bridge** (id 105) | Początkujący | 1 | tak | Niskie | mostek biodrowy (glute bridge) |
| P | **Martwy ciąg rumuński z hantlami** (id 101) | Początkujący | 2 | brak | Niskie | martwy ciąg rumuński z hantlami |
| P | **Martwy ciąg z kettlebell** (id 103) | Początkujący | 2 | tak | Niskie | alternatywa: martwy ciąg z kettlebell (suitable = true) |
| S | **Martwy ciąg rumuński ze sztangą** (id 100) | Średniozaawansowany | 3 | nie | Średnie | martwy ciąg rumuński ze sztangą |
| S | **Martwy ciąg z trap barem** (id 102) | Średniozaawansowany | 3 | nie | Średnie | alternatywa: martwy ciąg z trap barem |
| Z | **Martwy ciąg konwencjonalny** (id 182) | Zaawansowany | 5 | nie | Wysokie | martwy ciąg konwencjonalny |
| Z | **Martwy ciąg sumo** (id 192) | Zaawansowany | 4 | nie | Wysokie | martwy ciąg sumo |

### Wykrok

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Wejście na niskie podwyższenie z podparciem** (id 260) | Brak aktywności fizycznej | 2 | tak | Niskie | wejście na niskie podwyższenie z podparciem |
| BA | **Przysiad wykroczny z podparciem** (id 95) | Początkujący | 2 | tak | Niskie | przysiad wykroczny z podparciem |
| P | _do uzupełnienia z bazy zewnętrznej_: Split Squats | — | — | — | — | przysiad split bez podwyższenia |
| P | **Wykrok w tył** (id 96) | Początkujący | 2 | brak | Średnie | wykrok w tył |
| S | **Wykroki chodzone** (id 97) | Średniozaawansowany | 3 | brak | Średnie | wykroki chodzone |
| Z | **Przysiad bułgarski** (id 94) | Zaawansowany | 4 | nie | Wysokie | przysiad bułgarski |

### Pchanie poziome

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Pompki ścienne** (id 322) | Brak aktywności fizycznej | 1 | tak | Niskie | pompki ścienne (dziś rola „rozgrzewka” — do decyzji, czy ćwiczenie główne) |
| BA | **Wyciskanie na maszynie siedząc** (id 115) | Początkujący | 1 | tak | Niskie | boczna ścieżka maszynowa: wyciskanie na maszynie siedząc |
| P | **Pompki na podwyższeniu** (id 116) | Początkujący | 1 | tak | Niskie | pompki na podwyższeniu |
| P | **Pompki na kolanach** (id 118) | Początkujący | 1 | tak | Niskie | pompki na kolanach |
| P | **Pompki klasyczne** (id 117) | Początkujący | 2 | brak | Niskie | pompki klasyczne |
| S | **Wyciskanie hantli leżąc** (id 170) | Średniozaawansowany | 2 | brak | Średnie | wyciskanie hantli leżąc |
| S | **Wyciskanie sztangi leżąc** (id 1) | Średniozaawansowany | 3 | brak | Średnie | wyciskanie sztangi leżąc (przykład zatwierdzony) |
| Z | **Wyciskanie sztangi na ławce skośnej ujemnej** (id 171) | Zaawansowany | 3 | brak | Średnie | wyciskanie sztangi na ławce ujemnej |
| Z | **Pompki na kółkach gimnastycznych** (id 220) | Zaawansowany | 4 | nie | Niskie | pompki na kółkach gimnastycznych |

### Pchanie pionowe

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Wyciskanie na maszynie nad głowę** (id 137) | Początkujący | 1 | tak | Niskie | wyciskanie na maszynie nad głowę |
| P | **Wyciskanie hantli siedząc** (id 139) | Początkujący | 2 | brak | Średnie | wyciskanie hantli siedząc |
| P | **Wyciskanie hantli nad głowę** (id 4) | Początkujący | 2 | brak | Średnie | wyciskanie hantli nad głowę |
| S | **Arnold press** (id 138) | Średniozaawansowany | 3 | brak | Średnie | Arnold press |
| Z | **Wyciskanie sztangą nad głowę** (id 186) | Średniozaawansowany | 4 | nie | Średnie | wyciskanie sztangą nad głowę |
| Z | _do uzupełnienia z bazy zewnętrznej_: Two-Arm Kettlebell Military Press | — | — | — | — | wyciskanie kettlebell oburącz / landmine |

### Przyciąganie poziome

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Wiosłowanie gumą oporową** (id 134) | Początkujący | 1 | tak | Niskie | wiosłowanie gumą oporową |
| BA | **Wiosłowanie na maszynie** (id 130) | Początkujący | 1 | tak | Niskie | wiosłowanie na maszynie |
| P | **Wiosłowanie jednorącz hantlem** (id 131) | Początkujący | 2 | brak | Niskie | wiosłowanie jednorącz hantlem |
| P | **Wiosłowanie hantlami z podparciem klatki** (id 129) | Początkujący | 2 | brak | Niskie | wiosłowanie hantlami z podparciem klatki |
| P | _do uzupełnienia z bazy zewnętrznej_: Inverted Row | — | — | — | — | wiosłowanie w zwisie (australijskie) |
| S | **Wiosłowanie T-bar z podparciem klatki** (id 132) | Średniozaawansowany | 3 | brak | Średnie | wiosłowanie T-bar z podparciem klatki |
| S | **Wiosłowanie sztangą w opadzie** (id 180) | Średniozaawansowany | 3 | nie | Wysokie | wiosłowanie sztangą w opadzie |
| Z | _do uzupełnienia z bazy zewnętrznej_: Alternating Renegade Row | — | — | — | — | do uzupełnienia (np. wiosłowanie w zwisie z obciążeniem, renegade row) |

### Przyciąganie pionowe

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Ściąganie drążka wyciągu górnego chwytem neutralnym** (id 123) | Początkujący | 2 | tak | Niskie | ściąganie drążka wyciągu górnego chwytem neutralnym |
| BA | _do uzupełnienia z bazy zewnętrznej_: Scapular Pull-Up | — | — | — | — | łopatkowe podciągnięcia w zwisie |
| P | **Podciąganie na maszynie wspomagającej** (id 126) | Początkujący | 2 | brak | Niskie | podciąganie na maszynie wspomagającej |
| P | _do uzupełnienia z bazy zewnętrznej_: Band Assisted Pull-Up (zamiennik) | — | — | — | — | podciąganie z gumą wspomagającą |
| S | _do uzupełnienia z bazy zewnętrznej_: Chin-Up | — | — | — | — | podciąganie podchwytem (chin-up) |
| Z | **Podciąganie na drążku chwytem neutralnym** (id 127) | Zaawansowany | 4 | nie | Średnie | podciąganie chwytem neutralnym |
| Z | **Podciąganie na drążku** (id 2) | Zaawansowany | 4 | nie | Średnie | podciąganie na drążku (przykład zatwierdzony) |

### Core i antyrotacja

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Dead bug** (id 159) | Początkujący | 1 | tak | Niskie | dead bug |
| BA | **Bird dog** (id 160) | Początkujący | 1 | tak | Niskie | bird dog |
| P | **Plank** (id 5) | Początkujący | 1 | tak | Niskie | plank |
| P | **Plank boczny** (id 161) | Początkujący | 1 | tak | Niskie | plank boczny |
| P | **Pallof press** (id 162) | Początkujący | 2 | tak | Niskie | Pallof press (antyrotacja) |
| S | **Hollow body hold** (id 197) | Średniozaawansowany | 2 | brak | Niskie | hollow body hold |
| S | _do uzupełnienia z bazy zewnętrznej_: Pallof Press With Rotation (wariant 162) | — | — | — | — | Pallof press z rotacją |
| Z | **Ab wheel rollout** (id 166) | Zaawansowany | 4 | nie | Wysokie | ab wheel rollout |

### Łydki

| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |
|---|---|---|---|---|---|---|
| BA | **Wspięcia na palce obunóż stojąc** (id 259) | Brak aktywności fizycznej | 1 | tak | Niskie | wspięcia na palce obunóż stojąc |
| P | **Wspięcia na palce jednostronne stojąc** (id 195) | Początkujący | 1 | brak | Niskie | wspięcia na palce jednostronne stojąc |
| S | **Wspięcia na palce stojąc** (id 109) | Początkujący | 1 | brak | Niskie | wspięcia na palce stojąc z obciążeniem |
| S | **Wspięcia na palce siedząc** (id 110) | Początkujący | 1 | brak | Niskie | wspięcia na palce siedząc |
| Z | _do uzupełnienia z bazy zewnętrznej_: Dumbbell Seated One-Leg Calf Raise | — | — | — | — | wspięcia jednonóż z obciążeniem |


## 3. Uwagi o danych (do Twojej decyzji)
1. **Wiele ćwiczeń szczebla P nie ma `suitableForNoActivity = true`** (np. 101, 131, 139): dla klientów nieaktywnych są dziś wyłączone, więc szczebel BA opiera się na ćwiczeniach z `true` (90, 105, 134, 130, 137, 123, 259, 260, 159). Nie zmieniam tego automatycznie — to Twoja ocena (paczka „do przeglądu”).
2. **Rola „rozgrzewka” u ćwiczeń BA:** „Pompki ścienne” (322), „Deska na przedramionach” (323), „Wspięcia na palce” (324) mają dziś rolę `rozgrzewka`, a w drabinkach są szczeblem BA ćwiczeń głównych. Propozycja: pozwolić na ćwiczenie o roli „rozgrzewka” jako szczebel BA albo dodać osobne ćwiczenia główne (do decyzji).
3. **Wspięcia na palce (109, 110)** mają wzorzec „Inne”; krok B katalogu proponuje „Wspięcie na palce” — drabinka łydek zakłada tę zmianę.
4. **Brak szczebla Z** w wiosłowaniu poziomym i sporo „do uzupełnienia” w pionowym przyciąganiu (BA/S) — tu najwięcej zyskuje import z bazy zewnętrznej.
5. 219 „Pompki na uchwytach” i 220 „na kółkach” mają sprzęt „Inny” (nowe wartości listy czekają na wdrożenie).

## 4. Model danych pod wdrożenie (etap 2b, STOP-2 — nie wykonuję bez zgody)
Nowa tabela, addytywnie, po `pg_dump`:
`exercise_ladder_steps(id serial pk, pattern text not null, step_order int not null, level text not null, exercise_id int not null references exercises(id), created_at timestamp default now())`, unikalność `(pattern, exercise_id)`, indeks `(pattern, step_order)`. Pole `level` ∈ {Brak aktywności fizycznej, Początkujący, Średniozaawansowany, Zaawansowany}. Seed z zatwierdzonego CSV. Generator: funkcja `pickLadderStep(pattern, effectiveLevel, clientEquipment)` zwracająca kandydatów uporządkowanych: ten sam szczebel, potem niżej; wynik przechodzi przez dotychczasowe filtry. Testy: zamiennik nigdy trudniejszy dla BA/P, dobór szczebla wg poziomu efektywnego, ręczny wybór trenera.

## 5. Do decyzji (STOP-5 przed wdrożeniem)
1. Czy proponowane drabinki (tabele wyżej) są poprawne? Skreśl/zmień w `decyzja_trenera`.
2. Pozycje „do uzupełnienia” — importować z bazy zewnętrznej (po przeglądzie paczek)?
3. Rola „rozgrzewka” jako szczebel BA (uwaga 2).
4. Zgoda na model danych z sekcji 4 (STOP-2).
