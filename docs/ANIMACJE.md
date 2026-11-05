# Animacje ćwiczeń — system i pierwsze 8 do Twojej akceptacji (flaga `EXERCISE_ANIMATIONS_ENABLED`, **NIE włączona**)

## Zasada
Flagi **nie włączam nigdy sam**. Każda animacja ma status *szkic / do sprawdzenia / zatwierdzona* (kto i kiedy). **W aplikacji (portal) widać wyłącznie zatwierdzone** — API zwraca 404 dla pozostałych (test). Zrzut klatek wszystkich 8: `docs/screens/animacje/arkusz-klatek.png`.

## Jak to działa
- **Dane, nie obrazki:** sylwetka 2D z boku (goleń, udo, tułów, ramię, przedramię, głowa) poruszana **kątami stawów** w klatkach kluczowych (`lib/survey-config/src/animModel.ts`). Dwa tryby kotwicy: kostka (ćwiczenia stojące i leżące na plecach) i nadgarstek (pompki, deska). Kinematyka prosta liczy położenie punktów; rekwizyty (podłoga, skrzynia, hantla) to statyczne kształty.
- **Renderer:** jeden komponent `ExerciseAnimation` (SVG + `requestAnimationFrame`, bez bibliotek), pętla 2–3 s, partie pracujące w kolorze akcentu #C2410C. Przycisk **„Wstrzymaj/Odtwórz animację”** (44 px); **„ogranicz ruch”** = klatka statyczna bez przycisku.
- **Baza:** `exercise_animations` (migracja 0081, addytywna): `spec` (JSON, < 4 KB na ćwiczenie), `status`, uwaga, kto/kiedy zatwierdził.
- **Walidacja przy zapisie i zatwierdzeniu:** pętla bez skoku (pierwsza = ostatnia klatka), czasy rosnące, 1,5–4 s, nic pod podłogą ani poza kadrem. Błędne dane nie dają się zatwierdzić. Test kontaktu: w pompkach i desce dłoń/łokieć dotyka podłoża przez cały ruch.
- **Panel administratora → „Animacje”** (działa także przy wyłączonej fladze — oceniasz przed włączeniem): podgląd każdej obok opisu, wykonania, wskazówek i częstych błędów; [Zatwierdź] / [Do poprawy] (z uwagą, cofa zatwierdzenie); „Wstaw animacje z biblioteki” (idempotentne, sprawdza zgodność numeru i nazwy ćwiczenia).
- **Portal:** na ekranie serii, pod nazwą ćwiczenia (tylko zatwierdzone, tylko przy włączonej fladze).

## Pierwsze animacje (status: do sprawdzenia)
Pompki klasyczne (117) · Pompki na kolanach (118) · Plank na przedramionach (5, z delikatnym ruchem oddechu — to ćwiczenie izometryczne) · Glute bridge (105) · Przysiad do skrzyni z masą własnego ciała (90) · Wspięcia na palce obunóż (259) · Wyciskanie hantli nad głowę (4) · Martwy ciąg rumuński z hantlami (101).
**Nie zrobione z planowanych 10:** *Wykrok w tył* (96) i *Wspięcia na palce jednostronne* (195) — wymagają dwóch nóg, a model ma jedną; pokazanie ich jedną nogą byłoby błędne technicznie, więc ich nie robię. Następny krok: dodać drugą nogę do modelu (kolejna gałąź).
Uwaga techniczna: technikę (kolana w linii stóp, neutralne plecy, pełny zakres) **musisz ocenić Ty** — to rysunki szkieletowe, nie film; przy wątpliwości wybierz „Do poprawy”.

## Jak dodać kolejne ćwiczenie
1. Dopisz wpis w `lib/survey-config/src/animLibrary.ts` (`exerciseId`, nazwa zgodna z katalogiem, `foot()`/`hand()` z kątami bezwzględnymi, `props`). Pozy rozciągnięte (pompki) buduj `pushLoop`/`plankPose` (kinematyka odwrotna rąk).
2. Obejrzyj klatki (`gen.mts` w opisie testu → arkusz) i uruchom `scripts/test-api.sh src/__tests__/exercise-animations.integration.test.ts` (walidacja + kontakt z podłożem).
3. Panel administratora → Animacje → „Wstaw animacje z biblioteki” → oceń → „Zatwierdź”.

## Plan na top 50 (`docs/GRAFIKI-TOP50.csv`)
Kolejność wg częstości w planach: najpierw ćwiczenia jednostronnie zakotwiczone (przysiady i warianty, wyciskania stojąc, wiosłowania z gumą, mostek z marszem), potem wymagające dwóch nóg/leżenia (wykroki, dead bug, bird dog, dipy na ławce, wiosłowania w zwisie) po rozbudowie modelu o drugą kończynę i ławkę. Cel: 25 animacji w kolejnej turze, 50 do końca bety — każda zatwierdzana przez Ciebie.
