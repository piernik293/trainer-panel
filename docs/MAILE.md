# Maile Optimatren — teksty do akceptacji

Wszystkie maile używają jednego szablonu (`services/mail/layout.ts`): logo „Optimatren”, akcent #C2410C, Manrope z fallbackiem, jasne tło, max 600 px, wersja tekstowa obok, jeden przycisk, stopka (kto wysłał, dlaczego dostajesz mail, kontakt z `CONTACT_EMAIL` jeśli ustawiony, polityka prywatności).
Zasady: zwrot po imieniu („Cześć, Anna,”), 3–5 krótkich zdań, bez form zależnych od płci (imiona w mianowniku: „Trener: Marek Nowak.”), BEZ danych zdrowotnych (zgłoszenie bólu to tylko „Masz nowe zgłoszenie”).
Nadawca: maile systemowe — „Optimatren”; maile w imieniu trenera — „Imię Nazwisko przez Optimatren” + Reply-To = e-mail trenera. Maile idą zawsze na główny e-mail konta z Clerk i nigdy na adresy zastępcze (`.invalid`, `.example`, `.test`, `.localhost`, `.local`).
Teksty są wdrożone dokładnie tak, jak niżej — zmiana to edycja `services/mail/catalogue.ts` (ten dokument jest jego kopią). Podgląd każdego szablonu i „Wyślij test do mnie”: panel administratora → „Maile”.

Uwaga: zaproszenie od trenera (`invite`) wychodzi nadal własnym, wcześniejszym renderem (`services/inviteEmail.ts`: ten sam układ i kolory, dodatkowo baner), z tematem „<Imię trenera> zaprasza Cię do wywiadu treningowego”. Poniżej proponowany nowy temat i treść w jednym szablonie — do akceptacji; po zatwierdzeniu przełączę wysyłkę.

## Zaproszenie od trenera

- Do: osoba · Kiedy: Trener zaprasza osobę do wywiadu (e-mail albo link).
- Temat: **Marek Nowak zaprasza Cię do współpracy w Optimatren**
- Nadawca: Marek Nowak przez Optimatren (Reply-To: trener)
- Treść:

  > Cześć, Anna,
  >
  > Marek Nowak zaprasza Cię do współpracy w Optimatren.
  >
  > Wypełnij krótki wywiad — zajmie to kilka minut. Na jego podstawie trener przygotuje Twój plan.
  >
  > Link jest ważny 7 dni.

- Przycisk: **Wypełnij wywiad**
- Stopka: „Dostajesz tę wiadomość, bo trener zaprosił Cię do aplikacji.”

## Prośba o dołączenie (do trenera)

- Do: trener · Kiedy: Osoba wpisała kod albo użyła linku trenera.
- Temat: **Nowa prośba o dołączenie**
- Nadawca: Optimatren
- Treść:

  > Cześć, Marek,
  >
  > Anna chce dołączyć do Twoich podopiecznych.
  >
  > Zaakceptuj prośbę albo ją odrzuć — wystarczy jedno kliknięcie w aplikacji.

- Przycisk: **Zobacz prośbę**
- Stopka: „Dostajesz tę wiadomość, bo ktoś poprosił o dołączenie do Twoich podopiecznych.”

## Akceptacja prośby (do podopiecznego)

- Do: podopieczny · Kiedy: Trener zaakceptował prośbę o dołączenie.
- Temat: **Trener przyjął Twoją prośbę**
- Nadawca: Marek Nowak przez Optimatren (Reply-To: trener)
- Treść:

  > Cześć, Anna,
  >
  > Twoja prośba została przyjęta. Twoim trenerem jest Marek Nowak.
  >
  > Od teraz plan i treningi są w jednym miejscu. Wkrótce dostaniesz od trenera swój plan.

- Przycisk: **Otwórz aplikację**
- Stopka: „Dostajesz tę wiadomość, bo z Twojego konta poproszono o dołączenie do trenera.”

## Odrzucenie prośby (do osoby)

- Do: osoba · Kiedy: Trener odrzucił prośbę o dołączenie.
- Temat: **Prośba nie została przyjęta**
- Nadawca: Optimatren
- Treść:

  > Cześć, Anna,
  >
  > Twoja prośba nie została tym razem przyjęta.
  >
  > Trener: Marek Nowak.
  >
  > Możesz poprosić innego trenera albo trenować samodzielnie w aplikacji.

- Przycisk: **Otwórz aplikację**
- Stopka: „Dostajesz tę wiadomość, bo z Twojego konta poproszono o dołączenie do trenera.”

## Odłączenie przez trenera (do podopiecznego)

- Do: podopieczny · Kiedy: Trener odłączył podopiecznego.
- Temat: **Zakończono współpracę z trenerem**
- Nadawca: Marek Nowak przez Optimatren (Reply-To: trener)
- Treść:

  > Cześć, Anna,
  >
  > Twoje konto zostało odłączone od trenera.
  >
  > Trener: Marek Nowak.
  >
  > Twoja historia treningów zostaje u Ciebie. Możesz dalej trenować samodzielnie albo poprosić o dołączenie do trenera.

- Przycisk: **Otwórz aplikację**
- Stopka: „Dostajesz tę wiadomość, bo Twoje konto było połączone z trenerem.”

## Odłączenie przez podopiecznego (do trenera)

- Do: trener · Kiedy: Podopieczny odłączył się od trenera.
- Temat: **Podopieczny odłączył się**
- Nadawca: Optimatren
- Treść:

  > Cześć, Marek,
  >
  > Podopieczny: Anna.
  >
  > Współpraca została zakończona z inicjatywy tej osoby.
  >
  > Nie masz już dostępu do jej danych.

- Przycisk: **Otwórz panel**
- Stopka: „Dostajesz tę wiadomość, bo ktoś był Twoim podopiecznym.”

## Plan gotowy (do podopiecznego)

- Do: podopieczny · Kiedy: Trener aktywował plan.
- Temat: **Twój plan jest gotowy**
- Nadawca: Marek Nowak przez Optimatren (Reply-To: trener)
- Treść:

  > Cześć, Anna,
  >
  > Twój plan jest gotowy — zacznij pierwszy trening.
  >
  > Wszystko znajdziesz w aplikacji: ćwiczenia, serie i podpowiedzi. Działa też bez internetu.

- Przycisk: **Zacznij pierwszy trening**
- Stopka: „Dostajesz tę wiadomość, bo Twój plan został właśnie aktywowany.”

## Wniosek o konto trenera — potwierdzenie przyjęcia

- Do: wnioskodawca · Kiedy: Osoba wysłała wniosek o konto trenera.
- Temat: **Dostaliśmy Twój wniosek o konto trenera**
- Nadawca: Optimatren
- Treść:

  > Cześć, Anna,
  >
  > Dostaliśmy Twój wniosek o konto trenera.
  >
  > Odpowiadamy zwykle w ciągu 24 godzin. Dostaniesz od nas wiadomość z decyzją.

- Przycisk: **Otwórz aplikację**
- Stopka: „Dostajesz tę wiadomość, bo z Twojego konta złożono wniosek o konto trenera.”

## Nowy wniosek o konto trenera (do właściciela)

- Do: właściciel · Kiedy: Ktoś złożył wniosek o konto trenera.
- Temat: **Nowy wniosek o konto trenera**
- Nadawca: Optimatren
- Treść:

  > Cześć,
  >
  > Nowy wniosek o konto trenera.
  >
  > Osoba: Anna Test · anna@poczta.pl
  >
  > Notatka: Prowadzę klientów od 3 lat.
  >
  > Rozpatrz go w panelu administratora (zakładka „Wnioski”).

- Przycisk: **Rozpatrz wniosek**
- Stopka: „Dostajesz tę wiadomość, bo jesteś właścicielem Optimatren.”

## Wniosek zaakceptowany

- Do: wnioskodawca · Kiedy: Właściciel zaakceptował wniosek.
- Temat: **Twoje konto trenera jest aktywne**
- Nadawca: Optimatren
- Treść:

  > Cześć, Anna,
  >
  > Twoje konto trenera jest aktywne — zaloguj się tym samym kontem, a panel trenera będzie dostępny.
  >
  > Masz 14 dni okresu próbnego z pełnym dostępem.

- Przycisk: **Otwórz panel trenera**
- Stopka: „Dostajesz tę wiadomość, bo z Twojego konta złożono wniosek o konto trenera.”

## Wniosek odrzucony

- Do: wnioskodawca · Kiedy: Właściciel odrzucił wniosek.
- Temat: **Wniosek o konto trenera**
- Nadawca: Optimatren
- Treść:

  > Cześć, Anna,
  >
  > Twój wniosek o konto trenera nie został przyjęty.
  >
  > Możesz złożyć nowy za 14 dni. Do tego czasu możesz korzystać z aplikacji samodzielnie.

- Przycisk: **Otwórz aplikację**
- Stopka: „Dostajesz tę wiadomość, bo z Twojego konta złożono wniosek o konto trenera.”

## Okres próbny kończy się za 3 dni (do trenera)

- Do: trener · Kiedy: 3 dni przed końcem okresu próbnego.
- Temat: **Okres próbny kończy się za 3 dni**
- Nadawca: Optimatren
- Treść:

  > Cześć, Marek,
  >
  > Twój okres próbny kończy się za 3 dni.
  >
  > Po nim konto przechodzi na plan Free. Twoi podopieczni i ich dane zostają — limit Free dotyczy tylko dodawania nowych rzeczy ponad limit.

- Przycisk: **Zobacz swój plan**
- Stopka: „Dostajesz tę wiadomość, bo masz konto trenera w okresie próbnym.”

## Okres próbny się skończył (do trenera)

- Do: trener · Kiedy: W dniu końca okresu próbnego.
- Temat: **Okres próbny się skończył**
- Nadawca: Optimatren
- Treść:

  > Cześć, Marek,
  >
  > Twój okres próbny się skończył — konto działa teraz w planie Free.
  >
  > Twoi podopieczni, plany i historia treningów zostają bez zmian.

- Przycisk: **Zobacz swój plan**
- Stopka: „Dostajesz tę wiadomość, bo masz konto trenera.”

## Pakiet sesji się kończy (do trenera)

- Do: trener · Kiedy: W pakiecie podopiecznego zostały 2 sesje lub mniej.
- Temat: **Pakiet sesji się kończy**
- Nadawca: Optimatren
- Treść:

  > Cześć, Marek,
  >
  > Podopieczny: Anna.
  >
  > W pakiecie pozostało: 2 sesje.
  >
  > Możesz zaproponować nowy pakiet.

- Przycisk: **Zobacz podopiecznego**
- Stopka: „Dostajesz tę wiadomość, bo prowadzisz podopiecznego z pakietem sesji.”

## Nowe zgłoszenie (do trenera)

- Do: trener · Kiedy: Podopieczny wysłał zgłoszenie „Coś boli?”. Mail NIE zawiera szczegółów zdrowotnych.
- Temat: **Masz nowe zgłoszenie**
- Nadawca: Optimatren
- Treść:

  > Cześć, Marek,
  >
  > Masz nowe zgłoszenie od podopiecznego.
  >
  > Szczegóły zobaczysz w aplikacji.

- Przycisk: **Zobacz w aplikacji**
- Stopka: „Dostajesz tę wiadomość, bo prowadzisz podopiecznych.”

## Strażnik / administrator (do właściciela)

- Do: właściciel · Kiedy: Awaria usługi, powrót usługi, zdarzenie techniczne.
- Temat: **Optimatren: komunikat techniczny**
- Nadawca: Optimatren
- Treść:

  > Cześć,
  >
  > API nie odpowiada od 10 minut (sprawdzenia: 2).

- Przycisk: **Otwórz panel**
- Stopka: „Dostajesz tę wiadomość, bo jesteś właścicielem Optimatren.”

## Tekst z kodem trenera do skopiowania (SMS / Instagram)

> Cześć! Ćwiczymy razem w aplikacji Optimatren. Wpisz mój kod AB12CD34EF albo wejdź w ten link: https://…/join/AB12CD34EF
> — Marek Nowak

## Maile automatyczne

Okres próbny (3 dni przed końcem i w dniu końca) oraz pakiet sesji (zostały 2 sesje lub mniej) wysyła zadanie okresowe uruchamiane co 6 godzin przy API (`services/mail/jobs.ts`, wyłączenie: `MAIL_JOBS_ENABLED=0`). Każdy mail wychodzi najwyżej raz (tabela `mail_log`, migracja 0072); zaległe stare końce okresu próbnego (ponad 3 dni) nie są wysyłane.
