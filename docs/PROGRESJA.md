# Progresja z wyjaśnieniem — projekt (etap 4, do zatwierdzenia)

Stan: 24.10.2026, gałąź `feature/progresja`. **Tylko projekt — nic nie wdrożono** (ani kodu, ani bazy). Wdrożenie wymaga zgód: STOP-2 (nowe tabele/kolumny, najpierw `pg_dump`) i STOP-5 (zachowanie widoczne dla użytkownika). Inspiracja: ogólne zasady podwójnej progresji znane z publicznej literatury treningowej; nie korzystałem z kodu żadnej aplikacji (w szczególności OpenGym, licencja AGPL).

## 1. Stan dziś (z kodu)
- Wyniki zapisują się **per seria** w `set_logs` (kg, powtórzenia, RIR 0–4, gdzie 4 = „4+”, `skipped`, `client_uuid`). Sesje: `workout_sessions` (`had_pain`, ocena trudności).
- W planie: `workout_plan_exercises` ma `working_sets`, zakres powtórzeń (`rep_range_min/max`), `rir` docelowy, `rest_seconds`.
- Istnieje funkcja informacyjna `computeProgressionSuggestion` (`routes/clientPortal.ts`): zwraca `increase` / `maintain` / `repeat_or_reduce` na podstawie **ostatniej** sesji i **agregatu** ćwiczenia. Niczego nie zmienia, nie tłumaczy się i nie widzi serii osobno. Ten projekt ją zastępuje (z zachowaniem zasady „ból zawsze blokuje wzrost”).

## 2. Zasady (reguły oceny)
Ocena dotyczy jednego ćwiczenia planu, na podstawie **ostatniej ukończonej sesji** z tym ćwiczeniem (serie robocze; rozgrzewkowe pomijamy). Oznaczenia: `min`/`max` — zakres powtórzeń z planu, `RIRdocel` — docelowy RIR, `skok` — skok ciężaru wg sprzętu (sekcja 4).

1. **Podwójna progresja.** Gdy **wszystkie** zaplanowane serie robocze mają `powtórzenia ≥ max` **i** `RIR ≥ RIRdocel` (RIR 4 = „4+”) → propozycja **„+skok ciężaru”**; w następnej sesji powtórzenia wracają do `min` (lub dolnej części zakresu).
2. **Nieudane powtórzenia nigdy nie dokładają ciężaru.** Seria jest „nieudana”, gdy `powtórzenia < min`, gdy jest pominięta albo gdy RIR 0 przy powtórzeniach poniżej `max` (granica mięśniowa przed końcem zakresu). Wystarczy jedna nieudana seria: ocena = **„utrzymaj”** (ten sam ciężar, cel: więcej powtórzeń). Dwie kolejne sesje z nieudanymi seriami → propozycja **„−jeden skok”** (lub zostanie ten sam ciężar z mniejszą liczbą serii — do wyboru trenera).
3. **Ból blokuje.** Zgłoszenie bólu (`had_pain` lub osobne zgłoszenie bólu w sesji) w tym ćwiczeniu lub partii → brak propozycji wzrostu; zamiast niej wskazówka „utrzymaj lub zmień ćwiczenie — porozmawiaj z trenerem”. Bez języka medycznego i bez diagnoz.
4. **Zastój.** Trzy kolejne sesje bez postępu (bez wzrostu sumy powtórzeń ani ciężaru przy takim samym lub większym RIR) → propozycja **„lżejszy tydzień”**: na najbliższe 7 dni lub 3 sesje ćwiczenie z ciężarem ≈ −10% (zaokrąglone do skoku sprzętu) i RIR docelowy +1; potem automatyczny powrót do wartości sprzed lżejszego tygodnia (parametry konfigurowalne). Zastój nie powstaje, gdy w tym okresie była zmiana ćwiczenia/planu.
5. **Brak aktywności i początkujący — kolejność zmian.** Zawsze jedna zmiana naraz, w tej kolejności: **(a) więcej powtórzeń** w zakresie → **(b) więcej ciężaru** (dopiero gdy a jest wyczerpane) → **(c) wyższy szczebel drabinki** (`docs/DRABINKI.md`; dopiero po (b) i po dwóch kolejnych sesjach „gotowy”). Po zatwierdzeniu jakiejkolwiek zmiany dla tego ćwiczenia **dwie następne sesje bez nowych propozycji** (czas na adaptację). Nigdy dwie zmiany jednocześnie. Dla ćwiczeń z masą ciała i gum (bez kg) pomijamy (b): powtórzenia → wyższy szczebel.
6. **Szczebel drabinki wyżej** proponujemy tylko, gdy ćwiczenie jest w drabince, a następny szczebel przechodzi wszystkie filtry bezpieczeństwa klienta (suitable, trudność uczenia, stawy). Dla BA/P — nigdy szczebel trudniejszy niż dopuszcza poziom efektywny (reguła 2 lat).
7. **Brak danych** (np. mniej niż 2 serie zapisane, brak RIR) → brak propozycji; zamiast niej wyjaśnienie „za mało danych”.
8. Wszystko to **szacunki do decyzji trenera**, nie diagnoza i nie obietnica wyniku.

## 3. Propozycja i wyjaśnienie
Każda propozycja ma **jedno zdanie po polsku** (widoczne dla trenera i podopiecznego). Szablony (liczby z danych):
| Rodzaj | Zdanie |
|---|---|
| +ciężar | „Ostatnio zrobiłeś(-aś) {n}×{max} powtórzeń z zapasem {rir} powtórzeń — proponujemy dołożyć {skok} kg (do {nowy} kg).” |
| więcej powtórzeń | „Zrobiłeś(-aś) {a}–{b} powtórzeń, a zakres to {min}–{max} — zostajemy przy {kg} kg i dodajemy powtórzenia.” |
| utrzymaj | „Nie wszystkie serie dobiły do {min} powtórzeń — zostajemy przy {kg} kg, żeby to utrwalić.” |
| −skok | „Dwie sesje z rzędu poniżej {min} powtórzeń — proponujemy zmniejszyć ciężar o {skok} kg.” |
| lżejszy tydzień | „Od {k} sesji bez postępu — proponujemy lżejszy tydzień (ok. −10%), potem wracamy do dotychczasowych ciężarów.” |
| wyższy szczebel | „Ćwiczenie jest już dla Ciebie opanowane — proponujemy kolejny krok: {nazwa}.” |
| ból | „Zgłosiłeś(-aś) dyskomfort — nie zwiększamy obciążenia; porozmawiaj z trenerem.” |
| za mało danych | „Za mało zapisanych serii, żeby coś zaproponować.” |
Wyjaśnienia generuje serwer z kodu przyczyny (`reason_code`) i danych; nie ma tekstu wolnego od klienta.

## 4. Skok ciężaru wg sprzętu
Zgodnie z `docs/TRENING.md` i `KATALOG-STANDARD.md`: **sztanga 2,5 kg; hantle i kettlebell 1 kg; maszyna i wyciąg 2,5 kg**; masa ciała i gumy — bez ciężaru (progresja przez powtórzenia, wariant, szczebel). Przy kilku wartościach sprzętu: Sztanga > Maszyna/Wyciąg > Hantle/Kettlebell. Wartości można zmienić w konfiguracji trenera (do decyzji), a trener zawsze może wpisać dowolny ciężar ręcznie. „Skok 1 kg” dla hantli dotyczy jednej ręki.

## 5. Zatwierdzanie
- Propozycja **nie zmienia planu sama**. Trener widzi listę „Propozycje zmian” (u klienta i w podsumowaniu): **Zatwierdź / Zmień / Odrzuć**. Zatwierdzenie wpisuje nowy ciężar/powtórzenia/szczebel do planu istniejącym mechanizmem edycji planu.
- **Auto-akceptacja (opcjonalna, per klient, domyślnie wyłączona):** po włączeniu przez trenera system sam zatwierdza **tylko** „+ciężar”, „więcej powtórzeń” i „utrzymaj”. **Nigdy** nie zatwierdza: wyższego szczebla, „−skok”, lżejszego tygodnia ani niczego po zgłoszeniu bólu; dla klientów BA/P auto-akceptacja jest niedostępna. Każda zmiana auto-zatwierdzona jest oznaczona i cofalna.
- Klient widzi wyjaśnienie **po zatwierdzeniu** (przy ćwiczeniu na ekranie „Dziś”), a nie jako obietnicę przed decyzją trenera (do decyzji: czy pokazywać oczekujące).

## 6. Model danych (do zatwierdzenia, STOP-2, wszystko addytywne i nullable)
Nowa tabela `progression_proposals`: `id`, `client_id`, `plan_exercise_id`, `exercise_id`, `kind` (`add_weight`/`add_reps`/`hold`/`reduce`/`deload_week`/`ladder_up`/`blocked_pain`/`no_data`), `from_value`/`to_value` (jsonb: kg, powtórzenia, id ćwiczenia), `reason_code`, `explanation_pl`, `source_session_ids int[]`, `status` (`pending`/`accepted`/`rejected`/`auto_accepted`/`expired`), `decided_by`, `decided_at`, `created_at`; unikalność `(plan_exercise_id, status = pending)` — jedna otwarta propozycja na ćwiczenie planu. Kolumna `clients.progression_auto_accept boolean` (nullable, brak = wyłączone). Opcjonalnie tabela `deload_windows` (`plan_exercise_id`, `starts_on`, `ends_on`, `original_values`). Obliczenia po zakończeniu sesji (nie w trakcie) i tylko z `set_logs` ukończonych sesji. Idempotentne (ta sama sesja nie tworzy drugiej propozycji).

## 7. Testy (do implementacji później)
Górny koniec zakresu we wszystkich seriach → +skok; jedna nieudana seria → brak +ciężaru; ból → brak wzrostu; trzy sesje bez postępu → lżejszy tydzień i powrót; BA/P: kolejność powtórzenia → ciężar → szczebel i jedna zmiana naraz (cisza dwóch sesji); skok wg sprzętu (w tym wieloma wartościami sprzętu); auto-akceptacja nie zatwierdza szczebla ani −skoku; wyjaśnienie zawsze obecne; brak danych → brak propozycji; testy bezpieczeństwa generatora bez zmian.

## 8. Krótko: kalkulator talerzy i wykres wagi ciała (tylko zakres, bez kodu)
**Kalkulator talerzy (sztanga):** dla ćwiczeń ze sprzętem „Sztanga” przy polu ciężaru pokazuje, jak załadować gryf: `ciężar docelowy − gryf` ÷ 2 = ciężar na stronę, dobór największych dostępnych talerzy (algorytm zachłanny), wynik np. „po każdej stronie: 20 + 5 + 1,25”. **Gryf domyślnie 20 kg** (opcja np. 15 kg lub inny), **dostępne talerze konfigurowalne** (zestaw trenera, nadpisywany per klient/siłownia; domyślnie 25/20/15/10/5/2,5/1,25 kg). Gdy ciężaru nie da się ułożyć z dostępnych talerzy — komunikat z najbliższym możliwym ciężarem. Tylko widok pomocniczy; nie zmienia zapisanych wyników.
**Wykres wagi ciała podopiecznego:** ręczny wpis wagi z datą (klient w portalu, trener u klienta), wykres liniowy w czasie (ostatnie 3/6/12 miesięcy) z linią trendu uśrednionego, wartość startowa z wywiadu. Nowa tabela `body_weight_logs` (`client_id`, `measured_on`, `weight_kg`, `source`). Neutralny język, bez ocen i bez wniosków zdrowotnych; BMR/TDEE/BMI nadal tylko szacunki. Prywatność: widoczne tylko dla klienta i jego trenera.

## 9. Do decyzji
1. Parametry: lżejszy tydzień (−10%, +1 RIR, 7 dni/3 sesje), zastój po 3 sesjach, „−skok” po 2 nieudanych sesjach, cisza 2 sesji po zmianie.
2. Czy klient widzi propozycje oczekujące, czy dopiero zatwierdzone.
3. Zakres auto-akceptacji (sekcja 5) i dostępność tylko dla poziomów S/Z.
4. Konfigurowalność skoku ciężaru per trener.
5. Zgoda na model danych z sekcji 6 i 8 (STOP-2) oraz na zmianę zachowania widocznego dla użytkownika (STOP-5).
