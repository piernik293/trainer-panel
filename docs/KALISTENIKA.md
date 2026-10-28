# Kalistenika — projekt stylu treningu (do akceptacji)

Stan: 28.10.2026, gałąź `feature/kalistenika`. Implementacja jest **za przełącznikiem `CALISTHENICS_ENABLED` (domyślnie wyłączony)** i niczego nie zmienia, dopóki go nie włączysz. Dane poniżej pochodzą z katalogu w bazie (odczyt), nie z założeń.

## 1. Czym jest kalistenika w aplikacji
- To **styl treningu, nie nowy cel**. Cel nadal decyduje o objętości, liczbie serii i o tym, czy pojawia się pliometria. Styl decyduje tylko o **doborze sprzętu i układzie dni**.
- Plan wyłącznie na: masie ciała, drążku, poręczach, kółkach gimnastycznych i gumie oporowej. Ćwiczenia, które da się zrobić także na masie ciała (np. „Wykrok w tył”, w katalogu: hantle lub sztanga lub masa ciała), są dozwolone w wersji z masą ciała.
- Dni układamy wg **stanowisk** (drążek, poręcze/pompki, nogi i core), około **5 ćwiczeń na jednostkę** (nie liczymy bloku skoków).
- Wszystkie dotychczasowe filtry bezpieczeństwa działają bez zmian (stawy i ból, poziom efektywny, sprzęt i miejsce klienta, ukryte, wykluczone, brak zgody zdrowotnej, reguły BA/P).

## 2. Gdzie wybierany (propozycja)
| Etap | Jak | Co trzeba |
|---|---|---|
| **Teraz (za flagą)** | Trener wybiera „Styl: Standardowy / Kalistenika” w edytorze planu (opcja widoczna tylko przy włączonej fladze). Styl idzie jako parametr wywołania generatora; nic nie jest zapisywane w bazie. | Bez zmiany schematu. |
| **Później (po akceptacji)** | Wywiad: dla miejsc „Dom” i „Siłownia plenerowa” (w interfejsie: „Plener / street workout”) jedno pytanie „Czy chcesz trenować w stylu kalisteniki (masa ciała, drążek, poręcze, kółka, guma)?”. Trener może zmienić ręcznie. | Kolumna `surveys.training_style` (addytywna, nullable) + zmiana wywiadu — osobna zgoda. |

Rekomendacja: zacząć od wyboru przez trenera. Pytanie w wywiadzie dodać dopiero, gdy katalog będzie uzupełniony (sekcja 6), żeby klient nie dostawał odmowy generatora.

## 3. Szablony dni
Stanowiska klienta wynikają z jego sprzętu: **drążek** („Drążek do podciągania”), **poręcze**, **kółka**, **guma**. Zawsze dostępna jest podłoga (masa ciała).

| Dni | Układ | Uwagi |
|---|---|---|
| 2 | A: góra (drążek + pompki/dipy) · B: nogi i core (z blokiem skoków) | |
| 3 | A: **drążek** (przyciąganie, zwis, brzuch w zwisie) · B: **poręcze i pompki** (pchanie) · C: **nogi i core** (z blokiem skoków) | układ wzorcowy |
| 4 | A drążek · B poręcze/pompki · C nogi i core (z blokiem skoków) · D góra (drugi wariant) | |
| 5 | A drążek · B poręcze/pompki · C nogi i core (z blokiem skoków) · D góra · E całe ciało (lekko) | |

- **Brak drążka, kółek i gumy:** nie da się zrobić dnia przyciągania. Dzień „drążek” jest wtedy zastępowany dniem pchania, a trener dostaje ostrzeżenie „Kalistenika wymaga drążka lub gumy do dni przyciągania”. Nie podstawiamy ćwiczeń spoza listy sprzętu.
- Powtarzające się typy dni różnią się wariantem (ten sam mechanizm co dziś: pamięć tygodnia i `alternativeIndex`).
- Maksymalnie 5 ćwiczeń głównych na dzień; wybór zostaje na ćwiczeniach o najwyższym priorytecie slotu (rdzeń na końcu, jak dziś).

## 4. Dzień nóg połączony z pliometrią
Na początku dnia nóg **blok skoków (2 ćwiczenia)**, potem nogi i core. Reguły skoków są te same co w całej aplikacji (`services/plyoBlock.ts`):
- decyduje **niższy** z dwóch: poziom efektywny i doświadczenie ze skokami;
- **Brak aktywności (BA): bez skoków** (sam trening nóg);
- **Początkujący (P): tylko „Nauka lądowania”** + intensywność niska;
- **Średniozaawansowany:** niska i średnia; **intensywność wysoka tylko Zaawansowany z doświadczeniem „Tak”**;
- brak pytania o skoki w wywiadzie (inny cel niż „Cel sportowy”) → traktujemy jak „Nie”, czyli w praktyce tylko „Nauka lądowania” i niska intensywność;
- skoki przechodzą przez te same filtry stawów, sprzętu, ukrycia i zgody zdrowotnej co reszta (poprawka z symulacji 28.10: blok skoków respektuje też tryb „brak zgody zdrowotnej”).

## 5. Drabinki kalisteniczne (z ćwiczeń, które już są w bazie)
Szczebel wybieramy wg poziomu efektywnego klienta; zamiennik jest na tym samym szczeblu albo **niżej, nigdy wyżej**. „Do uzupełnienia” = brak w katalogu, nie wymyślamy ćwiczeń. Kolumna „Status” pokazuje stan katalogu: **zatw.** = zweryfikowane i zatwierdzone przez trenera; **import** = „do weryfikacji” lub niezatwierdzone (generator używa takich tylko dla Ś/Z).

### Podciąganie
| Szczebel | Ćwiczenie | Status |
|---|---|---|
| P | Zwis na drążku | do uzupełnienia |
| P | Łopatkowe podciągnięcia w zwisie (id 1102) | zatw. |
| Ś | Negatywy podciągnięcia (powolne opuszczanie) | do uzupełnienia |
| Ś | Podciąganie z gumą wspomagającą (id 1159, wariant) | import |
| Ś | Podciąganie podchwytem (chin-up, id 1088) | import |
| Z | Podciąganie na drążku (id 2), chwytem neutralnym (id 127) | import |
| Z | Podciąganie z obciążeniem (id 1280, wariant) | import |
| Z | Podciąganie łucznik (archer) | do uzupełnienia |

### Dipy
| Szczebel | Ćwiczenie | Status |
|---|---|---|
| P | Dipy na ławce (id 1093) | import |
| Ś | Negatywy dipów | do uzupełnienia |
| Ś | Dipy z gumą | do uzupełnienia |
| Ś | Dipy na poręczach (id 175) | import (zatwierdzone) |
| Z | Dipy na kółkach (id 1178, wariant) | import |
| Z | Dipy z obciążeniem | do uzupełnienia |

### Pompki
| Szczebel | Ćwiczenie | Status |
|---|---|---|
| BA | Pompki ścienne (id 322; w katalogu rola „rozgrzewka”, dopuszczona dla BA mechanizmem drabinek) | zatw. |
| P | Pompki na podwyższeniu (id 116), na kolanach (id 118) | zatw. |
| P | Pompki klasyczne (id 117) | zatw. |
| Ś | Pompki z nogami wyżej (id 221, sprzęt „Ławka”), z gumą (id 218), plus (id 1602), pike (id 1401) | import |
| Z | Pompki łucznik (archer) | do uzupełnienia |
| Z | Pompka jednorącz (id 1394), na kółkach (id 220), w staniu na rękach (id 1391) | import |

### Wiosłowanie australijskie (przyciąganie poziome)
| Szczebel | Ćwiczenie | Status |
|---|---|---|
| BA/P | Wiosłowanie gumą oporową (id 134) | zatw. |
| P | Wiosłowanie w zwisie pod sztangą — nogi ugięte (id 1089) | import |
| Ś | …nogi proste | do uzupełnienia |
| Z | …nogi wyżej / na kółkach | do uzupełnienia |

### Brzuch w zwisie
| Szczebel | Ćwiczenie | Status |
|---|---|---|
| Ś | Unoszenie kolan w zwisie (id 165) | import |
| Ś | Unoszenie nóg prostych w zwisie | do uzupełnienia |
| Z | Składanie ciała w zwisie — pike (id 1393) | import |
| Z | Toes to bar | do uzupełnienia |

### Przysiad i nogi
| Szczebel | Ćwiczenie | Status |
|---|---|---|
| BA | Przysiad do skrzyni z masą ciała (id 90), wejście na niskie podwyższenie (id 260) | zatw. |
| P | Przysiad z masą ciała (id 1090), przysiad wykroczny z podparciem (id 95), wykrok w tył (id 96) | część zatw. |
| Ś | Przysiad kozacki (id 1617) | import |
| Z | Przysiad bułgarski (id 94, sprzęt „Ławka”) | import |
| Z | Pistol z podparciem | do uzupełnienia |
| Z | Pistol (id 225) | import |

### Core
| Szczebel | Ćwiczenie | Status |
|---|---|---|
| BA/P | Dead bug (id 159), plank (id 5), plank boczny (id 161) | zatw. |
| Ś | Hollow body hold (id 197), scyzoryki V-up (id 1619) | import |
| Ś | L-sit z podparciem | do uzupełnienia |
| Z | L-sit na podłodze (id 1640) | import |

**Braki do uzupełnienia: 12 pozycji** (zwis, negatywy podciągnięcia, podciąganie łucznik, negatywy dipów, dipy z gumą, dipy z obciążeniem, pompki łucznik, wiosłowanie nogi proste i wyżej, nogi proste w zwisie, toes to bar, pistol z podparciem, L-sit z podparciem). Generator ich nie wymaga: gdy szczebla brakuje, bierze najbliższy niższy z listy.

## 6. Zasady bezpieczeństwa
- **BA i P:** wyłącznie dolne szczeble (BA: szczeble BA, P: do szczebla P) **i ćwiczenia zweryfikowane i zatwierdzone** przez trenera. Zwis, podciąganie i dipy dla BA — nie (ani przez reguły BA, ani przez drabinkę).
- BA: nadal `suitableForNoActivity === true` w każdym slocie; P: `learningDifficulty` null = odrzucenie. Bez fallbacku na niebezpieczne ćwiczenia.
- Ból i stawy jak wszędzie: zgłoszony staw wyklucza ćwiczenie. W kalistenice często obciążone są bark, łokieć i nadgarstek — przy zgłoszeniu któregoś z nich część dni może zostać odrzucona (komunikat zamiast niebezpiecznego planu).
- Pliometria tylko wg sekcji 4.
- Styl nie zmienia limitów objętości dla poziomu (BA/P nie dostają „więcej, bo kalistenika”).

## 7. Pytania do właściciela (z rekomendacją)
1. **Kto wybiera styl?** Rekomendacja: na start tylko trener (bez zmiany bazy); pytanie w wywiadzie po uzupełnieniu katalogu (kolumna `training_style`, osobna zgoda).
2. **Czy podwyższenie/ławka liczy się do sprzętu kalistenicznego** (dipy na ławce, pompki z nogami wyżej, przysiad bułgarski)? Rekomendacja: tak dla Dom i Siłowni plenerowej (krzesło, ławka parkowa); w kodzie dziś te ćwiczenia mają sprzęt „Ławka”, więc **w pierwszej wersji są pominięte**.
3. **Brak bezpiecznych ćwiczeń na dzień** (dziś błąd, minimum 4): czy dopuścić dzień z 3 ćwiczeniami z komunikatem dla trenera? Rekomendacja: tak, ale osobna zgoda (zmiana widocznego zachowania, patrz DO-DECYZJI 51).
4. **Uzupełnienie 12 braków** (sekcja 5) jako paczka „do weryfikacji” do przeglądu trenera? Rekomendacja: tak; do planów BA/P dopiero po zatwierdzeniu.
5. **Ćwiczenia „import” dla P** (dipy na ławce, wiosłowanie australijskie): czy po przeglądzie trenera mogą wejść do planów początkujących? Rekomendacja: tak, po zatwierdzeniu w „Do przeglądu” — nie zmieniamy reguły, zmienia się status ćwiczenia.

## 8. Co jest zaimplementowane za flagą (blok 2b)
`CALISTHENICS_ENABLED=1` (domyślnie wyłączone). Bez flagi parametr `style` jest ignorowany: odpowiedź generatora jest identyczna jak bez niego (test integracyjny porównuje trzy profile × pięć typów dni), trasa dni daje 404, a panel nie pokazuje opcji.
- `services/calisthenics.ts`: biała lista sprzętu, stanowiska i szablony dni, drabinki (ćwiczenia po nazwach; brakujące są pomijane), reguła skoków w dniu nóg, przycinanie do 5.
- `POST .../generate-day` przyjmuje `style: "calisthenics"`; `GET /api/calisthenics/status`; `GET /api/clients/:id/plan-draft/calisthenics-days?days=N`.
- Panel (edytor planu): pole „Styl: kalistenika” widoczne tylko przy włączonej fladze i pustym planie. Karty dni zostają z rozkładu objętości, zmienia się typ sesji wysyłany do generatora.
- Nic nie jest zapisywane w bazie (brak migracji). Styl nie jest jeszcze pamiętany w planie ani w wywiadzie (patrz sekcja 2).

**Symulacja stylu** (`scripts/generator-sim.sh 300 20261028 calisthenics`, 300 profili, 1135 dni): **0 naruszeń** bezpieczeństwa i wykonalności (sprzęt tylko z listy, najwyżej 5 ćwiczeń, skoki tylko w dniu nóg i najwyżej 2, BA/P tylko zweryfikowani i bez górnych szczebli). **Ale 570 z 1135 dni (50%) kończy się odmową** (za mało bezpiecznych ćwiczeń): przede wszystkim dni „drążek” i „góra” oraz poziomy BA/P. Przyczyna to braki w katalogu (sekcja 5) i wymóg „tylko zweryfikowane” dla BA/P — dopóki katalog nie zostanie uzupełniony, styl nadaje się do ręcznego użycia przez trenera dla Ś/Z i dla dni pchania/nóg, a nie do masowego włączenia. Raport: `docs/generator-sim-report-calisthenics.json`.
