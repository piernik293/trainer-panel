/**
 * Regulamin — PROJEKT 0.1 do weryfikacji prawnej (docs/prawne/REGULAMIN-PROJEKT.md jest źródłem; ten plik jest z niego wygenerowany).
 * Znaczniki [ ] zostają do uzupełnienia; nie usuwać. Zmiana treści = podniesienie REGULAMIN_VERSION (użytkownicy zobaczą „Zaktualizowaliśmy regulamin”).
 */
import type { LegalSection } from "./legal";

export const REGULAMIN_VERSION = "projekt-0.1";
export const REGULAMIN_SECTIONS: LegalSection[] = [
  {
    "heading": "§1. Postanowienia ogólne",
    "text": "1. Regulamin określa zasady korzystania z aplikacji Optimatren, dostępnej pod adresem [ADRES DOMENY] oraz jako aplikacja instalowana na ekranie telefonu.\n2. Usługodawcą jest [IMIĘ I NAZWISKO / NAZWA FIRMY], [ADRES], [NIP / REGON, jeśli dotyczy], e-mail: [ADRES KONTAKTOWY] (dalej: „Usługodawca”).\n3. Regulamin jest regulaminem świadczenia usług drogą elektroniczną. Przed założeniem konta Użytkownik musi go zaakceptować.\n4. Pojęcia:\n   • Aplikacja: Optimatren, w tym panel trenera, aplikacja dla ćwiczących i panel administratora.\n   • Użytkownik: osoba, która założyła konto.\n   • Solo: Użytkownik ćwiczący bez połączenia z Trenerem.\n   • Trener: Użytkownik, któremu Usługodawca przyznał dostęp do narzędzi trenerskich.\n   • Podopieczny: Użytkownik połączony z Trenerem.\n   • Plan: plan treningowy przygotowany przez Trenera, przez generator Aplikacji albo przez samego Użytkownika.\n   • Dane o zdrowiu: informacje o bólu, urazach, ograniczeniach i stanie zdrowia podane w wywiadzie lub zgłoszeniach."
  },
  {
    "heading": "§2. Charakter usługi — najważniejsze",
    "text": "1. Aplikacja nie jest wyrobem medycznym ani usługą medyczną. Nie stawia diagnoz, nie leczy i nie zastępuje lekarza ani fizjoterapeuty.\n2. Plany tworzone przez generator są automatyczną propozycją opartą na odpowiedziach z wywiadu. Generator stosuje zasady ostrożności (np. pomija ćwiczenia obciążające zgłoszony staw), ale nie zna pełnego stanu zdrowia Użytkownika.\n3. Użytkownik ćwiczy na własną odpowiedzialność. Przed rozpoczęciem treningu, przy chorobach, urazach, w ciąży albo po dłuższej przerwie powinien skonsultować się z lekarzem.\n4. Jeśli w trakcie ćwiczenia pojawi się ból, zawroty głowy lub inne niepokojące objawy, Użytkownik powinien przerwać trening i w razie potrzeby skontaktować się z lekarzem.\n5. Za plan przygotowany przez Trenera dla Podopiecznego odpowiada Trener (§5)."
  },
  {
    "heading": "§3. Wymagania techniczne",
    "text": "1. Do korzystania z Aplikacji potrzebne są: urządzenie z dostępem do internetu, aktualna przeglądarka (np. Chrome, Safari, Firefox, Edge) i adres e-mail lub konto Google.\n2. Część funkcji działa bez internetu; dane zapisują się po odzyskaniu połączenia."
  },
  {
    "heading": "§4. Konto",
    "text": "1. Założenie konta jest bezpłatne. Każde nowe konto jest kontem Solo.\n2. [DECYZJA] Konto może założyć osoba, która ukończyła 18 lat. (Alternatywa do omówienia z prawnikiem: od 16 lat; dane o zdrowiu wymagają wtedy szczególnej ostrożności.)\n3. Użytkownik podaje prawdziwe dane i chroni dostęp do konta.\n4. Nick nie może: naruszać praw innych osób, wprowadzać w błąd (np. podszywać się pod Trenera, Usługodawcę lub inną osobę), zawierać wulgaryzmów ani treści obraźliwych. Nick można zmienić raz na 30 dni.\n5. Użytkownik może w każdej chwili usunąć konto w ustawieniach lub prosząc o to e-mailem."
  },
  {
    "heading": "§5. Konto Trenera",
    "text": "1. Dostęp do narzędzi trenerskich przyznaje Usługodawca na wniosek złożony w Aplikacji. Usługodawca może odmówić bez podania przyczyny; ponowny wniosek można złożyć po 14 dniach.\n2. Trener oświadcza, że ma kwalifikacje i doświadczenie odpowiednie do prowadzenia treningów oraz że prowadzi działalność zgodnie z prawem.\n3. Trener:\n   • odpowiada za plany, które przygotowuje, zmienia lub zatwierdza dla Podopiecznych, także wygenerowane przez generator;\n   • przed wpisaniem danych Podopiecznego (np. wywiadu wypełnianego za klienta) uzyskuje jego zgodę, w tym zgodę na przetwarzanie danych o zdrowiu;\n   • wykorzystuje dane Podopiecznych wyłącznie do prowadzenia ich treningów i zachowuje je w poufności;\n   • [DO USTALENIA Z PRAWNIKIEM] relację w zakresie danych osobowych Podopiecznych (np. czy Trener jest administratorem, a Usługodawca podmiotem przetwarzającym; ewentualna umowa powierzenia).\n4. Trener nie może wykorzystywać Aplikacji do wysyłania reklam, spamu ani kontaktu z osobami, które się z nim nie połączyły."
  },
  {
    "heading": "§6. Połączenie Trenera i Podopiecznego",
    "text": "1. Połączenie następuje przez link lub kod Trenera i wymaga akceptacji Trenera.\n2. Przy połączeniu Użytkownik Solo decyduje, czy udostępnić Trenerowi wywiad i historię treningów. Bez tej zgody Trener widzi tylko imię i dane podane po połączeniu.\n3. Każda strona może zakończyć połączenie w dowolnym momencie. Po odłączeniu Trener traci dostęp do danych Podopiecznego, a historia treningów zostaje u Podopiecznego."
  },
  {
    "heading": "§7. Plany i opłaty",
    "text": "1. Korzystanie z Aplikacji jako Solo i jako Podopieczny jest bezpłatne.\n2. Trener może korzystać z planu bezpłatnego (Free) z ograniczeniami opisanymi w cenniku lub z planu płatnego (Pro).\n3. Nowy Trener otrzymuje 14 dni planu Pro za darmo (okres próbny). Po jego zakończeniu konto przechodzi na plan Free, jeśli Trener nie wybierze planu Pro. Dane nigdy nie są usuwane ani blokowane z powodu zakończenia okresu próbnego.\n4. Akcje promocyjne (np. „Złote Byczki”) mają własne warunki, ogłaszane w Aplikacji; obowiązują przez wskazany czas i w ograniczonej liczbie miejsc.\n5. [PO BECIE] Ceny, sposób płatności, faktury i zasady odnowienia abonamentu zostaną opisane w cenniku. O zmianie ceny Usługodawca informuje co najmniej 30 dni wcześniej; zmiana nie dotyczy okresu już opłaconego."
  },
  {
    "heading": "§8. Biblioteka ćwiczeń i treści",
    "text": "1. Opisy, nazwy, grafiki i animacje ćwiczeń w Aplikacji należą do Usługodawcy lub są używane na podstawie licencji. Nie wolno ich kopiować poza Aplikację bez zgody.\n2. Trener może dodawać własne ćwiczenia do swojej prywatnej biblioteki. Widzi je tylko on i jego Podopieczni.\n3. Dodając własne ćwiczenie, Trener może zaznaczyć zgodę na to, aby Usługodawca dodał je (po weryfikacji i ewentualnej edycji) do wspólnej biblioteki dostępnej dla wszystkich. Zgoda jest dobrowolna, domyślnie niezaznaczona; Trener udziela wtedy nieodpłatnej, niewyłącznej licencji na korzystanie z tego opisu w Aplikacji. [DECYZJA] czy podawać autora przy ćwiczeniu.\n4. Trener odpowiada za to, że dodawane treści (opisy, zdjęcia, linki) nie naruszają praw innych osób."
  },
  {
    "heading": "§9. Treści Użytkowników",
    "text": "1. Użytkownik odpowiada za treści, które dodaje (nick, notatki, uwagi, zgłoszenia).\n2. Zakazane są treści bezprawne, obraźliwe, dyskryminujące, wprowadzające w błąd oraz reklamy.\n3. Usługodawca może usunąć treść naruszającą Regulamin i poinformować o tym Użytkownika.\n4. Grafiki do udostępniania (story) Użytkownik publikuje poza Aplikacją z własnej woli; nie zawierają danych o zdrowiu."
  },
  {
    "heading": "§10. Zakazane działania",
    "text": "Zabronione jest w szczególności: próby nieuprawnionego dostępu do cudzych danych lub kont, obciążanie Aplikacji automatycznymi zapytaniami, omijanie limitów i zabezpieczeń, odsprzedawanie dostępu, podszywanie się pod inne osoby."
  },
  {
    "heading": "§11. Odpowiedzialność",
    "text": "1. Usługodawca dokłada starań, aby Aplikacja działała bez przerw i bezpiecznie, i robi codzienne kopie danych. Możliwe są przerwy techniczne, o dłuższych Usługodawca informuje z wyprzedzeniem, jeśli to możliwe.\n2. [DO USTALENIA Z PRAWNIKIEM] zakres wyłączenia odpowiedzialności, w szczególności za skutki treningów, za plany Trenerów i za przerwy w działaniu — z zachowaniem praw konsumenta, których nie można wyłączyć."
  },
  {
    "heading": "§12. Reklamacje",
    "text": "1. Reklamację można złożyć e-mailem na [ADRES KONTAKTOWY] lub przez „Zgłoś uwagę” w Aplikacji.\n2. Usługodawca odpowiada w ciągu 14 dni."
  },
  {
    "heading": "§13. Prawa konsumenta",
    "text": "1. Konsument może odstąpić od umowy zawartej na odległość w ciągu 14 dni bez podania przyczyny. [DO USTALENIA Z PRAWNIKIEM] zasady dla usług cyfrowych rozpoczętych przed upływem tego terminu i dla płatnych planów.\n2. Postanowienia Regulaminu nie ograniczają praw konsumenta wynikających z przepisów."
  },
  {
    "heading": "§14. Zakończenie korzystania i usunięcie konta",
    "text": "1. Użytkownik może usunąć konto w każdej chwili. Przed usunięciem może pobrać swoje dane. [DO ZROBIENIA W APLIKACJI] eksport danych.\n2. Usługodawca może zablokować lub usunąć konto w razie poważnego lub powtarzającego się naruszenia Regulaminu, po wcześniejszym wezwaniu do zaprzestania naruszeń (chyba że naruszenie jest rażące)."
  },
  {
    "heading": "§15. Dane osobowe",
    "text": "1. Zasady przetwarzania danych osobowych opisuje Polityka prywatności.\n2. Dane o zdrowiu przetwarzane są wyłącznie na podstawie wyraźnej zgody, którą można wycofać w ustawieniach. Bez zgody Aplikacja działa, ale bez pytań o zdrowie i z najostrożniejszymi ustawieniami.\n3. Administrator Aplikacji (Usługodawca) domyślnie nie widzi danych o zdrowiu Użytkowników; dostęp szczegółowy jest możliwy wyłącznie w uzasadnionych przypadkach (np. błąd techniczny) i jest rejestrowany."
  },
  {
    "heading": "§16. Wersja testowa (beta)",
    "text": "W okresie testów funkcje mogą się zmieniać, a w działaniu mogą wystąpić błędy. Użytkownicy wersji testowej są o tym informowani; ich uwagi pomagają rozwijać Aplikację."
  },
  {
    "heading": "§17. Zmiany Regulaminu",
    "text": "O zmianach Usługodawca informuje e-mailem lub w Aplikacji co najmniej 14 dni przed ich wejściem w życie. Użytkownik, który się nie zgadza, może usunąć konto."
  },
  {
    "heading": "§18. Postanowienia końcowe",
    "text": "1. Regulamin podlega prawu polskiemu.\n2. Spory z konsumentami rozstrzyga sąd właściwy według przepisów ogólnych; konsument może skorzystać z pozasądowych sposobów rozwiązywania sporów (np. rzecznik konsumentów).\n3. Regulamin obowiązuje od [DATA]."
  }
];
