# Solo: „sterownik” generowania planu po stronie serwera — plan (decyzja 59)

Stan: 28.10.2026. **Tylko plan, bez kodu.** Realizacja po przeglądzie katalogu (decyzje 52–53), bo Solo bierze wyłącznie ćwiczenia zweryfikowane i dziś miałoby najwięcej odmów.

## Problem
Generator planu jest dziś sterowany z kreatora trenera: panel woła kolejno rozkład objętości, a potem `POST …/generate-day` dla każdego dnia (pamięć tygodnia, typy dni). Osoba Solo nie ma trenera ani panelu, więc nikt tych wywołań nie zrobi. Reguły Solo (`services/solo.ts`: tylko zweryfikowane, skoki wg doświadczenia, wykluczenie ćwiczeń z bólem na 90 dni) są gotowe i wpięte w pulę; brakuje „kierowcy”.

## Kroki
1. **S1 — wydzielić logikę dnia z trasy** (`planDraftGenerateDay.ts`, ok. 1100 linii) do wywoływalnej usługi `generateDay(clientId, parametry)`: bez zmiany zachowania, trasa tylko ją woła. Testy bez zmian muszą przejść (2700+), symulacja 1000 profili musi dać identyczny wynik.
2. **S2 — kierowca** `services/soloPlanDriver.ts`: poziom efektywny → liczba dni (z wywiadu, 2–5) → podział (`recommendSplitType`/`getDayTemplate`) → kolejne dni z pamięcią tygodnia, `alternativeIndex`, bilansem tygodnia → zapis planu jako aktywnego (jeden aktywny plan na osobę) → ewentualny drugi przebieg „od nowa” dopiero po zakończeniu planu.
3. **S3 — wywiad Solo**: wywiad bez tokenu zaproszenia (istniejący formularz, zapis do `surveys` dla osoby Solo) i trasa `POST /api/solo/plan` za `SOLO_ENABLED`. W portalu ekran startu przełącza `interviewReady` na prawdę.
4. **S4 — limity i bezpieczeństwo**: własny limit planów dla Solo (bez pakietów trenera; np. 1 plan na 4 tygodnie, do uzgodnienia), zgoda zdrowotna jak w wywiadzie (brak zgody = tryb ostrożny), komunikat przy odmowie w prostych słowach i z propozycją „połącz się z trenerem”.
5. **S5 — odbiór**: symulacja ze stylem „solo” (reguły Solo) na 1000 profili: 0 naruszeń bezpieczeństwa; odsetek odmów dnia musi być akceptowalny dla właściciela (próg do ustalenia po przeglądzie katalogu).

## Zależności i ryzyka
- **Katalog**: Solo = tylko zweryfikowane. Dopóki ok. 80% ćwiczeń jest „do weryfikacji”, odmowy dominują. Dlatego najpierw przegląd (`docs/PRZEGLAD-KATALOGU.csv`).
- **S1 to największa zmiana** (refaktor krytycznej trasy): robić osobno, z porównaniem przed/po.
- Bez zmiany schematu bazy w S1–S2; S3–S4 mogą wymagać jednej kolumny/tabeli (limit planów) — wtedy osobna zgoda i backup.
- Brak kosztów zewnętrznych (bez AI, bez płatnych usług).

## Pytania do właściciela (z rekomendacją)
1. Limit planów dla Solo: 1 na 4 tygodnie? Rekomendacja: tak.
2. Co przy odmowie dnia: pokazać krótszy dzień (min. 3, jak pkt 51) czy zawsze proponować kontakt z trenerem? Rekomendacja: min. 3 + zachęta do połączenia z trenerem.
3. Czy Solo może włączyć kalistenikę sam (styl bez trenera)? Rekomendacja: dopiero po przeglądzie katalogu kalistenicznego.
