# Regulamin w aplikacji i „Pobierz moje dane” (flaga `TERMS_ENABLED`, domyślnie wyłączona)

Treść: `docs/prawne/REGULAMIN-PROJEKT.md` (projekt 0.1 do weryfikacji prawnika; **znaczniki [ ], [DECYZJA], [DO USTALENIA Z PRAWNIKIEM] zostają**). Źródło dla aplikacji: `lib/survey-config/src/regulamin.ts` (wygenerowane z tego pliku). Strona `/legal/regulamin` (panel i portal) ma pasek „Wersja testowa — dokument w trakcie weryfikacji prawnej” — widoczna zawsze (strona publiczna), niezależnie od flagi.

## Przy włączonej fladze
- **Akceptacja:** po zalogowaniu (trener i portal) ekran „Zanim zaczniesz” z polem „Akceptuję Regulamin i Politykę prywatności” (linki). Zapis: konto, **wersja**, data (`terms_acceptances`, migracja 0076). Zmiana wersji (`REGULAMIN_VERSION`) = ekran „Zaktualizowaliśmy regulamin” dla wszystkich kont.
- **„Pobierz moje dane” (§14):** portal → „Ty”, panel → Ustawienia → „Moje dane”. Plik JSON: osoba Solo/podopieczny — profil, wywiady, plany, treningi z seriami, zgłoszenia bólu, kroki, osiągnięcia, przerwy; trener — własny profil, własne ćwiczenia i szablony (**bez danych podopiecznych**). Limit 3 na dobę; w dzienniku tylko fakt (konto, rola, czas), bez treści.
- **§8:** przy formularzu ćwiczenia link do Regulaminu §8 (wspólna biblioteka).

## Zmiana tekstu regulaminu
Edytuj `docs/prawne/REGULAMIN-PROJEKT.md`, przeprowadź generację sekcji do `regulamin.ts`, podnieś `REGULAMIN_VERSION`. Prawnik dostaje plik `docs/prawne/REGULAMIN-PROJEKT.md` z listą pytań na końcu.

## Włączenie
`TERMS_ENABLED=1` + restart — **dopiero po weryfikacji prawnej** albo świadomie na betę z pasekiem „Wersja testowa” (Twoja decyzja, `docs/DO-DECYZJI.md`).
