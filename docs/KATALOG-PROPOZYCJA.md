# Propozycja uzupełnienia metadanych 126 starszych ćwiczeń (do przeglądu)

Status: **tylko propozycja** — baza, seed i kod aplikacji niezmienione. Dane w `docs/KATALOG-PROPOZYCJA.csv` (separator `;`, UTF-8 z BOM, otwiera się w Excelu/LibreOffice). Standard: `docs/KATALOG-STANDARD.md`. Generator: `scripts/katalog-propozycja.py` (czyta eksport z SELECT, niczego nie zapisuje).

## Zakres
126 ćwiczeń ze statusem „do_weryfikacji” sprzed listy rozgrzewki: 125 zwykłych (role główne/pomocnicze) + „Band Pull-Apart” (id 209, rola rozgrzewka). We wszystkich 126 `suitableForNoActivity` jest dziś puste („brak”).

## Najważniejsza zasada: suitableForNoActivity
- **Nigdzie nie proponuję `true`.** Plik ma kolumny `suitable_obecnie` (dziś: brak dla wszystkich) i `suitable_propozycja` (tylko „brak (bez zmian)” albo `false`). Test `katalog-propozycja.test.ts` pilnuje, że `true` się nie pojawi.
- Zmianę na `false` proponuję dla ćwiczeń z czynnikami ryzyka dla osób nieaktywnych: trudność uczenia ≥ 4, wysokie obciążenie stawów, skoki/lądowanie albo ćwiczenie wymagające techniki i siły (przy trudności ≥ 3 lub średnim/wysokim obciążeniu stawów). Pewność „wysoka” przy ≥ 2 czynnikach lub plyometrii, „niska” przy jednym.
- Kolumna `suitable_czynniki_ryzyka` wymienia powody, a `suitable_uwaga` podaje neutralne cechy (trudność uczenia, obciążenie stawów). To informacje do Twojej decyzji, **nie** sugestia ustawienia `true`.
- Propozycja: **29 × false**, 97 × bez zmian (brak).

## Podsumowanie propozycji
| Pewność | Liczba |
|---|---|
| wysoka | 69 |
| niska (z uzasadnieniem w CSV) | 57 |

Zmiany względem stanu obecnego (jedno ćwiczenie może mieć kilka):

| Pole | Ćwiczeń |
|---|---|
| nowe: stawy obciążane (`joint_stress_areas`) | 109 (pozostałe 17 — bez wyraźnego stawu z listy, do potwierdzenia) |
| nowe: urządzenie szczegółowo (`equipment_detail`) | 39 |
| miejsce treningu | 6 |
| wzorzec ruchu | 7 |
| wykonanie (jedno-/obustronne) | 1 |
| poziom trudności | 22 |
| sprzęt „Inny” → doprecyzowanie | 3 |
| suitableForNoActivity → false | 29 |

Rola (`główne`/`pomocnicze`) pozostaje bez zmian (wynika z typu Złożone/Izolowane); sprzęt z zamkniętej listy jest już poprawny we wszystkich wierszach (poza trzema „Inny”).

## Jak powstały propozycje (reguły)
- **Stawy:** słowa kluczowe w nazwie (przysiad/wykrok/skoki → kolano; martwy ciąg/hip thrust → biodro i plecy dół; wyciskanie/pompki/dipy/rozpiętki/podciąganie → bark; uginanie/prostowanie ramion, dipy → łokieć; pompki, ćwiczenia nadgarstków → nadgarstek). Lista: Kolano, Biodro, Plecy — dół, Bark, Łokieć, Nadgarstek.
- **Urządzenia (zamknięta lista):** Suwnica 45° (prasa do nóg), Hack squat, Suwnica Smitha, Maszyna do prostowania nóg, Maszyna do uginania nóg, Maszyna odwodzenia nóg, Maszyna przywodzenia nóg, Maszyna Pec Deck (motylek), Maszyna do wyciskania (klatka), Maszyna wspomagająca (podciąganie/dipy), T-bar, Wyciąg górny, Wyciąg dolny, Brama (crossover), Wyciąg — lina, Wyciąg — drążek, Wyciąg — uchwyt jednorącz, Maszyna do łydek (stojąc/siedząc).
- **Miejsce:** maszyny i wyciągi tylko Siłownia; sztanga Siłownia; ćwiczenia z masą ciała, gumami, drążkiem, poręczami także Dom/Plener (poręcze i drążek bez Domu).
- **Poziom:** z trudności uczenia i obciążenia stawów; różnica względem dzisiejszego poziomu zawsze „niska pewność” (to ocena trenera).
- **Wzorzec ruchu:** wartości z listy w standardzie; dla szrugsów i ćwiczeń nadgarstków lista nie ma właściwej pozycji — zostaje „Inne” (propozycje nowych wartości: „Wzruszanie ramion”, „Zgięcie/wyprost nadgarstka”).

## Paczki do przeglądu (po ~25)
Podział wg partii głównej i id. Pełne dane (wszystkie kolumny) w CSV, kolumna `paczka`.

### Paczka 1 (26 ćwiczeń: id 4–211)

| id | Ćwiczenie | Partia | Pewność | Zmiany | suitable |
|---|---|---|---|---|---|
| 4 | Wyciskanie hantli nad głowę | Barki | wysoka | +stawy | brak (bez zmian) |
| 138 | Arnold press | Barki | wysoka | +stawy | brak (bez zmian) |
| 139 | Wyciskanie hantli siedząc | Barki | wysoka | +stawy | brak (bez zmian) |
| 140 | Unoszenie hantli bokiem | Barki | wysoka | +stawy | brak (bez zmian) |
| 141 | Unoszenie ramienia bokiem na wyciągu | Barki | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 143 | Odwrotne rozpiętki na maszynie Pec Deck | Barki | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 144 | Odwrotne rozpiętki z hantlami | Barki | wysoka | +stawy | brak (bez zmian) |
| 145 | Odwrotne rozpiętki na linkach | Barki | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 146 | Unoszenie hantli w przód | Barki | wysoka | +stawy | brak (bez zmian) |
| 186 | Wyciskanie sztangą nad głowę | Barki | wysoka | suitableForNoActivity→false, +stawy | false |
| 208 | Jednorącz odwodzenie ramienia w tył na wyciągu | Barki | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 209 | Rozciąganie gumy przed klatką (Band Pull-Apart) | Barki | niska | stawy: puste | brak (bez zmian) |
| 210 | Rotacja zewnętrzna barku na wyciągu | Barki | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 211 | Rotacja zewnętrzna barku z gumą oporową | Barki | wysoka | +stawy | brak (bez zmian) |
| 147 | Uginanie ramion ze sztangą | Biceps | wysoka | +stawy | brak (bez zmian) |
| 148 | Uginanie ramion ze sztangą EZ | Biceps | wysoka | +stawy | brak (bez zmian) |
| 149 | Uginanie ramion z hantlami | Biceps | wysoka | +stawy | brak (bez zmian) |
| 150 | Uginanie młotkowe z hantlami | Biceps | wysoka | +stawy | brak (bez zmian) |
| 151 | Uginanie ramion z hantlami na ławce skośnej | Biceps | niska | poziom, +stawy | brak (bez zmian) |
| 152 | Uginanie ramion na modlitewniku | Biceps | niska | +stawy | brak (bez zmian) |
| 153 | Uginanie ramion na wyciągu | Biceps | niska | +stawy, +urządzenie | brak (bez zmian) |
| 187 | Uginanie koncentryczne z hantlem | Biceps | wysoka | +stawy | brak (bez zmian) |
| 188 | Uginanie Zottmana | Biceps | wysoka | +stawy | brak (bez zmian) |
| 204 | Uginanie ramion ze sztangą nachwytem | Biceps | niska | poziom, +stawy | brak (bez zmian) |
| 206 | Uginanie ramion w podporze klatki (Spider Curl) | Biceps | niska | poziom, +stawy | brak (bez zmian) |
| 207 | Uginanie ramienia na wyciągu zza ciała (Bayesian Curl) | Biceps | wysoka | +stawy, +urządzenie | brak (bez zmian) |

### Paczka 2 (26 ćwiczeń: id 1–227)

| id | Ćwiczenie | Partia | Pewność | Zmiany | suitable |
|---|---|---|---|---|---|
| 163 | Spięcia brzucha na wyciągu | Brzuch | niska | stawy: puste, +urządzenie | brak (bez zmian) |
| 164 | Odwrotne spięcia brzucha | Brzuch | wysoka | +stawy | brak (bez zmian) |
| 165 | Unoszenie kolan w zwisie | Brzuch | niska | poziom, stawy: puste | brak (bez zmian) |
| 197 | Hollow body hold | Brzuch | niska | poziom, stawy: puste | brak (bez zmian) |
| 198 | Rotacje rosyjskie | Brzuch | wysoka | +stawy | brak (bez zmian) |
| 199 | Woodchop na wyciągu | Brzuch | niska | +stawy, +urządzenie | brak (bez zmian) |
| 200 | Unoszenie nóg w leżeniu | Brzuch | niska | stawy: puste | brak (bez zmian) |
| 227 | Skłony boczne z hantlem | Brzuch | niska | wzorzec, +stawy | brak (bez zmian) |
| 169 | Bear crawl | Całe ciało | niska | stawy: puste | brak (bez zmian) |
| 1 | Wyciskanie sztangi leżąc | Klatka piersiowa | wysoka | +stawy | brak (bez zmian) |
| 113 | Wyciskanie hantli na ławce skośnej dodatniej | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |
| 114 | Wyciskanie sztangi na ławce skośnej dodatniej | Klatka piersiowa | wysoka | +stawy | brak (bez zmian) |
| 117 | Pompki klasyczne | Klatka piersiowa | wysoka | +stawy | brak (bez zmian) |
| 119 | Rozpiętki na maszynie Pec Deck | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 120 | Rozpiętki na bramie na wysokości klatki | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 121 | Rozpiętki na bramie z dołu do góry | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 122 | Rozpiętki na bramie z góry w dół | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 170 | Wyciskanie hantli leżąc | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |
| 171 | Wyciskanie sztangi na ławce skośnej ujemnej | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |
| 172 | Wyciskanie hantli na ławce skośnej ujemnej | Klatka piersiowa | wysoka | +stawy | brak (bez zmian) |
| 173 | Wyciskanie na suwnicy Smitha leżąc | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 174 | Pompki z obciążeniem | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |
| 175 | Dipy na poręczach | Klatka piersiowa | wysoka | suitableForNoActivity→false, +stawy | false |
| 176 | Dipy wspomagane na maszynie | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 177 | Svend Press | Klatka piersiowa | niska | sprzęt inny, +stawy | brak (bez zmian) |
| 178 | Rozpiętki z hantlami leżąc | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |

### Paczka 3 (26 ćwiczeń: id 3–255)

| id | Ćwiczenie | Partia | Pewność | Zmiany | suitable |
|---|---|---|---|---|---|
| 179 | Rozpiętki z hantlami na ławce skośnej | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |
| 215 | Wyciskanie jednorącz na wyciągu | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 216 | Wyciskanie hantli z dociskiem (Squeeze Press) | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |
| 217 | Wyciskanie na maszynie zbieżnej | Klatka piersiowa | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 218 | Pompki z gumą oporową | Klatka piersiowa | niska | poziom, +stawy | brak (bez zmian) |
| 219 | Pompki na uchwytach | Klatka piersiowa | niska | miejsce, poziom, sprzęt inny, +stawy | brak (bez zmian) |
| 220 | Pompki na kółkach gimnastycznych | Klatka piersiowa | niska | miejsce, poziom, suitableForNoActivity→false, sprzęt inny, +stawy | false |
| 221 | Pompki z nogami na podwyższeniu | Klatka piersiowa | niska | miejsce, poziom, +stawy | brak (bez zmian) |
| 3 | Przysiad ze sztangą | Mięśnie czworogłowe uda | niska | poziom, suitableForNoActivity→false, +stawy | false |
| 89 | Przysiad do skrzyni | Mięśnie czworogłowe uda | wysoka | +stawy | brak (bez zmian) |
| 91 | Hack squat na maszynie | Mięśnie czworogłowe uda | niska | suitableForNoActivity→false, +stawy, +urządzenie | false |
| 92 | Wypychanie nóg na suwnicy 45° | Mięśnie czworogłowe uda | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 93 | Przysiad na suwnicy Smitha | Mięśnie czworogłowe uda | niska | poziom, +stawy, +urządzenie | brak (bez zmian) |
| 94 | Przysiad bułgarski | Mięśnie czworogłowe uda | wysoka | suitableForNoActivity→false, +stawy | false |
| 96 | Wykrok w tył | Mięśnie czworogłowe uda | wysoka | +stawy | brak (bez zmian) |
| 97 | Wykroki chodzone | Mięśnie czworogłowe uda | wysoka | +stawy | brak (bez zmian) |
| 99 | Prostowanie nóg na maszynie | Mięśnie czworogłowe uda | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 102 | Martwy ciąg z trap barem | Mięśnie czworogłowe uda | niska | suitableForNoActivity→false, +stawy | false |
| 191 | Przysiad ze sztangą z przodu | Mięśnie czworogłowe uda | wysoka | suitableForNoActivity→false, +stawy | false |
| 225 | Przysiad na jednej nodze (Pistol Squat) | Mięśnie czworogłowe uda | wysoka | suitableForNoActivity→false, +stawy | false |
| 226 | Przysiad Zerchera (Zercher Squat) | Mięśnie czworogłowe uda | wysoka | suitableForNoActivity→false, +stawy | false |
| 250 | Skok z zamachem | Mięśnie czworogłowe uda | niska | poziom, suitableForNoActivity→false, +stawy | false |
| 251 | Skok w dal z miejsca | Mięśnie czworogłowe uda | niska | poziom, suitableForNoActivity→false, +stawy | false |
| 252 | Zeskok z natychmiastowym wybiciem | Mięśnie czworogłowe uda | niska | miejsce, suitableForNoActivity→false, +stawy | false |
| 254 | Skoki boczne jednonóż | Mięśnie czworogłowe uda | wysoka | suitableForNoActivity→false, +stawy | false |
| 255 | Skok jednonóż | Mięśnie czworogłowe uda | wysoka | suitableForNoActivity→false, +stawy | false |

### Paczka 4 (26 ćwiczeń: id 2–258)

| id | Ćwiczenie | Partia | Pewność | Zmiany | suitable |
|---|---|---|---|---|---|
| 258 | Przeskoki boczne z nogi na nogę | Mięśnie czworogłowe uda | niska | wykonanie, suitableForNoActivity→false, +stawy | false |
| 100 | Martwy ciąg rumuński ze sztangą | Mięśnie dwugłowe uda | niska | suitableForNoActivity→false, +stawy | false |
| 101 | Martwy ciąg rumuński z hantlami | Mięśnie dwugłowe uda | wysoka | +stawy | brak (bez zmian) |
| 106 | Uginanie nóg siedząc na maszynie | Mięśnie dwugłowe uda | niska | stawy: puste, +urządzenie | brak (bez zmian) |
| 107 | Uginanie nóg leżąc na maszynie | Mięśnie dwugłowe uda | niska | stawy: puste, +urządzenie | brak (bez zmian) |
| 192 | Martwy ciąg sumo | Mięśnie dwugłowe uda | wysoka | suitableForNoActivity→false, +stawy | false |
| 193 | Uginanie nóg na wyciągu stojąc | Mięśnie dwugłowe uda | niska | stawy: puste, +urządzenie | brak (bez zmian) |
| 111 | Odwodzenie nóg na maszynie | Odwodziciele | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 196 | Odwodzenie biodra na wyciągu | Odwodziciele | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 2 | Podciąganie na drążku | Plecy | wysoka | suitableForNoActivity→false, +stawy | false |
| 125 | Ściąganie drążka wyciągu górnego podchwytem | Plecy | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 126 | Podciąganie na maszynie wspomagającej | Plecy | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 127 | Podciąganie na drążku chwytem neutralnym | Plecy | wysoka | suitableForNoActivity→false, +stawy | false |
| 129 | Wiosłowanie hantlami z podparciem klatki | Plecy | niska | stawy: puste | brak (bez zmian) |
| 131 | Wiosłowanie jednorącz hantlem | Plecy | niska | stawy: puste | brak (bez zmian) |
| 132 | Wiosłowanie T-bar z podparciem klatki | Plecy | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 135 | Ściąganie prostych ramion na wyciągu | Plecy | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 180 | Wiosłowanie sztangą w opadzie | Plecy | niska | suitableForNoActivity→false, +stawy | false |
| 181 | Wiosłowanie podchwytem ze sztangą | Plecy | niska | suitableForNoActivity→false, +stawy | false |
| 182 | Martwy ciąg konwencjonalny | Plecy | wysoka | suitableForNoActivity→false, +stawy | false |
| 183 | Wznosy tułowia | Plecy | niska | miejsce, +stawy | brak (bez zmian) |
| 184 | Szrugowanie ze sztangą | Plecy | niska | stawy: puste | brak (bez zmian) |
| 201 | Superman | Plecy | wysoka | +stawy | brak (bez zmian) |
| 205 | Ściąganie jednorącz wyciągu górnego | Plecy | niska | poziom, +stawy, +urządzenie | brak (bez zmian) |
| 222 | Szrugsy z hantlami | Plecy | niska | stawy: puste | brak (bez zmian) |
| 223 | Szrugsy na suwnicy Smitha | Plecy | niska | stawy: puste, +urządzenie | brak (bez zmian) |

### Paczka 5 (22 ćwiczeń: id 104–257)

| id | Ćwiczenie | Partia | Pewność | Zmiany | suitable |
|---|---|---|---|---|---|
| 224 | High Pull | Plecy | wysoka | suitableForNoActivity→false, +stawy | false |
| 228 | Jefferson Curl | Plecy | niska | wzorzec, suitableForNoActivity→false, +stawy | false |
| 104 | Hip thrust | Pośladki | niska | poziom, +stawy | brak (bez zmian) |
| 108 | Pull-through na wyciągu | Pośladki | niska | +stawy, +urządzenie | brak (bez zmian) |
| 253 | Wskok na podwyższenie | Pośladki | niska | miejsce, suitableForNoActivity→false, +stawy | false |
| 257 | Skok boczny z zatrzymaniem | Pośladki | wysoka | suitableForNoActivity→false, +stawy | false |
| 202 | Uginanie nadgarstków ze sztangą | Przedramiona | niska | wzorzec, +stawy | brak (bez zmian) |
| 203 | Prostowanie nadgarstków ze sztangą | Przedramiona | niska | wzorzec, +stawy | brak (bez zmian) |
| 112 | Przywodzenie nóg na maszynie | Przywodziciele | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 154 | Prostowanie ramion z liną na wyciągu | Triceps | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 155 | Prostowanie ramion z drążkiem na wyciągu | Triceps | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 156 | Prostowanie ramion nad głową z liną | Triceps | wysoka | +stawy, +urządzenie | brak (bez zmian) |
| 157 | Wyciskanie francuskie sztangą EZ | Triceps | wysoka | +stawy | brak (bez zmian) |
| 158 | Wyciskanie sztangi wąskim chwytem | Triceps | niska | +stawy | brak (bez zmian) |
| 189 | Kickback z hantlem na triceps | Triceps | wysoka | +stawy | brak (bez zmian) |
| 190 | Prostowanie ramion nad głową z hantlem | Triceps | wysoka | +stawy | brak (bez zmian) |
| 213 | Wyciskanie JM (JM Press) | Triceps | wysoka | suitableForNoActivity→false, +stawy | false |
| 214 | Francuskie prostowanie ramion gumą oporową zza głowy | Triceps | wysoka | +stawy | brak (bez zmian) |
| 109 | Wspięcia na palce stojąc | Łydki | niska | wzorzec, stawy: puste, +urządzenie | brak (bez zmian) |
| 110 | Wspięcia na palce siedząc | Łydki | niska | wzorzec, stawy: puste, +urządzenie | brak (bez zmian) |
| 195 | Wspięcia na palce jednostronne stojąc | Łydki | niska | stawy: puste | brak (bez zmian) |
| 249 | Skoki pogo | Łydki | niska | wzorzec, suitableForNoActivity→false, +stawy | false |

## Do Twojej decyzji
1. Czy akceptujesz zasadę „`false` tylko tam, gdzie są czynniki ryzyka, reszta zostaje pusta do ręcznej oceny”? Dla pozostałych ćwiczeń `true` może nadać tylko właściciel, ćwiczenie po ćwiczeniu.
2. Nowe wartości listy wzorców ruchu: „Wzruszanie ramion”, „Zgięcie/wyprost nadgarstka”.
3. Uzupełnienie „Inny” w sprzęcie (talerz, uchwyty do pompek, kółka gimnastyczne) — osobne pole `equipment_other` albo nowe wartości listy (np. „Talerz”).
4. Po zatwierdzeniu paczek zrobię migrację danych (osobne zadanie, `pg_dump` przed) i zaktualizuję seed.
