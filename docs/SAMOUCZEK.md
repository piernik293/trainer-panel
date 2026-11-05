# Samouczek trenera (flaga `ONBOARDING_ENABLED`, domyślnie wyłączona)

## Trener (panel → Pulpit)
Karta **„Pierwszy plan w 10 minut”**: 4 kroki — dodaj podopiecznego → wyślij link do wywiadu → ułóż plan generatorem → aktywuj i wyślij dostęp. Kroki **liczą się z danych konta** (klient, zaproszenie/wywiad, plan, aktywny plan), więc nie można ich „odhaczyć” bez zrobienia; **pominięcie** („Pomiń samouczek”) i powrót (menu konta → „Pokaż samouczek”) zapisują się na koncie. „Pokaż krok po kroku” = **spotlight**: przyciemnienie, wyróżniony krok, dymek „KROK X Z 4” z „Dalej ›” / „Pomiń samouczek”; Esc pomija, fokus na „Dalej”, przyciski 44 px.
**Klient przykładowy** („Anna (przykład)”, początkująca, ból prawego kolana, siłownia): tworzony na życzenie, `clients.is_example` — **nie liczy się do limitu klientów, statystyk ani pulpitu**, nie ma adresu e-mail (maile nie wychodzą), usuwany jednym kliknięciem. Pozwala przejść cały przepływ (wywiad jest gotowy; generator pominie ćwiczenia obciążające prawe kolano).
**Koniec:** „Pierwszy plan gotowy! Zajęło Ci to X min”, „Zaproś prawdziwego klienta”, 3 krótkie porady, „Usuń klienta przykładowego”.
Uwaga: istniejąca karta „Pierwsze kroki” na Pulpicie zostaje (to inna, starsza lista); przy włączonym samouczku pojawiają się obok siebie — do decyzji, czy starą wyłączyć.

## Podopieczny / Solo (portal → Dziś)
Przy pierwszym wejściu karta „Na początek — 3 rzeczy” (Dziś → stoper przerwy → „Coś boli?”), do zamknięcia, zapamiętana w przeglądarce.

## Testy
`onboarding.integration.test.ts` (flaga, kroki, pominięcie per konto, przykład nie liczy się do statystyk/pulpitu/limitu, usuwanie, izolacja), `tutorial.test.tsx`, `FirstTips.test.tsx`. Migracje 0079 (stan) i 0080 (`is_example`), addytywne.

## Włączenie
`ONBOARDING_ENABLED=1` + restart — Twoja zgoda (`docs/DO-DECYZJI.md`).
