# Roadmapa trainer-panel

Zasada: nie budujemy kolejnego punktu, dopóki wcześniejsze nie są stabilne.
Każda nowa funkcja od razu z dopracowanym UX (dla klienta: przede wszystkim telefon).

1. **Działająca pętla**: zaproszenie → wywiad → plan → portal klienta
   (pilnuje jej `scripts/smoke-gcp.sh`).
2. **Wywiad dający dobre dane**: bezpieczeństwo, ograniczenia, cele, sprzęt, czas.
3. **Szkic planu z wyjaśnieniem wyboru ćwiczeń + walidator** (ostrzeżenia, nie blokady).
4. **Zapisywanie treningów przez klienta**: serie, ciężar, RIR, ból.
5. **Osiągnięcia + karta do udostępnienia na story** (1080×1920) z marką trenera,
   generowana w przeglądarce. Nigdy dane zdrowotne, waga ani kontuzje na karcie.
   Udostępnia tylko klient, świadomie. Osiągnięcia wyłącznie z zapisanych treningów
   (antyoszustwo).
6. **Skrzynka uwagi trenera**: alerty o klientach wymagających uwagi.
7. **Pełny przegląd UX całej pętli + beta z 3–5 trenerami.**
8. **Później**: streaki/poziomy, osiągnięcia trenera, OpenGym (jeśli katalog okaże się
   za mały), maskotka-byczek.
   Własne logo trenera w mailu z zaproszeniem i na karcie story — później (wymaga publicznego
   adresu aplikacji i wgrywania plików).

## Pulpit (stan 23.10)
Zbudowany z istniejących danych (`GET /api/dashboard/summary`): wymaga uwagi (nowy wywiad, brak planu,
koniec planu, niewykorzystane zaproszenie), dziś (rezerwacje), ostatnie zdarzenia, „Pierwsze kroki”.
Czeka na pkt 4 (zapisywanie treningów): kafelki realizacji planu oraz powody uwagi „ból / przerwa /
spadek realizacji / rekordy” (TODO w `pages/Dashboard.tsx`). Brak flagi „wywiad przejrzany” w schemacie —
„nowy wywiad” = ostatni kompletny wywiad z 7 dni bez planu utworzonego po nim.

