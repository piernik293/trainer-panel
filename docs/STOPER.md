# Stoper przerwy między seriami (nowy wygląd, `UI_V2_ENABLED`)

Po „Zapisz serię” startuje odliczanie przerwy z planu (zakres → środek; brak → 90 s z ciężarem, 60 s bez ciężaru i przy izometrii). Nie startuje po poprawie zapisanej serii, po pierwszym ćwiczeniu pary (superseria), po ostatniej serii treningu i po zgłoszeniu bólu. Przyciski: −15 s, +15 s, „Pomiń przerwę”, głośnik (wycisz/włącz, 44 px). Koniec: „Dawaj!” / „Jeszcze jedna!” / „Do roboty!” / „Jedziemy!” + „Seria 2 z 3”.

- **Czas z znacznika** (`endsAt`): po zgaszeniu i odblokowaniu ekranu licznik od razu pokazuje poprawną wartość (także po zdarzeniu `visibilitychange`).
- **Dźwięk**: Web Audio API, bez plików. Odblokowany pierwszym dotknięciem (zapis serii). Piknięcia T−3/2/1 s i energiczna melodia są **zaplanowane na zegarze audio**, nie na `setTimeout`.
- **Ustawienia** („Ty” → Stoper przerw): dźwięk i wibracja, domyślnie włączone; ten sam stan co głośnik na ekranie stopera (localStorage).
- **Offline**: tak (cała logika lokalna).
- Komponent `components/timer/RestTimer.tsx` jest wielokrotnego użytku (tryb „Prowadzę trening” trenera).

## Zablokowany ekran (opis, nie obietnica — nie testowano na fizycznych telefonach)
| | Android (Chrome) | iPhone (Safari / PWA) |
|---|---|---|
| Licznik po odblokowaniu | poprawny | poprawny |
| Dźwięk przy zablokowanym ekranie | zwykle gra (zaplanowany na zegarze audio), o ile system nie zamrozi strony | zwykle **nie gra** — iOS zawiesza audio przy zablokowanym ekranie |
| Wibracja | działa przy włączonym ekranie; przy zablokowanym — zwykle nie | **brak API wibracji** w Safari |
| Po odblokowaniu po końcu przerwy | pokazuje „Dawaj!”, wibracja raz | pokazuje „Dawaj!” (bez wibracji) |
Pewne alarmy przy zablokowanym ekranie wymagałyby powiadomień push (osobna decyzja, serwer + zgoda użytkownika).
