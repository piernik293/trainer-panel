# Biblioteka trenera i propozycje do wspólnej (flaga `TRAINER_LIBRARY_ENABLED`, domyślnie wyłączona)

## Co istniało i co rozbudowałem
Własne ćwiczenia trenera (`exercises.created_by_trainer_id`, z formularza i z importu Excela) już były prywatne dla trenera i jego podopiecznych — **nie dublowałem ich**. Dodałem warstwę „Moja biblioteka” (panel → Biblioteka ćwiczeń → „Moja biblioteka”).

## Zasady
- **Prywatność:** własne ćwiczenia widzi tylko trener i jego podopieczni (test izolacji A/B).
- **Komplet danych:** ćwiczenie jest „kompletne”, gdy ma wszystko z katalogu (wzorzec, poziom, sprzęt, miejsce, opis, instrukcje, błędy, wskazówki, mięśnie) **oraz poziom obciążenia stawów i jawną listę stawów** (może być pusta = brak). Bez tego nie trafia do podopiecznego ze zgłoszonym stawem ani do osoby bez zgody zdrowotnej. Uzupełnienie: „Stawy i poziom obciążenia” w wierszu ćwiczenia.
- **Generator:** domyślnie **nie** używa ćwiczeń własnych (wcześniej nie było tu żadnego filtra właściciela — poprawione we wszystkich trzech miejscach: generowanie dnia, rekomendacje dnia, rekomendacje klienta). Opcja „Używaj moich ćwiczeń w generatorze” działa tylko dla Twoich kompletnych ćwiczeń; cudzych i ćwiczeń osób Solo generator nie użyje nigdy. Ręczne wstawianie do planu działa jak dotąd (z ostrzeżeniem stawów jak dla katalogu).
- **Zgoda:** przy ćwiczeniu pole „Zgadzam się, by Optimatren dodał to ćwiczenie do wspólnej biblioteki” (domyślnie NIEzaznaczone, link do Regulaminu §8, zapis daty zgody). Zgodę można dać tylko dla kompletnego ćwiczenia; można ją cofnąć, dopóki nie zostało dodane.
- **Administrator → zakładka „Propozycje ćwiczeń”:** podgląd (opis, wykonanie, mięśnie, stawy), **ostrzeżenie o podobnych ćwiczeniach w katalogu** (nazwa/wzorzec), [Dodaj do wspólnej] = **KOPIA** do katalogu: nieaktywna, ukryta, „do weryfikacji”, **bez ustawiania „bez aktywności”** i poziomu nauki (ocenia je przegląd katalogu, więc nie trafia do początkujących/nieaktywnych), z przypisaniem mięśni; oryginał zostaje u trenera. [Odrzuć] wymaga powodu (trener go widzi). Każda akcja w dzienniku (`exercise_proposal_log`: kto, co, kiedy, powód).

## Włączenie
`TRAINER_LIBRARY_ENABLED=1` + restart (Twoja zgoda; `docs/DO-DECYZJI.md`). Migracja 0078 (addytywna, z kopią bazy).
