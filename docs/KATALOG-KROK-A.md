# Katalog — krok A (wdrożone zmiany zaostrzające)

Data: 24.10.2026. Źródło: `docs/KATALOG-PROPOZYCJA.csv`. Migracja danych: `lib/db/migrations/0020_katalog_krok_a.sql` (generator: `scripts/katalog-krok-ab.py`). Kopia bazy przed zmianą: `~/backups/`.

Zmiany **tylko zaostrzające** — mogą wyłącznie usunąć ćwiczenie z doboru, nigdy dodać: flagi obciążenia stawów, `suitableForNoActivity = false`. Podniesienia `learningDifficulty` propozycja nie zawiera (kolumna „trudnosc_uczenia” to wartość obecna). Reguła „dla nieaktywnych tylko `true`” sprawia, że `false` i brak wartości zachowują się tak samo; `false` zapisuje świadomą ocenę.

## 1. Flagi obciążenia stawów (`joint_stress_areas`): 109 ćwiczeń

Stare: puste (wszystkie). Pole czytają dziś: dobór rozgrzewki i zgłoszenia bólu; nie zmienia doboru ćwiczeń głównych.

| id | ćwiczenie | stare | nowe |
|---|---|---|---|
| 4 | Wyciskanie hantli nad głowę | — | Bark |
| 138 | Arnold press | — | Bark |
| 139 | Wyciskanie hantli siedząc | — | Bark |
| 140 | Unoszenie hantli bokiem | — | Bark |
| 141 | Unoszenie ramienia bokiem na wyciągu | — | Bark |
| 143 | Odwrotne rozpiętki na maszynie Pec Deck | — | Bark |
| 144 | Odwrotne rozpiętki z hantlami | — | Bark |
| 145 | Odwrotne rozpiętki na linkach | — | Bark |
| 146 | Unoszenie hantli w przód | — | Bark |
| 186 | Wyciskanie sztangą nad głowę | — | Bark |
| 208 | Jednorącz odwodzenie ramienia w tył na wyciągu | — | Bark |
| 210 | Rotacja zewnętrzna barku na wyciągu | — | Bark |
| 211 | Rotacja zewnętrzna barku z gumą oporową | — | Bark |
| 147 | Uginanie ramion ze sztangą | — | Łokieć, Nadgarstek |
| 148 | Uginanie ramion ze sztangą EZ | — | Łokieć, Nadgarstek |
| 149 | Uginanie ramion z hantlami | — | Łokieć |
| 150 | Uginanie młotkowe z hantlami | — | Łokieć |
| 151 | Uginanie ramion z hantlami na ławce skośnej | — | Łokieć |
| 152 | Uginanie ramion na modlitewniku | — | Łokieć |
| 153 | Uginanie ramion na wyciągu | — | Łokieć |
| 187 | Uginanie koncentryczne z hantlem | — | Łokieć |
| 188 | Uginanie Zottmana | — | Łokieć |
| 204 | Uginanie ramion ze sztangą nachwytem | — | Łokieć, Nadgarstek |
| 206 | Uginanie ramion w podporze klatki (Spider Curl) | — | Łokieć |
| 207 | Uginanie ramienia na wyciągu zza ciała (Bayesian Curl) | — | Łokieć |
| 164 | Odwrotne spięcia brzucha | — | Plecy — dół |
| 198 | Rotacje rosyjskie | — | Plecy — dół |
| 199 | Woodchop na wyciągu | — | Plecy — dół |
| 227 | Skłony boczne z hantlem | — | Plecy — dół |
| 1 | Wyciskanie sztangi leżąc | — | Bark |
| 113 | Wyciskanie hantli na ławce skośnej dodatniej | — | Bark |
| 114 | Wyciskanie sztangi na ławce skośnej dodatniej | — | Bark |
| 117 | Pompki klasyczne | — | Bark, Nadgarstek |
| 119 | Rozpiętki na maszynie Pec Deck | — | Bark |
| 120 | Rozpiętki na bramie na wysokości klatki | — | Bark |
| 121 | Rozpiętki na bramie z dołu do góry | — | Bark |
| 122 | Rozpiętki na bramie z góry w dół | — | Bark |
| 170 | Wyciskanie hantli leżąc | — | Bark |
| 171 | Wyciskanie sztangi na ławce skośnej ujemnej | — | Bark |
| 172 | Wyciskanie hantli na ławce skośnej ujemnej | — | Bark |
| 173 | Wyciskanie na suwnicy Smitha leżąc | — | Bark |
| 174 | Pompki z obciążeniem | — | Bark, Nadgarstek |
| 175 | Dipy na poręczach | — | Bark, Łokieć |
| 176 | Dipy wspomagane na maszynie | — | Bark, Łokieć |
| 177 | Svend Press | — | Bark |
| 178 | Rozpiętki z hantlami leżąc | — | Bark |
| 179 | Rozpiętki z hantlami na ławce skośnej | — | Bark |
| 215 | Wyciskanie jednorącz na wyciągu | — | Bark |
| 216 | Wyciskanie hantli z dociskiem (Squeeze Press) | — | Bark |
| 217 | Wyciskanie na maszynie zbieżnej | — | Bark |
| 218 | Pompki z gumą oporową | — | Bark, Nadgarstek |
| 219 | Pompki na uchwytach | — | Bark, Nadgarstek |
| 220 | Pompki na kółkach gimnastycznych | — | Bark, Nadgarstek |
| 221 | Pompki z nogami na podwyższeniu | — | Bark, Nadgarstek |
| 3 | Przysiad ze sztangą | — | Kolano, Plecy — dół |
| 89 | Przysiad do skrzyni | — | Kolano, Plecy — dół |
| 91 | Hack squat na maszynie | — | Kolano |
| 92 | Wypychanie nóg na suwnicy 45° | — | Kolano |
| 93 | Przysiad na suwnicy Smitha | — | Kolano |
| 94 | Przysiad bułgarski | — | Kolano, Biodro |
| 96 | Wykrok w tył | — | Kolano, Biodro |
| 97 | Wykroki chodzone | — | Kolano, Biodro |
| 99 | Prostowanie nóg na maszynie | — | Kolano |
| 102 | Martwy ciąg z trap barem | — | Biodro, Plecy — dół |
| 191 | Przysiad ze sztangą z przodu | — | Kolano, Plecy — dół |
| 225 | Przysiad na jednej nodze (Pistol Squat) | — | Kolano, Biodro |
| 226 | Przysiad Zerchera (Zercher Squat) | — | Kolano, Plecy — dół |
| 250 | Skok z zamachem | — | Kolano, Biodro |
| 251 | Skok w dal z miejsca | — | Kolano, Biodro |
| 252 | Zeskok z natychmiastowym wybiciem | — | Kolano, Biodro |
| 254 | Skoki boczne jednonóż | — | Kolano, Biodro |
| 255 | Skok jednonóż | — | Kolano, Biodro |
| 258 | Przeskoki boczne z nogi na nogę | — | Kolano, Biodro |
| 100 | Martwy ciąg rumuński ze sztangą | — | Biodro, Plecy — dół |
| 101 | Martwy ciąg rumuński z hantlami | — | Biodro, Plecy — dół |
| 192 | Martwy ciąg sumo | — | Biodro, Plecy — dół |
| 111 | Odwodzenie nóg na maszynie | — | Biodro |
| 196 | Odwodzenie biodra na wyciągu | — | Biodro |
| 2 | Podciąganie na drążku | — | Bark, Łokieć |
| 125 | Ściąganie drążka wyciągu górnego podchwytem | — | Bark |
| 126 | Podciąganie na maszynie wspomagającej | — | Bark, Łokieć |
| 127 | Podciąganie na drążku chwytem neutralnym | — | Bark, Łokieć |
| 132 | Wiosłowanie T-bar z podparciem klatki | — | Plecy — dół |
| 135 | Ściąganie prostych ramion na wyciągu | — | Bark |
| 180 | Wiosłowanie sztangą w opadzie | — | Plecy — dół |
| 181 | Wiosłowanie podchwytem ze sztangą | — | Plecy — dół |
| 182 | Martwy ciąg konwencjonalny | — | Biodro, Plecy — dół |
| 183 | Wznosy tułowia | — | Biodro, Plecy — dół |
| 201 | Superman | — | Plecy — dół |
| 205 | Ściąganie jednorącz wyciągu górnego | — | Bark |
| 224 | High Pull | — | Plecy — dół, Bark |
| 228 | Jefferson Curl | — | Plecy — dół |
| 104 | Hip thrust | — | Biodro |
| 108 | Pull-through na wyciągu | — | Biodro |
| 253 | Wskok na podwyższenie | — | Kolano, Biodro |
| 257 | Skok boczny z zatrzymaniem | — | Kolano, Biodro |
| 202 | Uginanie nadgarstków ze sztangą | — | Nadgarstek |
| 203 | Prostowanie nadgarstków ze sztangą | — | Nadgarstek |
| 112 | Przywodzenie nóg na maszynie | — | Biodro |
| 154 | Prostowanie ramion z liną na wyciągu | — | Łokieć |
| 155 | Prostowanie ramion z drążkiem na wyciągu | — | Łokieć |
| 156 | Prostowanie ramion nad głową z liną | — | Łokieć |
| 157 | Wyciskanie francuskie sztangą EZ | — | Bark, Łokieć |
| 158 | Wyciskanie sztangi wąskim chwytem | — | Bark, Łokieć |
| 189 | Kickback z hantlem na triceps | — | Łokieć |
| 190 | Prostowanie ramion nad głową z hantlem | — | Łokieć |
| 213 | Wyciskanie JM (JM Press) | — | Bark, Łokieć |
| 214 | Francuskie prostowanie ramion gumą oporową zza głowy | — | Łokieć |
| 249 | Skoki pogo | — | Kolano, Biodro |

## 2. `suitableForNoActivity` → false: 29 ćwiczeń

| id | ćwiczenie | stare | nowe | czynniki ryzyka |
|---|---|---|---|---|
| 186 | Wyciskanie sztangą nad głowę | brak | false | trudność uczenia 4; wymaga techniki i dużej siły/mobilności |
| 175 | Dipy na poręczach | brak | false | obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 220 | Pompki na kółkach gimnastycznych | brak | false | trudność uczenia 4; wymaga techniki i dużej siły/mobilności |
| 3 | Przysiad ze sztangą | brak | false | trudność uczenia 4; obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 91 | Hack squat na maszynie | brak | false | obciążenie stawów wysokie |
| 94 | Przysiad bułgarski | brak | false | trudność uczenia 4; obciążenie stawów wysokie |
| 102 | Martwy ciąg z trap barem | brak | false | wymaga techniki i dużej siły/mobilności |
| 191 | Przysiad ze sztangą z przodu | brak | false | trudność uczenia 5; obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 225 | Przysiad na jednej nodze (Pistol Squat) | brak | false | trudność uczenia 5; obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 226 | Przysiad Zerchera (Zercher Squat) | brak | false | trudność uczenia 4; obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 250 | Skok z zamachem | brak | false | ćwiczenie plyometryczne / z lądowaniem |
| 251 | Skok w dal z miejsca | brak | false | ćwiczenie plyometryczne / z lądowaniem |
| 252 | Zeskok z natychmiastowym wybiciem | brak | false | trudność uczenia 4; obciążenie stawów wysokie; ćwiczenie plyometryczne / z lądowaniem |
| 254 | Skoki boczne jednonóż | brak | false | trudność uczenia 4; ćwiczenie plyometryczne / z lądowaniem |
| 255 | Skok jednonóż | brak | false | trudność uczenia 4; obciążenie stawów wysokie; ćwiczenie plyometryczne / z lądowaniem |
| 258 | Przeskoki boczne z nogi na nogę | brak | false | ćwiczenie plyometryczne / z lądowaniem |
| 100 | Martwy ciąg rumuński ze sztangą | brak | false | wymaga techniki i dużej siły/mobilności |
| 192 | Martwy ciąg sumo | brak | false | trudność uczenia 4; obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 2 | Podciąganie na drążku | brak | false | trudność uczenia 4; wymaga techniki i dużej siły/mobilności |
| 127 | Podciąganie na drążku chwytem neutralnym | brak | false | trudność uczenia 4; wymaga techniki i dużej siły/mobilności |
| 180 | Wiosłowanie sztangą w opadzie | brak | false | obciążenie stawów wysokie |
| 181 | Wiosłowanie podchwytem ze sztangą | brak | false | obciążenie stawów wysokie |
| 182 | Martwy ciąg konwencjonalny | brak | false | trudność uczenia 5; obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 224 | High Pull | brak | false | trudność uczenia 4; wymaga techniki i dużej siły/mobilności |
| 228 | Jefferson Curl | brak | false | trudność uczenia 5; obciążenie stawów wysokie; wymaga techniki i dużej siły/mobilności |
| 253 | Wskok na podwyższenie | brak | false | ćwiczenie plyometryczne / z lądowaniem |
| 257 | Skok boczny z zatrzymaniem | brak | false | trudność uczenia 4; ćwiczenie plyometryczne / z lądowaniem |
| 213 | Wyciskanie JM (JM Press) | brak | false | trudność uczenia 4; wymaga techniki i dużej siły/mobilności |
| 249 | Skoki pogo | brak | false | ćwiczenie plyometryczne / z lądowaniem |
