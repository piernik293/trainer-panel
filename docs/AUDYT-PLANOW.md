# Audyt planów — ćwiczenia na zgłoszony staw

Wygenerowano: 2026-10-24 17:19 UTC, baza aplikacji (dane deweloperskie). Tylko odczyt — w planach nic nie zmieniono.
Skrypt: `scripts/baza/audyt-planow.ts`; reguły: `artifacts/api-server/src/services/jointPlanAudit.ts`.

Zgłoszony staw = z opisu zdrowia w wywiadzie albo ze zgłoszenia „Coś boli?” z ostatnich 30 dni. Sprawdzone plany: wszystkie poza zarchiwizowanymi (1). Zamiennik = najbliższy niższy szczebel tej samej drabinki, który nie obciąża zgłoszonego stawu, pasuje do sprzętu i miejsca klienta i spełnia reguły bezpieczeństwa poziomu; ćwiczenia spoza drabinek nie mają propozycji. Ten sam problem trener widzi w panelu przy ćwiczeniu („To ćwiczenie obciąża zgłoszony staw”) z przyciskiem „Zamień na: …”.

**Znalezione: 1** (z propozycją zamiennika: 0).

| Klient | Plan | Dzień | Ćwiczenie | Staw | Proponowany zamiennik (drabinka niżej) | Uwagi |
|---|---|---|---|---|---|---|
| #224 Ala D. | Plan demo — siła (#69) | Dzień A — góra | Arnold press (id 138) | Bark | brak — wybór ręczny | plan aktywny |
