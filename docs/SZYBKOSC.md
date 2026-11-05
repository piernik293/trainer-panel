# Szybkość na telefonie (portal klienta) — pomiar 05.11.2026

## Jak mierzone
`scripts/qa/perf.mjs`: Chromium w profilu telefonu (375 px), sieć jak **Fast 3G** (1,6 Mb/s, opóźnienie 150 ms), procesor spowolniony **4×**, zimny start (bez pamięci podręcznej), zbudowany portal (`vite preview`).

## Wyniki (zimne wejście)
| Strona | Pierwsza treść (FCP) | Załadowane (load) | Pobrane |
|---|---|---|---|
| Start portalu `/` | ok. 2,6–2,7 s | ok. 2,3 s | 344 kB |
| Strona prawna | ok. 2,9 s | ok. 2,3 s | 307 kB |

Cel „Dziś” < 3 s: **pierwsza treść mieści się w celu**, ale to pomiar ekranu wejściowego, nie zalogowanego „Dziś”. **Nie zmierzono** zalogowanego „Dziś” (logowanie biletem Clerk przez throttling jest niestabilne w tym środowisku); do sprawdzenia na prawdziwym telefonie w liście „Test jako Bartek”.

## Rozmiar
- Główny pakiet JS: 971 kB → 948 kB (gzip ok. 286 kB). Rzadkie ścieżki (prawne, ankieta, zaproszenie, dołączenie, demo) są teraz **ładowane dopiero po wejściu** (leniwe: 1–3 kB gzip każda).
- Główną masę stanowią Clerk, React Query i ekrany Dziś/Plan/Trening/Postępy. Dalsze cięcie (podział ekranów Postępy/Ty/Solo na osobne paczki) da kilkadziesiąt kB gzip; **odłożone** — zysk mały wobec ryzyka, a ekrany te i tak są potrzebne po wejściu.
- Zdjęcia strony startowej: WebP 800/1600 px (24–66 kB), wybierane według szerokości.
- Maskotka to SVG + CSS (bez bibliotek), animacje nie działają w trakcie serii.

## Wniosek
Brak pilnej potrzeby dalszej optymalizacji przed betą. Do sprawdzenia po otwarciu na świat: zalogowane „Dziś” na realnym telefonie (Fast 3G w DevTools).
