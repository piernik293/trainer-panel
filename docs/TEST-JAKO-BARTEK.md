# Test „jako Bartek” — pierwsza osoba z zewnątrz (iPhone lub Android, dane komórkowe, nie Wi-Fi domowe)

Bartek dostaje link od trenera i nie zna aplikacji. Zaznaczaj tylko to, co **naprawdę** zadziałało. Każdy punkt „nie” = zgłoszenie z numerem punktu i zrzutem ekranu.

**A. Wejście (trener Marek wysłał zaproszenie e-mailem lub linkiem)**
- [ ] 1. Mail z zaproszeniem przyszedł (nie do spamu); temat „Marek Nowak zaprasza Cię do Optimatren — …”; przycisk „Wypełnij wywiad” działa.
- [ ] 2. Strona wywiadu otwiera się w < 3 s na danych komórkowych; napisy czytelne, bez przewijania na boki.
- [ ] 3. Wywiad do końca (ok. 5 min): pytania po polsku, jasne; pytanie o ból/stawy da się wypełnić bez poczucia „diagnozy”.
- [ ] 4. Po wysłaniu: komunikat „co dalej” i brak błędu.

**B. Konto i plan**
- [ ] 5. Link aktywacji z maila trenera; rejestracja (Google lub e-mail) bez zacięcia; wylogowanie i ponowne logowanie działa.
- [ ] 6. „Dziś” pokazuje plan od trenera; imię poprawne (bez „undefined”).
- [ ] 7. Dodaj ekran do ekranu głównego (podpowiedź w aplikacji / menu przeglądarki); ikona Optimatren; otwiera się bez paska przeglądarki.

**C. Trening**
- [ ] 8. „Start” → byczek, pierwsze ćwiczenie; opis i miniatura czytelne.
- [ ] 9. Zapis serii (ciężar, powtórzenia) działa jedną ręką; przycisk „Coś boli?” widoczny i pod kciukiem.
- [ ] 10. Stoper przerwy: odlicza, dźwięk/wibracja wg ustawień, wyciszenie działa; przy zablokowanym ekranie wraca poprawnie.
- [ ] 11. Tryb samolotowy w trakcie: baner „Brak internetu”, serie nadal się zapisują, po powrocie sieci wysyłają się.
- [ ] 12. „Coś boli?” → komunikat „Przerwij to ćwiczenie, jeśli boli”; trener widzi zgłoszenie (w panelu), mail do trenera bez szczegółów zdrowotnych.
- [ ] 13. Koniec treningu: podsumowanie, ocena, story do pobrania (obraz otwiera się w galerii).

**D. Po treningu**
- [ ] 14. „Postępy”: seria tygodni, rekordy; teksty bez zawstydzania.
- [ ] 15. „Ty”: zmiana imienia, ustawień stopera; pobranie danych / usunięcie konta znalezione bez pomocy.
- [ ] 16. Ciemny motyw (ustawienie telefonu) — wszystko czytelne.

**E. Solo (druga osoba bez trenera)**
- [ ] 17. Rejestracja bez zaproszenia → krótki wywiad → plan z generatora w < 10 s.
- [ ] 18. „Mam własny plan”: wyszukaj ćwiczenie, zapisz, wystartuj trening.
- [ ] 19. „Zamień na inne” działa, po trzeciej zamianie jasny komunikat o limicie.

**F. Bezpieczeństwo (po stronie właściciela)**
- [ ] 20. Bartek nie widzi niczego cudzego (adres bez sesji `…/api/clients` → odmowa).
- [ ] 21. `scripts/smoke-public.sh` bez błędów w dniu testu.
