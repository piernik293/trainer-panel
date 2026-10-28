# Raport poranny — noc przed betą (28/29.10.2026)
Nic nie scalono do `main`, żadnej flagi nie włączono, nic nie usunięto; każdy blok na osobnej gałęzi (wypchniętej). Poprzedni raport: `docs/RAPORT-NOC-27-28.md`.
1. **Top 10 ćwiczeń** (symulacja 1000 profili): Skoki pogo, Glute bridge, Pompki klasyczne, Przeskoki boczne, Wiosłowanie pod sztangą, Przysiad do skrzyni, Wykrok w tył, Ściąganie gumy z góry, Wspięcia na palce, Rotacje rosyjskie. **Top 50 = 65,6% wszystkich wyborów, top 100 = 86,8%**; używane jest 250 z 599 ćwiczeń; żadne z top 50 nie ma zdjęcia ani wideo (`docs/GRAFIKI-TOP50.csv`).
2. **Opisy:** poprawiono **140** (top 100 + 20 rozgrzewek + 20 schłodzeń), bez żargonu i angielskich słów; zmiana tylko na bazie testowej, „było → jest” w `docs/OPISY-TOP100.csv`. Portal pokazuje w serii tylko instrukcję — proste rozszerzenie opisane w `docs/OPISY-TOP100.md`.
3. **Pierwsze minuty** (`docs/PIERWSZE-MINUTY.md`): trener → pierwszy aktywny plan **16 ekranów, 14 kliknięć, ok. 8–10 min** (bez rejestracji i czekania na klienta); klient → pierwszy skończony trening **48 ekranów, 55 kliknięć** (wywiad 24 pytania ok. 4–6 min, trening 20–45 min); wywiad wpisany przez trenera 8 ekranów (naprawiony ślepy zaułek).
4. **Pięć największych przeszkód:** (1) nowe konto trenera bez drogi do dostępu; (2) panel trenera loguje po angielsku; (3) limity Free (1 plan automatyczny/mies., 3 klientów) wychodzą dopiero w trakcie; (4) brak ekranu „co dalej” po aktywacji planu i po wywiadzie klienta; (5) plank jako „12–15 powtórzeń” w planie początkującego.
5. **Monitoring:** straż gotowa i przetestowana (mail po 2 błędach, max 1/godz., „działa znowu”) — **nie włączona w cronie**. **Kopie:** działa, ale **27.10 nie powstała (maszyna wyłączona)**; test przywrócenia OK. Dysk 39% (18 GB wolne), pamięć 5,6 GB dostępne — wystarczy na lata przy skali bety.
6. **Gotowe do scalenia** (kolejność w `docs/SCALANIE-PLAN.md`): `feature/kalistenika`, `feature/osiagniecia`, `feature/solo-ekrany` (zaktualizowane o `main`, testy zielone, flagi wyłączone), `feature/zglos-uwage` (flaga `FEEDBACK_ENABLED`), `ops/monitoring`, `qa/pierwsze-minuty`, `docs/*`; `feature/opisy-top100` dopiero po Twojej akceptacji CSV.
7. Strona dla trenerów: szkic w `docs/strona/` (adres zapisów wpisz w `OWNER_EMAIL`); stan przed betą: `docs/PRZED-BETA-STAN.md`.
## Do decyzji (`docs/DO-DECYZJI.md`)
- **N3-2** droga do dostępu dla nowego trenera (adres kontaktowy czy przycisk „Poproś o dostęp”); **N3-1** wywiad wpisywany przez trenera — zostawić poprawkę?
- **N3-3** dodać polskie napisy Clerk do panelu (zmiana pakietów); **N3-4** czasy dla ćwiczeń izometrycznych; **N3-5** limity Free w becie.
- **N4-1** włączyć „Zgłoś uwagę” na starcie (rekomendacja: tak); **N4-2/3** słowa zdrowotne i kontakt zwrotny.
- **N5-1** włączyć straż w cronie; **N5-2** co z wyłączaną maszyną (kopia „po starcie”, zewnętrzne sprawdzanie — nowa usługa, wymaga zgody).
- Akceptacja `docs/OPISY-TOP100.csv` (odblokowuje scalenie opisów).
