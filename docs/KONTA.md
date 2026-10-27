# Konta i role — audyt i projekt (25.10.2026)

**Status:** część 1 (audyt + łatka) wdrożona na gałęzi `feature/dom-kondycja`; część 2 (projekt) to tylko dokument — **budowa po akceptacji właściciela (STOP-5)**. Zmian kont ani pakietów poza łatką z pkt 1.3 nie wprowadzałem (STOP-7).

## 1. Audyt: jak dziś powstają konta

### 1.1 Konto trenera
- Logowanie: Clerk (Google / e-mail). Wiersz `trainers` powstaje wyłącznie w `POST /api/trainer/profile`, który panel wywołuje po zalogowaniu (`TrainerProfileGate`). `requireAuth` nikogo nie tworzy.
- Odmowa tylko dla konta już połączonego z klientem (403 `CLIENT_ACCOUNT`).
- **LUKA (przed łatką):** każdy zalogowany użytkownik Clerk, który otworzył panel trenera, automatycznie stawał się trenerem — i dostawał własny pusty panel, limity pakietu i możliwość zapraszania klientów. Przy publicznej rejestracji w becie oznaczało to, że każdy może „zostać trenerem” samodzielnie.

### 1.2 Konto podopiecznego
- Trener tworzy klienta (albo klient wypełnia ankietę z zaproszenia trenera → powstaje rekord `clients`). Konto Clerk łączy link aktywacyjny: `POST /api/client-invitations/:token/activate` (token jednorazowy, w bazie tylko skrót SHA-256, wygasa; klient wyznaczony wyłącznie przez token).
- Zabezpieczenia istniejące: konto Clerk już połączone z klientem nie może przejąć drugiego klienta; klient z `clerk_user_id` nie może być przejęty ponownie; **konto trenera nie może stać się kontem klienta** (403 `TRAINER_ACCOUNT`). Role są więc rozłączne w obie strony.
- Zaproszenia do ankiety (`survey_invites`): link trenera, jednorazowy; nie tworzy konta Clerk ani trenera.

### 1.3 Łatka wdrożona (ZGODA właściciela)
Najprostsza zamykająca luka: **rola trenera nadawana tylko przez administratora.**
- `POST /trainer/profile` tworzy nowy profil tylko, gdy: konto jest już trenerem (zwraca istniejący wiersz), albo jest na liście `TRAINER_CLERK_IDS` w `.env` (administrator dopisuje identyfikator Clerk po decyzji), albo jest administratorem aplikacji (`APP_ADMIN_CLERK_IDS`), albo ustawiono `TRAINER_SIGNUP_OPEN=1`. Domyślnie (zmienna pusta) **zamknięte** — fail-closed.
- Inni dostają 403 `TRAINER_NOT_APPROVED` i ekran „To konto nie ma jeszcze dostępu trenera — konta trenerów zakłada administrator”. Nie powstaje żaden wiersz.
- Istniejący trenerzy nie są dotknięci (mają już wiersz). Konto klienta nadal dostaje `CLIENT_ACCOUNT`.
- `TRAINER_SIGNUP_OPEN=1` jest tylko do developmentu i testu dymnego (`TRAINER_SIGNUP_OPEN=1 scripts/dev-gcp.sh`, potem zwykłe `scripts/dev-gcp.sh`); **nie ustawiać w becie.**
- Testy: `trainer-profile.integration.test.ts` (+4: obcy odmowa i brak wiersza, zatwierdzony i istniejący, admin / konto klienta, flaga otwarta kontra domyślne zamknięcie), wcześniejsze testy ról i izolacji (`multi-tenancy`, `clerk-auth`) zielone.
- **Co musi zrobić administrator:** dopisać identyfikator Clerk nowego trenera do `TRAINER_CLERK_IDS` w `.env` i zrestartować API. To rozwiązanie przejściowe — pełny proces (wniosek + akceptacja w panelu) opisuje pkt 2.4.

## 2. Projekt (tylko dokument)

### 2.1 Zasady
- **Jedno konto dla każdego.** Domyślnie konto **Solo** (zwykły użytkownik). W becie rejestracja Solo pokazuje „Wkrótce” (Solo budujemy później); działają konta trenerów i ich podopiecznych.
- **Konto z zaproszenia lub połączenia nigdy samo nie staje się trenerem.** Rola trenera powstaje wyłącznie przez akceptację wniosku (pkt 2.4) albo administratora.
- **Trener = konto Solo + narzędzia trenera.** Jedna osoba może trenować i prowadzić podopiecznych; przełącznik `[ Mój trening ] [ Podopieczni ]`.
- Regulamin: zakaz podszywania się (miejsce na tekst; treść dostarcza właściciel).

### 2.2 Połączenie z trenerem
- (a) **Zaproszenie od trenera (link)** — działa jak dziś: konto od razu połączone z trenerem.
- (b) **Kod trenera / link trenera** — osoba wpisuje kod lub klika link; trener dostaje **„Prośbę o dołączenie”** z przyciskami [Odrzuć] [Akceptuj]. Do akceptacji osoba nie widzi danych trenera poza jego nazwą, trener nie widzi danych osoby poza imieniem i adresem e-mail.
- **Podopieczny może się odłączyć**; historia treningów zostaje (rekordy sesji i serii są przy kliencie, nie przy trenerze — odłączenie zeruje tylko `trainer_id` połączenia, nic nie jest kasowane).

### 2.3 Zakładka „Ty” i wniosek o rolę trenera
- W zakładce „Ty” pozycja **„Prowadzę podopiecznych”** → formularz: imię i nazwisko, Instagram/strona (opcjonalnie), kilka słów o sobie → **[Wyślij wniosek]** → „Wniosek wysłany. Odpowiemy zwykle w ciągu 24 godzin.”
- Jeden aktywny wniosek na konto; po odrzuceniu można złożyć ponownie po 14 dniach (do decyzji).

### 2.4 Panel administratora (właściciel)
- Lista wniosków z przyciskami [Odrzuć] [Akceptuj]; akceptacja tworzy wiersz `trainers` (zastępuje ręczne `TRAINER_CLERK_IDS`) w jednej transakcji i zapisuje, kto i kiedy zaakceptował.
- Mail do właściciela o nowym wniosku, mail do wnioskującego po decyzji (SMTP jak przy zaproszeniach; bez płatnych usług).
- Przełącznik **„Akceptuj wnioski automatycznie”** (domyślnie wyłączony; włączany po becie).
- **Blokada konta** (administrator): konto zablokowane nie ma dostępu do panelu ani portalu; dane zostają.

### 2.5 Model danych (addytywnie)
- `accounts` — profil Solo powiązany z kontem Clerk: `id`, `clerk_user_id` (unikalny), `display_name`, `status` (`aktywne` / `zablokowane`), `created_at`. Istniejące `trainers` i `clients` zostają; `trainers.account_id` i `clients.account_id` (nullable) łączą rekordy z kontem.
- `trainer_applications` — `id`, `account_id`, `full_name`, `link`, `about`, `status` (`oczekuje` / `zaakceptowany` / `odrzucony`), `decided_by`, `decided_at`, `created_at`; częściowy indeks unikalny „jeden oczekujący wniosek na konto”.
- `trainer_join_requests` — `id`, `account_id`, `trainer_id`, `status` (`oczekuje` / `zaakceptowana` / `odrzucona` / `wycofana`), `created_at`, `decided_at`; unikalny oczekujący (konto, trener).
- `trainers.join_code` — krótki kod (unikalny), do odnowienia przez trenera.
- `app_settings` (klucz/wartość): `trainer_applications_auto_accept` = `false`.
- Migracje wyłącznie addytywne, `pg_dump` przed każdą; nic nie jest usuwane ani przemianowywane.

### 2.6 Ekrany
- Rejestracja: wybór „Solo — wkrótce” (nieaktywny) / „Mam zaproszenie od trenera” / „Jestem trenerem — złóż wniosek”.
- „Ty”: dane konta, połączenie z trenerem (kod, odłącz), „Prowadzę podopiecznych”, przełącznik `[ Mój trening ] [ Podopieczni ]` (po akceptacji wniosku).
- Trener: „Prośby o dołączenie” z [Odrzuć] [Akceptuj].
- Administrator: wnioski, ustawienie automatycznej akceptacji, blokady.

### 2.7 Testy izolacji (do napisania razem z budową)
Tabela rola × zasób: klient A1 nie widzi danych A2 ani B1; trener A nie widzi klientów trenera B; prośba o dołączenie widoczna tylko dla adresowanego trenera; odłączenie nie usuwa historii; zaakceptowanie wniosku nie daje dostępu do cudzych danych; zablokowane konto dostaje 403 w panelu i portalu; konto z zaproszenia nigdy nie dostaje roli trenera bez akceptacji; wyścig dwóch akceptacji tego samego wniosku daje jeden wiersz `trainers`.

## 3. Pytania do właściciela (z rekomendacją)
1. **Czy do czasu panelu wniosków wystarczy lista `TRAINER_CLERK_IDS` w `.env`?** Rekomendacja: tak na zamkniętą betę (kilku trenerów); panel wniosków budować przed otwarciem rejestracji.
2. **Czy konto Solo ma istnieć od razu w bazie (tabela `accounts`), mimo że ekran Solo to „Wkrótce”?** Rekomendacja: tak — jeden model konta od początku, bez późniejszej migracji danych.
3. **Kod trenera czy tylko link?** Rekomendacja: oba, ale kod ważny do odnowienia przez trenera i z limitem prób (ochrona przed zgadywaniem).
4. **Po odrzuceniu wniosku: ponowny wniosek po 14 dniach?** Rekomendacja: tak, z możliwością wcześniejszego ręcznego odblokowania przez administratora.
5. **Czy trener może odłączyć podopiecznego, czy tylko podopieczny trenera?** Rekomendacja: oba kierunki, z mailem do drugiej strony; historia treningów zostaje u podopiecznego, trener traci dostęp.

## Wdrożone 27.10.2026 (gałąź `feature/konta-link-kod`, blok 2)
- **Jedno konto, trener opcjonalny.** Osoba, która dołącza przez link/kod, dostaje w bazie od razu konto bez trenera (`clients.trainer_id` = NULL, czyli Solo). Rola trenera nadal tylko z listy dopuszczonych (`TRAINER_CLERK_IDS`) — konto z linku nigdy nie staje się trenerem, a konto trenera nie może prosić o dołączenie.
- **Link i kod.** Trener ma jeden kod (10 znaków, bez mylących 0/O/1/I/L), link to `…/client-landing/join/<kod>`. Ustawienia → „Dołączanie podopiecznych”: kopiowanie linku i kodu, „Nowy kod” (stary przestaje działać), lista próśb z [Odrzuć] / [Akceptuj]. Zaproszenia mailem działają jak dotąd.
- **Ochrona przed zgadywaniem.** 10 prób na 15 minut na konto i na adres IP (w pamięci procesu); błędny, stary i nieistniejący kod dają to samo 404.
- **Akceptacja.** Trener widzi dane osoby dopiero po [Akceptuj]; po akceptacji pozostałe oczekujące prośby tej osoby wygasają. Osoba połączona z trenerem nie dołączy do drugiego bez odłączenia.
- **Odłączenie.** Może każda strona (`POST /clients/:id/disconnect`, `POST /client-portal/disconnect`); mail do drugiej strony (jeśli skonfigurowano pocztę); `trainer_id` = NULL, historia treningów zostaje u osoby, trener traci dostęp. Zdarzenia zapisują się w `client_link_events`.
- **Ekran bez trenera.** W portalu osoba bez trenera widzi „Trening samodzielny — wkrótce” (bez martwych przycisków) i pole na kod trenera.
- **Ponowny wniosek o konto trenera (2e) — tylko model, panel po becie.** Odrzucony wniosek można ponowić po 14 dniach od odrzucenia. Model: tabela `trainer_applications` (clerk_user_id, status pending/accepted/rejected, created_at, decided_at, opcjonalna notka); reguła: nowy wniosek dozwolony, gdy brak wniosku `pending` i `decided_at` starsze niż 14 dni. Akceptacja nadaje rolę trenera (rekord `trainers`); `TRAINER_CLERK_IDS` zostaje jako lista awaryjna. Nie zbudowane w tej gałęzi (blok 6).
