# Metody intensyfikacji w planie — ZATWIERDZONE 4.11.2026, wdrożone (flaga METHODS_V2_ENABLED)

Odpowiedzi właściciela: (1) tak — Solo bez rest-pause i upadku; (2) tak; (3) przy Sile bez metod, wyjątek: superserie tylko na ćwiczeniach dodatkowych przy krótkim czasie (do 45 min); (4) tak — nowe kolumny; (5) tak — drop set i rest-pause = +1 seria. Reguła „nie w pierwszym tygodniu” pominięta. Pytanie o cardio widzą wszystkie poziomy.


Stan: **projekt, nic z tego nie działa w aplikacji.** Po akceptacji właściciela powstaje wdrożenie (gałąź `feature/metody`, flaga `METHODS_V2_ENABLED=0`, bez scalenia do `main` bez zgody). Wszystkie teksty dla użytkownika: proste, bez języka medycznego, bez form zależnych od płci.

## 1. Jak jest dziś

- Wywiad pyta tylko w wersji dla Średniozaawansowanych i Zaawansowanych: „Czy chcesz, aby w planie były uwzględniane metody?” i „Metody do unikania” (`advanced_methods_to_avoid`, `avoids_advanced_methods`).
- **Generator nie czyta tych odpowiedzi** i nie stosuje żadnej metody (`docs/WYWIAD-INWENTARZ.md`, pkt 7 i tabela decyzji). Odpowiedzi są tylko w profilu klienta.
- Model planu (`workout_plan_exercises`) nie ma pól na metodę, parę ćwiczeń ani opis. Ekran treningu w portalu zna tylko serie ze zwykłym odpoczynkiem.
- Lista w wywiadzie ma sześć pozycji, w tym „Serie wymuszone” (wymagają partnera) — do usunięcia.

## 2. Pytanie w wywiadzie

**Jakie metody chcesz w planie?** (Średniozaawansowany i Zaawansowany; pomijane dla „Brak aktywności” i „Początkujący”; można zostawić bez odpowiedzi.)

Kafelki, wybór wielokrotny:

| Kafelek | Uwagi |
|---|---|
| **Dobierz za mnie** (domyślnie zaznaczony) | wykluczny z pozostałymi; reguły w pkt 4 |
| Superserie | |
| Serie złożone | tylko plany układane z trenerem (nie Solo) |
| Drop sety | |
| Rest-pause | tylko Zaawansowany |
| Serie do upadku mięśniowego | tylko plany z trenerem; nie w Solo |

W Solo kafelki „Serie złożone”, „Rest-pause” i „Serie do upadku” się nie pokazują (Solo: tylko superserie i drop sety, bez upadku). „Serie wymuszone” znikają z listy i z formularza trenera. Starsze odpowiedzi: „Serie wymuszone” jest ignorowane; „Metody do unikania” z dawnego wywiadu zamienia się na brak zaznaczenia tych metod (nie na „Dobierz za mnie”).

W formularzu trenera to samo pole plus opcja **Dobiorę sam** (generator nie dodaje żadnych metod, trener dodaje je ręcznie w edytorze planu).

Pod pytaniem jedno zdanie: „Metody to sposoby na ciekawszy trening. Możesz je zmienić później.”

## 3. Reguły każdej metody

Wspólne dla wszystkich: tylko ćwiczenia z oznaczeniem zweryfikowane; nigdy w pierwszym tygodniu cyklu; nigdy na ćwiczeniu, które klient zgłosił jako bolesne lub unika; nigdy w dniu, który ma tylko 3 ćwiczenia; razem nie więcej niż 2 ćwiczenia z metodą w dniu; po dodaniu metody ćwiczenie nadal przechodzi wszystkie filtry bezpieczeństwa. Ćwiczenia ze sztangą nad głową, przysiad ze sztangą i martwy ciąg nigdy nie dostają metody.

| | Superserie | Serie złożone | Drop sety | Rest-pause | Serie do upadku |
|---|---|---|---|---|---|
| **Co to** | dwa ćwiczenia na przeciwne partie (np. biceps i triceps, klatka i plecy) jedno po drugim, bez przerwy | dwa ćwiczenia na tę samą partię jedno po drugim, bez przerwy | po serii zmniejszasz ciężar o 20–30% i robisz kolejną od razu | seria do bliskiego upadku, 15–20 s przerwy, 2–3 krótkie dobicia | ostatnia seria do momentu, gdy nie da się zrobić kolejnego powtórzenia z dobrą techniką |
| **Dla kogo** | Ś, Z (w tym Solo) | Ś, Z (tylko z trenerem) | Ś, Z (w tym Solo) | tylko Z (tylko z trenerem) | Ś (tylko maszyny i wyciągi), Z (tylko z trenerem) |
| **Które ćwiczenia** | izolowane i pomocnicze złożone; para z różnych partii, sprzęt blisko siebie (te same hantle, ta sama maszyna lub wyciąg) | dwa ćwiczenia na jedną partię, pierwsze pomocnicze złożone, drugie izolowane | izolowane na maszynie, wyciągu lub hantlach (np. uginanie, prostowanie ramion, unoszenie bokiem, wyciąg do klatki); bez wolnej sztangi | izolowane na maszynie lub wyciągu | maszyny i wyciągi; izolowane |
| **Która seria** | wszystkie serie robocze pary | wszystkie serie robocze pary | tylko ostatnia seria robocza | tylko ostatnia seria robocza | tylko ostatnia seria robocza |
| **Jak często** | do 1 pary w dniu dla Ś, do 2 par dla Z; najwyżej 2 dni w tygodniu | do 1 pary w dniu, 1 dzień w tygodniu | do 1 ćwiczenia w dniu dla Ś, do 2 dla Z; ta sama partia najwyżej raz w tygodniu | 1 ćwiczenie w dniu, najwyżej raz w tygodniu | 1 ćwiczenie w dniu, ta sama partia najwyżej raz w tygodniu |
| **Czego nie łączyć** | z drop setem i rest-pause na tej samej parze | z superserią na tej samej partii w tym samym dniu | z rest-pause i upadkiem na tym samym ćwiczeniu | z drop setem i upadkiem na tym samym ćwiczeniu | z drop setem i rest-pause na tym samym ćwiczeniu |
| **Bezpieczeństwo** | para musi mieć łagodne ćwiczenia; bez par dwóch ćwiczeń obciążających ten sam staw ani dwóch chwytowych na końcu dnia | j.w.; kolejność od cięższego do lżejszego | po zmianie ciężaru technika taka sama; bez wolnych ciężarów nad głową; po drop secie przerwa 2 min | tylko na maszynie lub wyciągu; kończ, gdy technika siada | tylko na maszynie lub wyciągu; „bliżej upadku, ale z kontrolą”; nie w Solo; nie dla klienta, który zgłosił ból w danym stawie |
| **Solo** | tak | nie | tak | nie | nie |

Wniosek dla ekranu treningu: para ćwiczeń pojawia się jako jedno zadanie „A1 / A2”, a seria z drop setem lub rest-pause jako jedna seria z drobnym opisem.

## 4. „Dobierz za mnie”

Generator wybiera metody sam, według celu, poziomu i czasu treningu. Jeśli reguła nic nie wybiera, plan jest bez metod (to normalny wynik).

| Cel / sytuacja | Co dobiera |
|---|---|
| Budowa sylwetki, Ś | do 1 superserii w dniu na ramiona lub barki; 1 drop set na ostatnim ćwiczeniu izolowanym w 2 dniach tygodnia |
| Budowa sylwetki, Z | 1–2 superserie w dniu; drop set na 1–2 ćwiczeniach izolowanych; rest-pause tylko na maszynie raz w tygodniu |
| Redukcja tkanki tłuszczowej | superserie (oszczędzają czas), bez metod do upadku |
| Zwiększenie siły | brak metod |
| Poprawa kondycji, sprawności, cel sportowy | brak metod |
| Trening krótszy niż 45 min | superserie zamiast dodatkowych ćwiczeń |
| Pierwszy tydzień cyklu, klient zgłasza ból w danym stawie, ćwiczenie niezweryfikowane | nic nie dodaje |

W Solo to samo, ale tylko superserie i drop sety (Ś: drop sety do 1 ćwiczenia w dniu).

## 5. „Dlaczego?” przy ćwiczeniu

Krótkie zdanie widoczne przy ćwiczeniu z metodą (klient i trener). Przykłady:

- Superserie: „Biceps i triceps pod rząd, bez przerwy — krótszy trening, a każda partia odpoczywa, gdy druga pracuje.”
- Serie złożone: „Dwa ćwiczenia na tę samą partię jedno po drugim — mocniejszy bodziec, więc ciężar dobierz o 10% niższy.”
- Drop set: „Ostatnia seria: gdy skończysz, zmniejsz ciężar o około jedną czwartą i zrób jeszcze jedną. Technika bez zmian.”
- Rest-pause: „Ostatnia seria: dojdź blisko końca, odpocznij 15–20 sekund i dobij jeszcze kilka powtórzeń.”
- Serie do upadku: „Ostatnia seria na maszynie: rób powtórzenia, aż technika zacznie się pogarszać — wtedy skończ.”
- „Dobierz za mnie” bez metody: nic nie jest pokazywane.

## 6. Zmiany potrzebne w aplikacji (opis, bez kodu)

1. **Model planu** (nowa migracja addytywna, kolumny nullable): metoda ćwiczenia, identyfikator pary w dniu, krótki opis „Dlaczego?”. Kopia bazy przed migracją.
2. **Wywiad:** kafelki zamiast dwóch pytań, usunięcie „Serii wymuszonych”, mapowanie starszych odpowiedzi; to samo w formularzu trenera z opcją „Dobiorę sam”.
3. **Generator:** osobny przebieg po dawkowaniu, pod flagą `METHODS_V2_ENABLED` (domyślnie 0), z regułami z pkt 3–4; testy bezpieczeństwa generatora i symulacja bez zmian wyników dla wyłączonej flagi.
4. **Edytor planu trenera:** pole metody przy ćwiczeniu, oznaczenie par, „Dlaczego?” do edycji. Analizator objętości: superserie bez zmiany liczby serii, drop set i rest-pause liczone jako +1 seria efektywna.
5. **Portal klienta:** wspólny ekran pary ćwiczeń, opis metody przy serii, brak zmian w kolejce zapisów (każda seria zapisuje się jak dziś).
6. **Solo:** tylko superserie i drop sety, bez upadku.

## 7. Pytania do właściciela (z rekomendacjami)

1. **Czy Solo ma dostać rest-pause lub serie do upadku?** Rekomendacja: nie — Solo zostaje przy superseriach i drop setach.
2. **Czy Średniozaawansowani dostają drop sety?** Rekomendacja: tak, 1 ćwiczenie w dniu, tylko na maszynach, wyciągach i hantlach.
3. **Co „Dobierz za mnie” robi przy celu Siła?** Rekomendacja: nic (plan bez metod).
4. **Czy metody zapisywać w nowych kolumnach planu, czy tylko w opisie ćwiczenia?** Rekomendacja: nowe kolumny (addytywna migracja) — wtedy działają para na ekranie treningu, raport i filtrowanie.
5. **Czy drop set i rest-pause liczą się do objętości jako dodatkowa seria?** Rekomendacja: tak, +1 seria efektywna na ćwiczenie z metodą; superserie bez zmian.
