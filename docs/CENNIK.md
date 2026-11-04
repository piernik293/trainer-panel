# Cennik Optimatren — model zatwierdzony przez właściciela (PROPOZYCJA, liczby do potwierdzenia na becie)

W becie NIE ma płatności, abonamentów ani prowizji — ten dokument opisuje model, do którego zmierzamy. Limity planu Free i kampania „Złote Byczki” działają już teraz (kampania za flagą `GOLDEN_BULLS_ENABLED`).

## Zasada nadrzędna
**Bezpieczeństwo nigdy nie jest płatne.** Filtry bólu i stawów, dopasowanie do poziomu, przycisk „Coś boli?”, ostrzeżenia i zgoda zdrowotna działają tak samo u każdego, w każdym planie.

## Kto za co płaci
| Kto | Cena | Co dostaje |
|---|---|---|
| **Solo** | za darmo | plan z generatora na cykl, trening, stoper przerw, kroki, zamiana ćwiczeń, własny plan, import ze zdjęcia (po becie), postępy, story. W tle niewidoczne limity przeciw nadużyciom (nie wpływają na zwykłe używanie). |
| **Podopieczny trenera** | za darmo, nigdy nie dopłaca | wszystko to, co Solo, plus plan i kontakt z trenerem. |
| **Trener Free** | za darmo | do 3 podopiecznych, generator 5 planów miesięcznie, 3 szablony planów, PDF bez logo; bez importu z Excela i bez statystyk biznesowych. |
| **Trener Pro** | abonament miesięczny (po becie) | bez limitów, PDF z logo, import z Excela, statystyki, profil na rynku trenerów. |

Nowy trener dostaje 14 dni Pro za darmo (okres próbny). Dane nigdy nie są usuwane ani blokowane z powodu zakończenia okresu próbnego — limity Free dotyczą tylko dodawania nowych rzeczy ponad limit.

## Rynek trenerów (po becie)
Osoba Solo może kupić u trenera Pro konsultację albo plan. Prowizja **10–15%** pobierana **tylko od klientów pozyskanych przez aplikację**; od własnych klientów trenera (zaproszonych linkiem lub kodem) **nic**. Wymaga operatora płatności i konsultacji prawnej (lista pytań w `docs/prawne/REGULAMIN-PROJEKT.md`).

## Story i podsumowania
Wszystko za darmo: story po treningu, a po becie podsumowania tygodnia, miesiąca, kwartału i roku oraz nowe osiągnięcie; kolor wg rodzaju aktywności.

## Kampania „Złote Byczki”
Numerowana odznaka dla pierwszych osób, z ograniczonymi korzyściami w czasie. **Nic „na zawsze” poza samą odznaką.**

| | Trenerzy | Osoby Solo |
|---|---|---|
| Liczba miejsc | **10** pierwszych | **100** pierwszych |
| Kiedy przyznawana | w chwili akceptacji wniosku o konto trenera | przy pierwszym ukończonym treningu (żeby nie dostawały konta-widma) |
| Korzyść | **6 miesięcy Pro za darmo**, potem zwykła cena albo Free; wyróżnienie na rynku trenerów przez 3 miesiące od startu rynku | **przyszłe płatne funkcje Solo za darmo przez 3 miesiące** od startu osoby; zniżka na pierwszą konsultację u trenera (po starcie rynku) |
| Odznaka | tak, na stałe | tak, na stałe |

**Druga fala:** 3 miesiące zamiast 6 (ustawienie `GOLDEN_BULLS_TRAINER_MONTHS=3`, nowa pula).

### Jak to działa w aplikacji
- Flaga `GOLDEN_BULLS_ENABLED` (domyślnie wyłączona). Pule: `GOLDEN_BULLS_TRAINER_POOL` (10), `GOLDEN_BULLS_SOLO_POOL` (100); czas: `GOLDEN_BULLS_TRAINER_MONTHS` (6), `GOLDEN_BULLS_SOLO_MONTHS` (3); wykluczenia: `GOLDEN_BULLS_EXCLUDE_CLERK_IDS`.
- Przyznanie automatyczne, w transakcji (bez duplikatów i bez przekroczenia puli nawet przy równoczesnych zapisach). **Konta administratora, QA i testowe (`…+clerk_test@…`, adresy zastępcze) nie zabierają miejsc.**
- Trener-Byczek dostaje Pro gratis przez istniejący mechanizm okresu próbnego (data końca; na pulpicie „Pro gratis (Złoty Byczek #N): zostało X dni”; w panelu administratora „Przedłuż” działa jak dotąd). Dłuższego okresu, który trener już ma, nie skracamy.
- Licznik „Zostało X z 10” / „X z 100”: mały, na ekranie logowania i rejestracji (Solo) oraz przy wniosku o konto trenera. Gdy pula pusta — znika.
- Odznaka „Złoty Byczek #N” w „Ty” i mały złoty znaczek na story (bez numeru konta). Grafika zastępcza zgodna z zatwierdzonym projektem; podmiana — `docs/MASKOTKA.md`.
- Panel administratora → „Byczki”: lista (kto, numer, kiedy), ręczne przyznanie i odebranie, **zawsze z powodem** (np. konto testowe). Odebranie zwalnia miejsce w puli i kończy Pro gratis trenera.

## Do potwierdzenia na becie
Ceny Pro i ich poziom, limity Free (3 podopiecznych, 5 planów, 3 szablony), wysokość prowizji (10–15%), zniżka na pierwszą konsultację, długość drugiej fali.
