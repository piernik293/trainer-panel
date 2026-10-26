# Zasoby graficzne

## Zdjęcie powitalne (hero)

| | |
|---|---|
| Pliki | `lib/design-tokens/src/hero/hero-duotone-1600.webp` (1600 px, 64 KB), `hero-duotone-800.webp` (800 px, 24 KB); do porównań: `hero-dark-1600.webp`, `hero-dark-800.webp` (przyciemniony oryginał, nieużywane produkcyjnie) |
| Źródło | https://unsplash.com/photos/a-gym-with-a-row-of-exercise-machines-rbSNsoXk-3A |
| Autor | Mohamed Fareed |
| Licencja | Unsplash License (https://unsplash.com/license) — wolno używać komercyjnie, bez obowiązku podania autora (podajemy mimo to) |
| Pobrano | 23.10.2026, oryginał 3464×5202 JPEG (pobrany ręcznie przez użytkownika, serwer jest blokowany przez Unsplash) |
| Użycie | tylko `AppHero` (`@workspace/design-tokens/hero`): logowanie/rejestracja panelu i powitanie w wywiadzie klienta |

Obróbka (jednorazowo, poza repozytorium, Chromium/Canvas z Playwrighta; żadnego filtra CSS w aplikacji):
1. Skalowanie do 1600 i 800 px szerokości.
2. Duotone: jasność piksela (0,2126 R + 0,7152 G + 0,0722 B) mapowana liniowo z cieni `#1C1917` (grafit) na światła `#C2410C` (pomarańcz).
3. Wersja porównawcza: oryginał przyciemniony do 45 % jasności.
4. Eksport WebP, jakość 0,8.

Zdjęcie jest dekoracyjne (`alt=""`). Miejsce na maskotkę: prop `mascot` w `AppHero` (stany: idle, walk, lift, success, error/loading).

## Czcionka Manrope w raporcie PDF

| | |
|---|---|
| Plik | `artifacts/api-server/src/assets/manropeFonts.ts` (dwa statyczne warianty, 400 i 700, jako base64) |
| Źródło | Google Fonts, https://fonts.google.com/specimen/Manrope |
| Autor / licencja | The Manrope Project Authors; SIL Open Font License 1.1 (wolno osadzać w dokumentach i rozpowszechniać z aplikacją) |
| Pobrano | 26.10.2026 (API Google Fonts z parametrem `text`, TTF z podzbiorem: ASCII, polskie litery, typograficzna interpunkcja — ok. 27 KB każdy) |
| Użycie | tylko raport PDF (`services/monthlyReport.ts`); czcionka jest osadzana w pliku PDF |
