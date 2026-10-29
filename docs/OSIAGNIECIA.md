# Osiągnięcia — projekt podstawy (do akceptacji)

Stan: 28.10.2026, gałąź `feature/osiagniecia`. Implementacja jest **za przełącznikiem `ACHIEVEMENTS_ENABLED` (domyślnie wyłączony)**: bez niego żadna trasa nie działa, nic nie jest liczone i portal zachowuje się jak dziś.

Inspiracje (tylko mechanizmy, bez grafik i tekstów): Strava (rekordy, kamienie milowe), Hevy (rekordy ciężaru i powtórzeń), Duolingo (seria z ochroną), Apple Fitness (cel tygodniowy). Wszystkie teksty są nasze, krótkie i ciepłe.

## 1. Zasady etyczne (twarde — wymuszone w kodzie i w testach)
1. **Bez zawstydzania.** Żadnych komunikatów o utracie, przerwanej serii, „nie zdążyłeś”. Aplikacja pokazuje tylko to, co zdobyte. Przerwana seria po prostu zaczyna się od nowa, bez komentarza.
2. **Bez nagród za trening ponad plan.** Do celu tygodnia liczy się najwyżej tyle treningów, ile dni ma plan. Rekordy i szczeble liczą tylko serie z planu (serie ponad zaplanowaną liczbę i ćwiczenia spoza planu nie liczą się).
3. **Bez nagród po zgłoszeniu bólu.** Jeśli tego samego dnia padło „Coś boli?”, ten trening nie wyzwala żadnej nagrody (trening nadal się liczy do regularności, więc nikt nie jest „karany” za zgłoszenie bólu — nagroda przyjdzie przy następnym treningu bez bólu).
4. **Bez nagród za ilość serii i objętość** ponad plan.
5. **Bez rankingów** i porównań między ludźmi. Brak tabel „najlepszych”, brak liczby „ile osób to zdobyło”.
6. **Powiadomienia tylko pozytywne i rzadkie:** w tej wersji nie ma żadnych powiadomień poza ekranem. Po treningu pokazujemy **najwyżej jedno** osiągnięcie (najważniejsze); reszta czeka w zakładce Postępy.
7. Bez języka medycznego i diagnostycznego; kroki to informacja, nie ocena zdrowia.

## 2. Co się liczy (mechanizmy)
| Rodzaj | Zasada | Przykładowy tekst |
|---|---|---|
| **Regularność tygodniowa** | Tydzień (pon–niedz, czas warszawski) jest zaliczony, gdy wykonano **wszystkie dni planu** (cel = liczba dni planu; nadwyżka się nie liczy). Seria = kolejne zaliczone tygodnie. Kamienie: 2, 4, 8, 12, 26, 52 tygodnie. | „4 tygodnie z rzędu” / „Trenujesz regularnie — tak trzymaj.” |
| **Ochrona serii** | **Jeden niezaliczony tydzień nie przerywa serii**, ale najwyżej raz na 6 tygodni. Seria wtedy nie rośnie w tym tygodniu i trwa dalej. | (bez komunikatu) |
| **Urlop / choroba** | Okres oznaczony przez podopiecznego lub trenera (data od–do, powód: urlop, choroba, inne). Tygodnie w tym okresie są **neutralne**: nie zaliczają, nie przerywają, nie zużywają ochrony. | (bez komunikatu) |
| **Rekordy** | Istniejąca reguła rekordu (`recordGain`): ciężar wyższy niż najlepszy dotąd przy takiej samej lub większej liczbie powtórzeń; pierwszy raz nie jest rekordem. Jedna nagroda na ćwiczenie na trening. Tylko serie z planu. | „Nowy rekord: Przysiad — 62,5 kg × 8” |
| **Kamienie milowe** | 1., 10., 25., 50., 100., 250. ukończony trening; „pierwszy miesiąc” (28 dni od pierwszego treningu i co najmniej 4 treningi). | „10. trening” / „Pierwszy miesiąc za Tobą” |
| **Awans na szczebel drabinki** (nasz wyróżnik) | Pierwsza seria na ćwiczeniu z **wyższego szczebla** tej samej drabinki (`docs/DRABINKI.md`, kalistenika), niż wszystko, co klient robił wcześniej w tej drabince. Nie nagradzamy pierwszego szczebla (brak historii). Tylko serie z planu, więc awans to decyzja trenera lub generatora. | „Nowy szczebel: Pompki klasyczne” |
| **Kroki** | Tydzień (minął), w którym wpisano kroki co najmniej z 5 dni, a średnia z wpisanych dni dociera do celu kroków (jeśli ustawiony). | „Tydzień z celem kroków” |
| **Wyzwanie miesięczne** (opcjonalne, `ACHIEVEMENTS_MONTHLY_CHALLENGE=1`) | Miesiąc kalendarzowy: **dni planu na tydzień × 4** treningów (np. 12 przy 3 dniach), z obcięciem tygodni do celu. Dopasowane do planu klienta. | „Wyzwanie miesiąca: 12 treningów” |

Miejsce na maskotkę i „Udostępnij na story” — **tylko zaślepka w danych** (pole `detail` na osiągnięciu); na razie żadnego ekranu ani przycisku.

## 3. Model danych (addytywnie, migracja 0056, po `pg_dump`)
- `client_achievements` — `client_id`, `kind`, `key`, `title`, `body`, `earned_at`, `session_id` (nullable), `seen_at` (nullable), `detail` (jsonb). **Unikalność `(client_id, kind, key)`** zapewnia idempotencję: powtórne liczenie, zdublowana sesja z kolejki offline albo ponowne zakończenie treningu nie tworzą drugiego osiągnięcia.
- `client_pauses` — `client_id`, `start_date`, `end_date`, `reason` (urlop / choroba / inne), `set_by` (client / trainer).
- Brak zmian w istniejących tabelach.

## 4. Liczenie po stronie serwera
- Czysta funkcja `computeAchievements(dane)` (bez bazy) wylicza wszystkie osiągnięcia **z całej historii**; zapis jest `INSERT … ON CONFLICT DO NOTHING`. Dzięki temu wynik nie zależy od kolejności zdarzeń (offline, ponowne wysłanie, opóźnione serie).
- Wywołanie po zakończeniu treningu (odpowiedź zawiera najwyżej jedno osiągnięcie do pokazania) oraz przy odczycie listy Postępów.
- Trasy (wszystkie za flagą, inaczej 404 `ACHIEVEMENTS_DISABLED`): `GET /api/achievements/status`; portal: `GET /api/client-portal/achievements`, `POST …/seen`, `GET/POST/DELETE /api/client-portal/pauses`; trener: `GET/POST/DELETE /api/clients/:id/pauses` (tylko własny klient).

## 5. Pytania do właściciela (z rekomendacją)
1. **Cel tygodnia:** wszystkie dni planu (np. 4 z 4)? Rekomendacja: tak. Lżejszy tydzień pokrywa ochrona serii; nie obniżamy celu, żeby nie „rozcieńczać” osiągnięcia.
2. **Ochrona serii:** jeden tydzień na 6? Rekomendacja: tak (jak w założeniu), bez komunikatu o jej użyciu.
3. **Urlop i choroba:** kto oznacza i na ile? Rekomendacja: podopieczny i trener; do 4 tygodni jednorazowo, dłuższe tylko trener.
4. **Wyzwanie miesięczne:** domyślnie wyłączone, włączane osobnym przełącznikiem po ocenie? Rekomendacja: tak (może zniechęcać osoby, które nie osiągną celu).
5. **Powiadomienia poza aplikacją** (e-mail, push)? Rekomendacja: na razie nie (koszt i ryzyko „spamu”); tylko ekran po treningu i zakładka Postępy.

## 6. Co jest zaimplementowane za flagą (blok 4b)
`ACHIEVEMENTS_ENABLED=1` (domyślnie wyłączone; wyzwanie miesięczne dodatkowo `ACHIEVEMENTS_MONTHLY_CHALLENGE=1`).
- Migracja `0056_osiagniecia.sql` (po `pg_dump`): `client_achievements`, `client_pauses`. **Zastosowana tylko na bazie testowej**; baza aplikacji dostanie ją przy scaleniu gałęzi (`scripts/db-setup-gcp.sh`).
- `services/achievements.ts` (czysta logika), `services/achievementsStore.ts` (baza, zapis idempotentny), `routes/achievements.ts` (status, lista, „widziane”, przerwy klienta i trenera).
- Zakończenie treningu (`POST …/finish`) dodaje pole `achievement` (najwyżej jedno osiągnięcie do pokazania) **tylko przy włączonej fladze**; bez flagi odpowiedź jest identyczna jak dziś.
- Drabinki kalisteniczne (`feature/kalistenika`) dołączą do liczenia awansów po scaleniu tej gałęzi; na razie liczą się drabinki z katalogu.
- **Brak ekranów** (to blok 5): nic nie jest jeszcze pokazywane w aplikacji.
- Testy: silnik 24 (każda reguła, zasady etyczne, ochrona serii, urlop, brak duplikatów), integracyjne 7 (flaga wyłączona = brak zmian, idempotencja, powtórne zakończenie, ból, izolacja klientów, przerwy). Wyniki: API 130 plików / 2758, bezpieczeństwo generatora 101, typecheck OK.
