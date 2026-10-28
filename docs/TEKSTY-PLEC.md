# Teksty portalu bez płci (decyzja 56, 28.10.2026)

Zasada: teksty widoczne dla klienta są neutralne (bezosobowe albo w formie, która nie zdradza płci); nie ma „Przeszedłeś/Przeszłaś” ani zapisów „-eś/-aś”. Strażnik: `artifacts/client-landing/src/lib/genderNeutralTexts.test.ts` (czyta źródła portalu i konfiguracji wywiadu przy każdym uruchomieniu testów) oraz test w `achievements.test.ts` (wszystkie teksty osiągnięć).

## Przejrzane obszary
Portal klienta (`artifacts/client-landing/src`), konfiguracja wywiadu (`lib/survey-config`), teksty osiągnięć (`services/achievements.ts`), komunikaty API widoczne dla klienta, e-mail zaproszenia (mówi trener w 1. osobie czasu teraźniejszego i przyszłego: „Zapraszam Cię…”, „przygotuję…” — bez formy płciowej), ekrany „Dziś/Plan/Postępy/Ty”, teksty „Solo”.

## Zmienione (lista)
| Gdzie | Było | Jest |
|---|---|---|
| Wywiad, krok „Data urodzenia” | „Kiedy się urodziłeś/-aś?” | „Data urodzenia” |
| Wywiad, sport (3 kroki) | „…bo wybrałeś/-aś cel sportowy.” | „…bo celem jest sport.” |
| Wywiad, „Jak długo trenujesz?” | „…bo wskazałeś/-aś doświadczenie treningowe.” | „…bo wskazano doświadczenie treningowe.” |
| Wywiad, „Opisz zdrowie i ograniczenia” | „…bo wskazałeś/-aś ograniczenia.” | „…bo wskazano ograniczenia.” |
| Wywiad, opis poziomu „Brak aktywności” | „…nigdy wcześniej nie realizowałem/-am uporządkowanego treningu oporowego…” | „…nie mam doświadczenia w uporządkowanym treningu oporowym…” |
| Wywiad, odpowiedź o skokach | „Trochę — robiłem/am okazjonalnie” | „Trochę — okazjonalnie” (stare zapisane odpowiedzi nadal działają) |
| Aktywacja konta, błędny link | „Upewnij się, że skopiowałeś pełny link.” | „Upewnij się, że link jest skopiowany w całości.” |
| Osiągnięcie „Nowy szczebel” | „Przeszedłeś na wyższy poziom tego ruchu.” | „Nowy poziom tego ruchu!” |

## Sprawdzone i bez zmian (neutralne)
„Tak trzymaj”, „Trenujesz regularnie”, „Najtrudniejszy krok zrobiony”, „Dobra robota”, „Zaczynamy”, „Trenuj po swojemu”, „Prowadzę podopiecznych”, „Zrobione”, komunikaty o brakach w dniu („Mało ćwiczeń… Dodaj gumę albo drążek…”), kroki, pakiety, dokumenty prawne (szkielety).

## Uwaga
Nie zbieramy płci do dopasowania tekstów (pole `gender` w wywiadzie służy do obliczeń), dlatego wybrano formy neutralne zamiast odmiany.
