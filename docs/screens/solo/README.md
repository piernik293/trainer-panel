# Prototyp: Solo i „Postępy” (do oceny, 28.10.2026)

Zrzuty 375 px, jasny i ciemny, styl B. Ekrany są **za flagami `SOLO_ENABLED` i `ACHIEVEMENTS_ENABLED` (obie wyłączone)**; przy obu wyłączonych portal wygląda i działa jak dziś (test `plan-shell-flags.test.tsx`). Trening (rozgrzewka, seria, „Coś boli?”, koniec) zostaje bez zmian wg zatwierdzonych makiet w `docs/screens/trening/`.

| Plik | Ekran |
|---|---|
| `1-solo-start-*` | Start Solo: powitanie i imię |
| `2-solo-po-starcie-*` | Po starcie (do czasu podłączenia wywiadu Solo: informacja zamiast martwego przycisku) |
| `3-dzis-*` | Dziś + dolny pasek Dziś · Plan · Postępy · Ty |
| `4-plan-*` | Plan |
| `5-postepy-*` | Postępy: regularność, mapa roku, rekordy, kroki, osiągnięcia |
| `6-postepy-puste-*` | Postępy bez historii |
| `7-ty-*`, `8-ty-solo-*` | Ty: z trenerem i bez trenera (kod, „Prowadzę podopiecznych”, ustawienia, dokumenty, wyloguj) |

Powtórzenie: `cd artifacts/client-landing && PORT=22391 BASE_PATH=/client-landing/ pnpm exec vite --host 127.0.0.1 --port 22391`, potem `node scripts/screens-solo.mjs`. Strona `/solo-preview` istnieje tylko w trybie DEV, działa poza Clerk i z zamockowanym API.
