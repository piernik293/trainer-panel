# Logowanie i kod — diagnoza i instrukcja (Clerk, 2.11.2026)

Ustawienia instancji Clerk (dev) odczytane z publicznego opisu środowiska (Frontend API) — klucz tajny nie był potrzebny i nigdzie go nie wypisano. **Ustawień Clerk nie zmieniałem** (STOP-4); poniżej tylko instrukcja.

## 1. Kiedy dziś Clerk prosi o kod (sprawdzone w przeglądarce, osobne konto testowe z hasłem)
| Sytuacja | Kod? | Dlaczego |
|---|---|---|
| **Rejestracja e-mailem** | **tak, zawsze (raz)** | „Zweryfikuj adres e-mail przy rejestracji” jest włączone (`verify_at_sign_up`, kod e-mail). |
| **Rejestracja przez Google** | nie | Google potwierdza adres. |
| **Logowanie e-mail + hasło, to samo urządzenie/przeglądarka** | nie | Domyślna metoda logowania to hasło (`preferred_sign_in_strategy: password`). |
| **Logowanie e-mail + hasło, NOWE urządzenie lub przeglądarka** | **tak — to główny powód zniechęcenia** | Test: logowanie hasłem z czystej przeglądarki kończy się statusem `needs_client_trust` i drugim krokiem „kod e-mail”. To funkcja Clerk **Client Trust / Device Trust** (każde nowe urządzenie jest „niezaufane”, brak MFA → kod na e-mail). Obejmuje też ludzi, którzy czyszczą ciasteczka albo wchodzą z telefonu i z komputera. |
| **Logowanie przez Google** (także z nowego urządzenia) | nie | Jedno kliknięcie. |
| „Nie pamiętam hasła” | tak | Kod resetu hasła na e-mail (potrzebny z definicji). |
| Ktoś wybierze „kod e-mail” zamiast hasła | tak | Jest to dozwolona metoda logowania (`email_code` jako pierwszy czynnik). |

Inne odczytane ustawienia: hasło wymagane, min. 15 znaków; blokada konta po 10 błędnych próbach na 60 min; drugi czynnik (MFA) wyłączony; tryb testowy dev (kod `424242` dla adresów z `+clerk_test`).

## 2. Co ma zrobić właściciel w dashboard.clerk.com (instancja produkcyjna ustawia się osobno — te same kroki)
Nazwy sekcji w panelu Clerk bywają zmieniane; jeśli nie widzisz którejś pozycji, wyślij mi zrzut ekranu menu.
1. **Google jednym kliknięciem** — *Configure → User & authentication → Social connections*: „Google” ma być **włączone** (jest). W instancji produkcyjnej dodaj własne dane OAuth Google (Clerk poda krok po kroku; bez nich Google na produkcji nie zadziała).
2. **Kod tylko raz, przy zakładaniu konta** — *Configure → User & authentication → Email, phone, username → Email address*: zostaw **„Verify at sign-up” = włączone** (kod przy rejestracji). W tej samej sekcji, przy „Sign-in with”, zostaw włączone **Password** (to jest logowanie bez kodu). „Email verification code” jako metoda logowania możesz wyłączyć, żeby nikt nie był do niej zachęcany (reset hasła i tak działa osobnym kodem).
3. **Bez kodu na nowym urządzeniu** — *Configure → Protections* (w starszych wersjach: *Attack protection*): wyłącz **Client Trust / Device Trust („new device verification”)**. Dokumentacja Clerk opisuje tę funkcję w „Client Trust” i wskazuje stronę **Protections**; dokładnej nazwy przełącznika nie mogłem sprawdzić bez dostępu do Twojego dashboardu. *Ryzyko w jednym zdaniu:* po wyłączeniu samo poprawne (np. wykradzione) hasło wystarcza do wejścia z nowego urządzenia, więc chroń się dłuższym hasłem (jest min. 15 znaków), blokadą po błędnych próbach (jest) i zachęcaj do Google.
4. Po zmianie: wyloguj się, wejdź z czystej przeglądarki (okno prywatne) i zaloguj hasłem — nie powinno być kodu. Powiedz mi, a powtórzę test automatem.

## 3. Co zmieniono w aplikacji (2.11.2026)
- Strona logowania: „Kontynuuj z Google” jako pierwszy, największy przycisk; pod spodem e-mail i hasło; krótkie teksty „Zaloguj się” / „Załóż konto — to zajmie minutę”; przy kodzie rejestracji zdanie „Wysłaliśmy kod na Twój e-mail — to tylko raz, przy zakładaniu konta.”; „Nie pamiętam hasła” przy haśle.
- „Zobacz, jak to działa (bez konta)” → `/client-landing/demo` (flaga `GUEST_DEMO_ENABLED`): przykładowy trening Dziś → trening → seria → koniec, na danych w przeglądarce; pasek „Tryb podglądu — nic nie jest zapisywane”; żadnych zapytań zapisujących, bez wywiadu i pytań o zdrowie; na końcu „Załóż konto, żeby zapisywać postępy”.
- Sprawdzenie kodu przy rejestracji w przeglądarce bez interakcji człowieka jest niemożliwe (ochrona antybotowa Clerk), więc to zdanie sprawdzono tylko w teście tekstów, nie na żywym ekranie.
