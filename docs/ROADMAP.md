# Roadmapa trainer-panel

Zasada: nie budujemy kolejnego punktu, dopóki wcześniejsze nie są stabilne.
Każda nowa funkcja od razu z dopracowanym UX (dla klienta: przede wszystkim telefon).
Zaktualizowano 24.10.2026 wg decyzji właściciela.

## Zrobione (fundament)
Działająca pętla zaproszenie → wywiad (kroki) → plan → portal klienta (pilnuje jej `scripts/smoke-gcp.sh`),
nowy pulpit, styl B, zaproszenia e-mailem, zdjęcie powitalne, trening podopiecznego (serie, ból, rozgrzewka z katalogu).

## Faza 1 — Generator i katalog (teraz)
- Bezpieczeństwo: flagi stawów w doborze ćwiczeń głównych (zrobione 24.10), reguły „brak aktywności” i początkujący bez zmian.
- Przegląd i import ćwiczeń paczkami (narzędzie `scripts/baza/import-paczka.ts`, import tylko po „importuj” właściciela).
- Drabinki progresji (szczeble: brak aktywności → początkujący → średniozaawansowany → zaawansowany).
- Zasada „brak aktywności” (objętość jak początkujący, RIR 3–4 vs 2–3, dobór szczebla).
- Progresja z wyjaśnieniem (projekt: `docs/PROGRESJA.md`; wdrożenie po zatwierdzeniu parametrów).

## Faza 2 — Narzędzia trenera
- Pakiety i licznik sesji z przypomnieniem (bez płatności online).
- Skrzynka uwagi z powodami („kto cichnie”: 7–10 dni bez treningu, nieprzeczytany ból, koniec planu/pakietu).
- Import planu z Excela; szablony i kopiowanie planów; „sprzęt mojej siłowni”.
- Raport PDF dla trenera (profesjonalny, z logo trenera).

## Faza 3 — Beta (równolegle z fazą 2)
Publiczny adres + HTTPS, usługa maili, RODO z prawnikiem, usunięcie kont demo (`trenerdemo`, `klientdemo`), 3–5 podopiecznych właściciela.

## Faza 4 — Zaangażowanie podopiecznego
Pomiary i waga z wykresem; **prywatne** zdjęcia postępu (tylko podopieczny i jego trener); osiągnięcia + maskotka + „Wrapped”
(oddzielnie od raportu PDF; nigdy dane zdrowotne, waga ani kontuzje na karcie do udostępnienia; osiągnięcia tylko z zapisanych treningów);
powiadomienia.

## Faza 5 — Później
Solo, asystent trenera, cennik.

## Usunięte z planu / odrzucone
- Usunięte: publiczny feed/posty ze zdjęciami (społeczność).
- Odrzucone: dieta, płatności online na start, minutnik przerw.
- Wideo: na razie brak. Pomysł (NIE teraz): opcjonalne pole „link do filmu” dla trenerów.
- OpenGym i exercises-dataset: wykluczone licencyjnie (źródło katalogu: free-exercise-db, tylko lista ruchów, własne opisy).

## Pulpit (stan 23.10)
Zbudowany z istniejących danych (`GET /api/dashboard/summary`): wymaga uwagi (nowy wywiad, brak planu,
koniec planu, niewykorzystane zaproszenie), dziś (rezerwacje), ostatnie zdarzenia, „Pierwsze kroki”.
Czeka na pkt 4 (zapisywanie treningów): kafelki realizacji planu oraz powody uwagi „ból / przerwa /
spadek realizacji / rekordy” (TODO w `pages/Dashboard.tsx`). Brak flagi „wywiad przejrzany” w schemacie —
„nowy wywiad” = ostatni kompletny wywiad z 7 dni bez planu utworzonego po nim.


## Dopiski (23.10.2026)
- Gdy generator zacznie stosować metody intensyfikacji — musi respektować „Metody do unikania” z wywiadu (`advanced_methods_to_avoid`; tylko wywiady z nowego pytania, patrz `docs/WYWIAD-INWENTARZ.md`). Test statyczny `avoidedExercisesEngine.test.ts` przypomni o tym, gdy w kodzie generatora pojawi się nazwa metody.
- Tryb młodzieżowy (poniżej 16 lat) — dopiero po konsultacji prawnej i po becie.
- Usunąć konta Clerk `trenerdemo` i `klientdemo` (oraz ich dane testowe) przed betą.
