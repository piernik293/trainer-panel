# Spójność nazw ćwiczeń — propozycja (27.10.2026)

**To tylko propozycja. Baza nie została zmieniona.** Właściciel zatwierdza konwencję i listę „stara → nowa”; zmianę nazw wykona osobna migracja (z kopią bazy i kontrolą, że ćwiczenia w planach klientów zachowują powiązania — zmieniamy tylko pole `name`, nie `id` ani `slug`).

Przeanalizowano 587 ćwiczeń katalogu (aktywne, bez prywatnych trenerów). Narzędzie: skrypt porównujący nazwy (duplikaty po normalizacji, nawiasy, anglicyzmy).

## 1. Konwencja (do zatwierdzenia)

1. **Jedna nazwa na jeden ruch.** Ten sam ruch nie występuje pod dwiema nazwami (np. „Deska na przedramionach” i „Plank”).
2. **Nazwa po polsku, gdy istnieje utrwalona polska nazwa** (Przysiad, Martwy ciąg, Wiosłowanie, Wyciskanie). **Anglicyzm zostaje, gdy w polskiej siłowni nikt nie mówi inaczej**: Plank, Hip thrust, Face pull, Pallof press, Dead bug, Bird dog, Kettlebell swing, Burpee. Bez kalek typu „Deska”, „Martwy robak”, „Ptak-pies”.
3. **Wzór: Ruch + wariant + sprzęt/pozycja**, np. „Plank na przedramionach”, „Plank wysoki”, „Plank boczny”, „Wyciskanie hantli na ławce skośnej”. Sprzęt po „ze/z/na”, pozycja na końcu (stojąc, siedząc, leżąc).
4. **Bez nawiasów z drugą nazwą.** Angielski odpowiednik jest aliasem do wyszukiwarki, nie częścią nazwy: „Przysiad Zerchera”, a „Zercher squat” wyszukuje to samo ćwiczenie. Nawias zostaje tylko wtedy, gdy opisuje wariant („Rowerek stacjonarny (lekki)”).
5. **Wielkość liter:** tylko pierwsza litera i nazwy własne (Zerchera, McGilla, Pallof); bez „Title Case”.
6. **Liczba:** czynność w rzeczowniku odczasownikowym (Wyciskanie, Wiosłowanie, Unoszenie); nazwy zwyczajowe w liczbie mnogiej zostają (Brzuszki, Pompki, Scyzoryki).
7. **Alias w wyszukiwarce** (do dodania w osobnym polu — to wymaga zmiany schematu, więc osobna decyzja): angielska nazwa i wariant bez polskich znaków.

## 2. Ten sam ruch pod różnymi nazwami

| Partia | Dziś | Propozycja | Uwaga |
|---|---|---|---|
| Brzuch | Deska na przedramionach | Plank na przedramionach | duplikat „Plank” — połączyć w jedno ćwiczenie (opis taki sam: podpór na przedramionach) |
| Brzuch | Deska z dotknięciem barku | Plank wysoki z dotknięciem barku | podpór na dłoniach (wysoki), a nie na przedramionach |
| Brzuch | Plank | Plank na przedramionach | nazwa uściślona; opis w bazie to podpór na przedramionach |
| Brzuch | Plank boczny | Plank boczny | bez zmian |
| Brzuch | Plank boczny na podwyższeniu | Plank boczny na podwyższeniu | bez zmian |
| Brzuch | Plank z dotykaniem barków na kolanach | Plank wysoki na kolanach z dotknięciem barku | ten sam ruch co wyżej, wersja łatwiejsza — nazwa zgodna z wzorem |
| Przywodziciele | Plank boczny z przywodzeniem nogi | Plank boczny z przywodzeniem nogi | bez zmian |

Duplikaty po normalizacji (wielkość liter, znaki, nawiasy): 
- Dipy na poręczach ⇄ Dipy na poręczach (akcent triceps): warianty (inny akcent), nie duplikat — zostają.
- Wykroki chodzone ⇄ Wykroki chodzone (rozgrzewka): ten sam ruch w roli głównej i rozgrzewkowej — zostają dwa wpisy, ale nawias „(rozgrzewka)” jest zbędny, bo rolę pokazuje pole „rola”; propozycja: obie nazwy „Wykroki chodzone”.

## 3. Nawiasy z drugą nazwą — lista „stara → nowa” po partiach

Nowa nazwa = tekst przed nawiasem; treść nawiasu przechodzi do aliasu wyszukiwania. Wiersze „bez zmian” zostają, bo nawias opisuje wariant albo nazwa angielska jest utrwalona.

### Barki (6 do zmiany z 9 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Halo z kettlebell (mobilizacja barków) | Mobilizacja barków | nazwa polska zamiast angielskiej, angielska jako alias |
| Odbicie piłki lekarskiej z postawy (z partnerem) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Pompki z biodrami w górze (pike) | Pompki z biodrami w górze | alias do wyszukiwarki: „pike” |
| Praca ramion w klęku (technika biegu) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Rozciąganie barku (ramię w poprzek) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Rozciąganie gumy przed klatką (Band Pull-Apart) | Rozciąganie gumy przed klatką | alias do wyszukiwarki: „Band Pull-Apart” |
| Scaption (unoszenie hantli w płaszczyźnie łopatki) | Unoszenie hantli w płaszczyźnie łopatki | nazwa polska zamiast angielskiej, angielska jako alias |
| Wyciskanie landmine jednorącz (linear jammer) | Wyciskanie landmine jednorącz | alias do wyszukiwarki: „linear jammer” |
| Wyciskanie landmine oburącz (linear jammer) | Wyciskanie landmine oburącz | alias do wyszukiwarki: „linear jammer” |

### Biceps (2 do zmiany z 4 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Uginanie ramienia na wyciągu zza ciała (Bayesian Curl) | Uginanie ramienia na wyciągu zza ciała | alias do wyszukiwarki: „Bayesian Curl” |
| Uginanie ramion sztangą wzdłuż tułowia (drag curl) | Uginanie ramion sztangą wzdłuż tułowia | alias do wyszukiwarki: „drag curl” |
| Uginanie ramion w podporze klatki (Spider Curl) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Uginanie ramion z ręcznikiem (opór własnej siły) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Brzuch (3 do zmiany z 8 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Brzuszki z unoszeniem tułowia (sit-up) | Brzuszki z unoszeniem tułowia | alias do wyszukiwarki: „sit-up” |
| Curl-up (brzuszek McGilla) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Obroty sztangi landmine (180s) | — | bez zmian (angielska nazwa utrwalona) |
| Oddech pudełkowy siedząc (4-4-4-4) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Rowerek (brzuszki rowerowe) | Brzuszki rowerowe | nazwa polska zamiast angielskiej, angielska jako alias |
| Scyzoryki (V-up) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Składanie ciała w zwisie (hanging pike) | Składanie ciała w zwisie | alias do wyszukiwarki: „hanging pike” |
| Łokieć do kolana (skłon skośny stojąc) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Całe ciało (1 do zmiany z 4 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Pajacyki (jumping jacks) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Rowerek stacjonarny (lekki) | — | bez zmian (angielska nazwa utrwalona) |
| Turkish get-up z kettlebell (przez wykrok) | Przez wykrok | nazwa polska zamiast angielskiej, angielska jako alias |
| Zarzut sztangi (power clean) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Klatka piersiowa (1 do zmiany z 5 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Dipy na poręczach (akcent triceps) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Pompki wąskim chwytem (akcent triceps) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Pompki z zeskoku ze skrzyni (stopy na skrzyni) | Stopy na skrzyni | nazwa polska zamiast angielskiej, angielska jako alias |
| Wyciskanie hantli wąsko (hantle złączone) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Wyciskanie hantli z dociskiem (Squeeze Press) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Mięśnie czworogłowe uda (8 do zmiany z 14 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Bieg skokowy po przekątnej (bounds) | Bieg skokowy po przekątnej | alias do wyszukiwarki: „bounds” |
| Krzesełko przy ścianie (wall sit) | Krzesełko przy ścianie | alias do wyszukiwarki: „wall sit” |
| Praca nóg wokół stożka (cone drill) | Praca nóg wokół stożka | alias do wyszukiwarki: „cone drill” |
| Przysiad Zerchera (Zercher Squat) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Przysiad na jednej nodze (Pistol Squat) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Przysiad split (bułgarski bez podwyższenia) | Bułgarski bez podwyższenia | nazwa polska zamiast angielskiej, angielska jako alias |
| Przysiad ze sztangą nisko na plecach (low bar) | Przysiad ze sztangą nisko na plecach | alias do wyszukiwarki: „low bar” |
| Rozciąganie czworogłowego (stojąc, przy ścianie) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Rozciąganie zginaczy biodra (wykrok klęczny) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Skip A (szybki bieg z wysokim kolanem) | Szybki bieg z wysokim kolanem | nazwa polska zamiast angielskiej, angielska jako alias |
| Szybkie wejścia na ławkę (bench sprint) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Wspinaczka w podporze (mountain climbers) | Mountain climbers | nazwa polska zamiast angielskiej, angielska jako alias |
| Wykroki chodzone (rozgrzewka) | — | bez zmian (angielska nazwa utrwalona) |
| Wypad skokowy (zmiana nóg w powietrzu) | Zmiana nóg w powietrzu | nazwa polska zamiast angielskiej, angielska jako alias |

### Mięśnie dwugłowe uda (5 do zmiany z 11 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Dzień dobry z gumą oporową (good morning) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Dzień dobry ze sztangą (good morning) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Inchworm (przejście w podpór) | Przejście w podpór | nazwa polska zamiast angielskiej, angielska jako alias |
| Najlepsze rozciąganie świata (mobilizacja całego ciała) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Nordic curl (uginanie nóg nordyckie) | Uginanie nóg nordyckie | nazwa polska zamiast angielskiej, angielska jako alias |
| Rozciąganie tylnej części uda (siad) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Seria „pazura” w ruchu (technika biegu) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Uginanie nóg na podłodze (glute-ham raise) | Uginanie nóg na podłodze | alias do wyszukiwarki: „glute-ham raise” |
| Uginanie nóg naturalne (natural GHR) | Uginanie nóg naturalne | alias do wyszukiwarki: „natural GHR” |
| Wymachy nóg (w przód i w bok) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Ćwiczenie przyspieszenia przy ścianie (wall drill) | Ćwiczenie przyspieszenia przy ścianie | alias do wyszukiwarki: „wall drill” |

### Plecy (4 do zmiany z 8 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Martwy ciąg z podwyższenia (rack pull) | Martwy ciąg z podwyższenia | alias do wyszukiwarki: „rack pull” |
| Muscle-up na drążku (bez wymachu) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Podciąganie podchwytem (chin-up) | Podciąganie podchwytem | alias do wyszukiwarki: „chin-up” |
| Przyciąganie kolan do klatki piersiowej (rozciąganie) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Renegade row (wiosłowanie w podporze) | Wiosłowanie w podporze | nazwa polska zamiast angielskiej, angielska jako alias |
| Wiosłowanie sztangą szerokim chwytem (tył barku) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Wiosłowanie w zwisie pod sztangą (australijskie podciąganie) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Łopatkowe podciągnięcia w zwisie (scapular pull-up) | Łopatkowe podciągnięcia w zwisie | alias do wyszukiwarki: „scapular pull-up” |

### Pośladki (0 do zmiany z 2 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Nożyce poziome (flutter kicks) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Rozciąganie pośladka (leżąc, „czwórką”) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Przedramiona (0 do zmiany z 1 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Uginanie palców ze sztangą (chwyt) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Przywodziciele (0 do zmiany z 2 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Kroki bokiem z krzyżowaniem (carioca) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Rozciąganie przywodzicieli (siad skrzyżny) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Triceps (0 do zmiany z 2 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Rozciąganie tricepsa (za głową) | — | bez zmian (nawias opisuje wariant/pozycję) |
| Wyciskanie JM (JM Press) | — | bez zmian (nawias opisuje wariant/pozycję) |

### Łydki (2 do zmiany z 2 z nawiasem)

| Stara | Nowa | Uwaga |
|---|---|---|
| Unoszenie palców stóp (tibialis raise) | Unoszenie palców stóp | alias do wyszukiwarki: „tibialis raise” |
| Wspięcia na palce na maszynie (calf press) | Wspięcia na palce na maszynie | alias do wyszukiwarki: „calf press” |

## 4. Anglicyzmy — co zostaje, co po polsku (do decyzji)

| Słowo | Ile ćwiczeń | Przykłady | Propozycja |
|---|---|---|---|
| Plank | 5 | Plank; Plank boczny; Plank boczny na podwyższeniu | zostaje (utrwalone) |
| Curl | 6 | Uginanie ramienia na wyciągu zza ciała (Bayesian Curl); Uginanie ramion sztangą wzdłuż tułowia (drag curl); Uginanie ramion w podporze klatki (Spider Curl) | po polsku „Uginanie”; „Curl” tylko w nazwach własnych wariantów (Spider, Bayesian) → „Uginanie … w podporze klatki” |
| Press | 11 | Arnold press; Arnold press z kettlebell; Push press z kettlebell jednorącz | po polsku „Wyciskanie”; „Pallof press” zostaje |
| Squat | 4 | Hack squat na maszynie; Hack squat wąską postawą; Przysiad Zerchera (Zercher Squat) | po polsku „Przysiad” |
| Raise | 3 | Glute-ham raise na maszynie; Uginanie nóg na podłodze (glute-ham raise); Unoszenie palców stóp (tibialis raise) | po polsku „Unoszenie” |
| Row | 1 | Renegade row (wiosłowanie w podporze) | po polsku „Wiosłowanie” |
| Pull | 8 | Face pull; Face pull z gumą oporową; Rozciąganie gumy przed klatką (Band Pull-Apart) | „Face pull” zostaje; „Pull-apart” → „Rozciąganie gumy” |
| Thrust | 1 | Hip thrust | „Hip thrust” zostaje |
| Swing | 3 | Pionowy swing z hantlem; Swing kettlebell jednorącz; Swing kettlebell oburącz | „Kettlebell swing” zostaje |
| Rollout | 2 | Ab rollout ze sztangą; Ab wheel rollout | „Rollout” zostaje (brak polskiej nazwy) |
| Woodchop | 2 | Woodchop na wyciągu; Woodchop na wyciągu z dołu do góry | zostaje |
| Pallof | 3 | Pallof press; Pallof press z gumą oporową; Pallof press z rotacją | zostaje |
| Dead bug | 1 | Dead bug | zostaje |
| Bird dog | 1 | Bird dog | zostaje |
| Hollow | 1 | Hollow body hold | „Hollow body hold” zostaje |
| kettlebell | 23 | Arnold press z kettlebell; Halo z kettlebell (mobilizacja barków); Push press z kettlebell jednorącz | zostaje (piszemy małą literą: „z kettlebell”) |
| TRX | 4 | Fallout na TRX; Odwrotne spięcia brzucha na TRX; Pompki na TRX | zostaje |
| landmine | 5 | Wyciskanie landmine jednorącz (linear jammer); Wyciskanie landmine oburącz (linear jammer); Obroty sztangi landmine (180s) | zostaje („z landmine”) |

## 5. Jak wdrożyć po zatwierdzeniu

1. Właściciel zatwierdza konwencję (pkt 1) i tabele (pkt 2–3), ewentualnie je poprawia.
2. Kopia bazy (`pg_dump`), migracja SQL zmieniająca tylko pole `name` (przy zachowaniu `id` i `slug`), test porównujący liczbę ćwiczeń i powiązań przed/po.
3. Osobna decyzja o polu aliasów (nowa kolumna — zmiana schematu, najpierw kopia).
4. Sprawdzenie planów klientów: nazwy w planach pochodzą z katalogu na bieżąco, więc zmiana pojawi się też w aktywnych planach (podopieczny zobaczy nową nazwę tego samego ćwiczenia).
