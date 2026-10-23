# Baner w mailu z zaproszeniem

| | |
|---|---|
| Plik | `artifacts/api-server/src/assets/email-banner.jpg` (1120×360 px = 2× od 560×180, JPEG, 25 KB; limit 80 KB) oraz ten sam obraz jako base64 w `assets/emailBanner.ts` (żeby build serwera nie wymagał kopiowania plików) |
| Źródło zdjęcia | zdjęcie powitalne z gałęzi `feature/hero` — Mohamed Fareed, Unsplash License, https://unsplash.com/photos/a-gym-with-a-row-of-exercise-machines-rbSNsoXk-3A (szczegóły w `docs/ASSETS.md` na tej gałęzi) |
| Obróbka | wycinek poziomy oryginału (31 % wysokości, pełna szerokość) → 1120×360 → duotone jak w hero (cienie `#1C1917`, światła `#C2410C`, jasność podniesiona ×1,25, bo pas jest ciemny) → JPEG jakość 0,82 (Chromium/Canvas, poza repozytorium) |
| Osadzenie | załącznik inline (`cid:optimatren-banner`, nodemailer), bez zdalnych obrazków |
| Alt | „Optimatren — trening z Twoim trenerem” |
| Bez obrazków | komórka z tłem `#1C1917` o wysokości 180 px, alt białym tekstem; treść i przycisk nie zależą od obrazu |
| Maskotka | w tym miejscu (komentarz w `renderInviteEmail`): podmień obraz, zachowaj rozmiar 560×180, CID i alt |
