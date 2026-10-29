# Strona dla trenerów — wersja robocza

Statyczny plik `index.html` (bez zewnętrznych skryptów i czcionek; kolory ze „Stylu B”, jasny i ciemny motyw według ustawień systemu). Nie jest wdrożony i nie ma domeny.

- **Adres do zapisów:** w `index.html` ustaw stałą `OWNER_EMAIL` (na górze, w znaczniku `<script>`). Przycisk „Dołącz do bety” otwiera wiadomość `mailto:` z tematem i krótkim szablonem. Gdy stała jest pusta, wiadomość otwiera się bez adresata.
- **Hasło główne:** „Plan, który sam pilnuje bólu i poziomu klienta”. Alternatywy: „Plan treningowy w 2 minuty — i dopasowany do poziomu klienta” oraz „Układasz plan szybciej, a aplikacja uwzględnia ból i poziom klienta”.
- **Treści celowo pominięte:** opinie klientów, liczby użytkowników, porównania z innymi aplikacjami (nie mamy ich).
- **Zrzuty:** `screens/strona-375.png`, `screens/strona-1440.png`.
- **Podgląd lokalny:** otwórz plik w przeglądarce albo `python3 -m http.server --directory docs/strona 8099` (tylko lokalnie).
