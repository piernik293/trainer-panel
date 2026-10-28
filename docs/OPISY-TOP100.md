# Opisy i wskazówki dla klienta — top 100 ćwiczeń, 20 rozgrzewek, 20 schłodzeń (do akceptacji)

Stan: 29.10.2026, gałąź `feature/opisy-top100`. **Zastosowane tylko na bazie testowej.** Baza aplikacji nie zmieniona; migracja `0061_opisy_top100.sql` trafi do niej przy scaleniu gałęzi (po Twojej akceptacji pliku `docs/OPISY-TOP100.csv`, kolumna „decyzja właściciela”).

## Co zrobiono
- Wybór: 100 najczęstszych ćwiczeń + 20 rozgrzewek + 20 schłodzeń z symulacji 1000 profili (`docs/GRAFIKI-TOP50.csv`), razem **140 pozycji** (88 z nich istnieje w małej bazie testowej, reszta tylko w kopii katalogu aplikacji).
- Każdej pozycji napisano: opis (1–2 zdania: pozycja startowa i ruch), instrukcję wykonania (kroki), 2–3 wskazówki techniczne i 1 najczęstszy błąd. Prosty język, bez angielskich wtrętów (poza nazwą), bez żargonu, bez form zależnych od płci. Nazw nie zmieniano.
- Poprawiono **wszystkie 140**. Stan wyjściowy: 24 pozycje bez opisu i wskazówek (rozgrzewki i schłodzenia), 48 z jedną wskazówką lub bez, 25 z angielskimi wtrętami („core”, „tempo”, „press”…), 32 z żargonem („faza ekscentryczna”, „zakres ruchu”, „stabilizacja”), 23 z opisem dłuższym niż 2 zdania, 8 z listą kilku błędów, a wiele opisów było w stylu podręcznika („ćwiczenie izolowane rozwijające siłę i masę barków”).
- Migracja danych (addytywna, odwracalna): kopia starych tekstów w `catalogue_text_backup`, jednorazowa, wybór po `slug`. Cofnięcie: `scripts/opisy-top100-cofnij.sql`. Test: `opisy-top100.test.ts` (długość, żargon, angielskie słowa, płeć).

## Czy portal pokazuje opis i wskazówki w trakcie serii?
**Częściowo.** Na ekranie serii klient widzi tylko pole „instrukcja wykonania” (po rozwinięciu „Jak wykonać”) oraz notatkę trenera. **Opis, wskazówki i najczęstszy błąd nie są wyświetlane** (w rozgrzewce i schłodzeniu pokazuje się tylko instrukcja).
Najprostszy sposób, bez budowania nowych ekranów (jedna zmiana po stronie serwera, `routes/training.ts`, ok. linii 299): zamiast `howTo = instrukcja` złożyć tekst z trzech pól, np.
`howTo = instrukcja + "\n\nWskazówki: " + wskazówki + "\n\nNajczęstszy błąd: " + błąd`
(portal już wyświetla `howTo` z zachowaniem nowych linii, więc ekran się nie zmienia). Tak samo dla rozgrzewki i schłodzenia (`description` w `buildWarmupAndCooldown`). Koszt: kilka linii i test; dotyczy zachowania widocznego dla klienta, więc czeka na Twoją zgodę.
