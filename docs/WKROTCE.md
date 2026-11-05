# „Wkrótce w Optimatren” — karta z głosowaniem „Chcę to” (flaga `ROADMAP_ENABLED`, domyślnie wyłączona)

Tylko karty i głosy — **żadnego działającego kodu** tych funkcji. Oznaczenie „Wkrótce”, bez dat i obietnic.

## Co widać
- Trener: karta na pulpicie (pod „Dziś” i wydarzeniami). Osoba Solo i podopieczny: karta w „Ty”.
- Pozycja: ikona, nazwa, jedno zdanie, znacznik „Wkrótce”, przycisk „Chcę to · N” (kolejny dotyk cofa głos). Jeden głos na konto na pozycję.
- Start (12 pozycji, migracja 0075): Prowadzę trening · Płatności BLIK od klientów · Import planu ze zdjęcia · Podsumowanie roku (story) · Rynek trenerów · Kalkulator 1RM · Prognoza progresu · BMR / TDEE i cel wagi · Makroskładniki i szablony żywienia · Suplementy w pigułce · Plany nawyków · Asystent AI.

## Administrator → zakładka „Wkrótce”
Wyniki z podziałem **trenerzy / Solo / podopieczni**, dodanie własnej pozycji, „Ukryj/Pokaż”, „Oznacz Gotowe”. Ukryta pozycja znika u użytkowników; oddane głosy zostają.

## API
`GET /api/roadmap/status` (publiczne) · `GET /api/roadmap` · `POST|DELETE /api/roadmap/:id/vote` · `GET /api/admin/roadmap` · `POST /api/admin/roadmap` · `PATCH /api/admin/roadmap/:id`. Przy wyłączonej fladze 404.

## Włączenie
`ROADMAP_ENABLED=1` w `.env` + restart. **Wymaga Twojej zgody** (`docs/DO-DECYZJI.md`).
