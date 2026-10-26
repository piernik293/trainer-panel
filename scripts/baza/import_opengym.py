#!/usr/bin/env python3
"""
Generuje docs/BAZA-IMPORT-OPENGYM.csv (58 ćwiczeń: główne + odmiany) z listy kontrolnej ~/import-opengym-lista.csv.
Nazwy EN z listy służą TYLKO jako lista kontrolna (og_id w zrodlo_id). Opisy, wskazówki i błędy są własne (KATALOG-STANDARD.md),
bez języka medycznego. Import: import-paczka.ts --odmiany (wszystko niezweryfikowane, suitableForNoActivity = false).
Pominięte jako duplikaty istniejących: Burpees (#1536), Pajacyki (#1538), Krzesełko przy ścianie (#1537), Nordic curl (#1539),
Przeskoki łyżwiarza (= #258 Przeskoki boczne z nogi na nogę); wiersz OPCJONALNIE (wiosłowanie kajakowe) nie jest dodawany.
"""
import csv, sys

M = {  # skróty mięśni szczegółowych
 "PM": "Mięsień piersiowy większy", "PMN": "Mięsień piersiowy mniejszy", "LAT": "Mięsień najszerszy grzbietu",
 "TRAP": "Mięsień czworoboczny grzbietu", "RHOM": "Mięśnie równoległoboczne", "TERES": "Mięsień obły większy", "ERECT": "Prostowniki grzbietu",
 "DELF": "Mięsień naramienny (głowa przednia)", "DELS": "Mięsień naramienny (głowa boczna)", "DELR": "Mięsień naramienny (głowa tylna)",
 "ROT": "Mięśnie stożka rotatorów", "BIC": "Mięsień dwugłowy ramienia", "BRA": "Mięsień ramienny", "TRI": "Mięsień trójgłowy ramienia",
 "RA": "Mięsień prosty brzucha", "OBL": "Mięśnie skośne brzucha", "TA": "Mięsień poprzeczny brzucha",
 "GMAX": "Mięsień pośladkowy wielki", "GMED": "Mięsień pośladkowy średni", "QUAD": "Mięsień czworogłowy uda", "HAM": "Mięśnie kulszowo-goleniowe",
 "ADD": "Mięśnie przywodziciele uda", "ABD": "Mięśnie odwodziciele uda", "GAS": "Mięsień brzuchaty łydki", "SOL": "Mięsień płaszczkowaty",
 "TIB": "Mięsień piszczelowy przedni", "SA": "Mięsień zębaty przedni",
}
def mm(s): return ", ".join(M[x] for x in s.split()) if s else ""

BW, GUM, HAN, SZT, WYC, MASZ, LAWKA, DRAZ, PLM = "Masa własnego ciała", "Gumy oporowe", "Hantle", "Sztanga", "Wyciąg", "Maszyna", "Ławka", "Drążek", "Piłka lekarska"
P, S, Z = "Początkujący", "Średniozaawansowany", "Zaawansowany"
SAFE = "Wykonuj w komfortowym zakresie, w spokojnym tempie. Przy bólu przerwij ćwiczenie."

ROWS = []
def r(og, pl, en, lvl, role, eq, pat, grp, main, sec, joints, goals, opis, tips, mist, safe, ld,
      parent="", grip="", pos="", uni="", secs="", side=""):
    ROWS.append([f"OG_{og}", pl, en, lvl, role, eq, pat, grp, mm(main), mm(sec), joints, goals, opis, tips, mist, f"{safe} {SAFE}".strip(), str(ld),
                 "", "tak", "", parent, grip, pos, uni, "", secs, side])

# ───────────────────────── NOWE (główne i grupy odmian) ─────────────────────────
r("0974", "Ściąganie gumy oporowej z góry", "Band Pulldown", P, "główne", GUM, "Przyciąganie pionowe", "Plecy", "LAT", "BIC TERES RHOM", "Bark, Łokieć", "siła, sylwetka, kondycja",
  "Zaczep gumę wysoko nad głową, np. na drążku lub górnej krawędzi stabilnych drzwi. Usiądź lub uklęknij pod nią, chwyć końce szerzej niż barki i ściągaj łokcie w dół do boków klatki. Wróć powoli do wyprostowanych rąk.",
  "Łopatki ściągnij w dół, tułów prosto. Łatwiej: lżejsza guma lub siad bliżej zaczepu. Trudniej: mocniejsza guma i pauza 2 s na dole.",
  "Bujanie tułowiem, podciąganie barków do uszu, zbyt szybki powrót.", "Sprawdź, czy zaczep jest stabilny i guma nie jest uszkodzona.", 2)
r("0983", "Ściąganie gumy oporowej z góry jednorącz w klęku", "Band Kneeling One-Arm Pulldown", P, "główne", GUM, "Przyciąganie pionowe", "Plecy", "LAT", "BIC TERES RHOM", "Bark, Łokieć", "siła, sylwetka, sprawność",
  "Uklęknij pod wysoko zaczepioną gumą i chwyć ją jedną ręką. Ściągnij łokieć w dół do boku tułowia, nie skręcając barków, i wróć powoli. Wykonaj serię jedną ręką, potem drugą.",
  "Miednica i barki ustawione prosto. Łatwiej: siad na krześle. Trudniej: wolniejsze opuszczanie (3 s).", "Skręcanie tułowia, odchylanie się do tyłu, szarpanie gumy.",
  "Sprawdź, czy zaczep jest stabilny.", 2, parent="=OG_0974", grip="jednorącz", pos="w klęku", uni="tak")
r("1013", "Ściąganie gumy oporowej z góry podchwytem", "Band Underhand Pulldown", P, "główne", GUM, "Przyciąganie pionowe", "Plecy", "LAT", "BIC TERES BRA", "Bark, Łokieć", "siła, sylwetka",
  "Zaczep gumę wysoko, usiądź lub uklęknij pod nią i chwyć końce podchwytem na szerokość barków. Ściągnij łokcie w dół i do tyłu, a potem wróć powoli.",
  "Klatka lekko wysunięta, łokcie blisko tułowia. Łatwiej: lżejsza guma. Trudniej: pauza 2 s na dole.", "Unoszenie barków, odchylanie tułowia, niepełny ruch.",
  "Podchwyt mocniej angażuje biceps; zacznij od lżejszej gumy.", 2, parent="=OG_0974", grip="podchwyt")
r("3017", "Wiosłowanie Pendlaya", "Pendlay Row", S, "główne", SZT, "Przyciąganie poziome", "Plecy", "TRAP", "LAT RHOM ERECT BIC DELR", "Plecy — dół, Łokieć, Bark", "siła, sylwetka",
  "Sztanga leży na podłodze. Pochyl tułów do poziomu, plecy proste, chwyć sztangę nachwytem nieco szerzej niż barki i szybko, ale kontrolowanie przyciągnij ją do dolnej części klatki. Odłóż sztangę na podłogę i zacznij każde powtórzenie od zera.",
  "Tułów nieruchomo, kark w przedłużeniu pleców. Łatwiej: wiosłowanie hantlem jednorącz. Trudniej: lekka pauza przy klatce.",
  "Zaokrąglone plecy, odrywanie tułowia w górę, szarpanie sztangą.", "Zacznij od lekkiego ciężaru i nauczenia ustawienia pleców; w razie bólu dolnego odcinka pleców zrezygnuj z ćwiczenia.", 4)
r("3541", "Unoszenie Y leżąc na ławce skośnej", "Incline Y-Raise", S, "pomocnicze", f"{HAN}, {LAWKA}", "Odwodzenie", "Barki", "DELR", "TRAP RHOM", "Bark", "sylwetka, sprawność",
  "Połóż się brzuchem na ławce skośnej, ramiona zwisają w dół z lekkimi hantlami. Unieś ręce po skosie nad głowę, tworząc literę Y, i opuść powoli. Poruszaj samymi ramionami, bez bujania.",
  "Kciuki skierowane w górę, szyja rozluźniona. Łatwiej: bez ciężaru. Trudniej: pauza 2 s na górze.", "Zbyt duży ciężar, zadzieranie głowy, bujanie całym ciałem.",
  "Użyj bardzo lekkich hantli, to mały mięsień.", 3)
r("3542", "Unoszenie T leżąc na ławce skośnej", "Incline T-Raise", S, "pomocnicze", f"{HAN}, {LAWKA}", "Odwodzenie", "Barki", "DELR", "TRAP RHOM", "Bark", "sylwetka, sprawność",
  "Połóż się brzuchem na ławce skośnej, ramiona zwisają w dół z lekkimi hantlami. Unieś ręce prosto na boki do linii barków, tworząc literę T, i opuść powoli.",
  "Łopatki delikatnie ściągnięte do siebie. Łatwiej: bez ciężaru. Trudniej: pauza 2 s na górze.", "Zbyt duży ciężar, unoszenie barków do uszu, bujanie.",
  "Użyj bardzo lekkich hantli.", 3, parent="=OG_3541", pos="ramiona na boki (T)")
r("2300", "Wiosłowanie australijskie z ugiętymi nogami", "Inverted Row, Bent Knees", P, "główne", BW, "Przyciąganie poziome", "Plecy", "RHOM", "LAT TRAP BIC DELR", "Łokieć, Bark", "siła, sylwetka, sprawność",
  "Połóż się pod stabilnym drążkiem lub sztangą na podporach, chwyć ją nachwytem. Ugnij kolana, stopy zostaw na podłodze, ciało w linii od kolan do głowy. Przyciągnij klatkę do drążka i opuść się powoli.",
  "Biodra wysoko, łopatki do siebie. Łatwiej: wyżej ustawiony drążek. Trudniej: proste nogi (wiosłowanie australijskie).",
  "Opadające biodra, wysuwanie głowy, niepełny ruch.", "Użyj tylko stabilnego sprzętu, który udźwignie Twój ciężar.", 2, parent="1089", pos="nogi ugięte")
r("1346", "Rozciąganie najszerszego grzbietu w klęku", "Kneeling Lat Stretch", P, "rozciąganie", BW, "Rozciąganie", "Plecy", "LAT", "TERES", "Bark", "sprawność",
  "Uklęknij przed ławką lub krzesłem, połóż na nim przedramiona lub dłonie. Wypchnij biodra do tyłu i opuść klatkę w dół, aż poczujesz rozciąganie wzdłuż boków pleców. Zostań w pozycji, oddychając spokojnie.",
  "Plecy proste, oddech spokojny. Łatwiej: mniej opuszczona klatka. Trudniej: dłuższe utrzymanie.", "Wyginanie lędźwi, szarpanie, wstrzymywanie oddechu.", "Rozciągaj tylko do uczucia komfortowego napięcia.", 1, secs="30")
r("0573", "Wyprosty tułowia na maszynie", "Machine Back Extension", P, "pomocnicze", MASZ, "Zawias biodrowy", "Plecy", "ERECT", "GMAX HAM", "Plecy — dół", "sylwetka",
  "Usiądź na maszynie, ustaw podparcie na wysokości łopatek i zablokuj nogi. Wyprostuj tułów do pozycji pionowej, napinając mięśnie grzbietu, i wróć powoli.",
  "Ruch tylko w biodrach i plecach, głowa w przedłużeniu kręgosłupa. Łatwiej: lżejszy opór. Trudniej: pauza 1–2 s na górze.",
  "Przeprost w lędźwiach, szarpanie, zbyt duży ciężar.", "Nie przeprostowuj pleców na końcu ruchu; zacznij od małego oporu.", 2, parent="183", pos="na maszynie")
r("1254", "Wyciskanie gumy oporowej przed siebie", "Band Chest Press", P, "główne", GUM, "Pchanie poziome", "Klatka piersiowa", "PM", "TRI DELF", "Bark, Łokieć, Nadgarstek", "sylwetka, siła, kondycja",
  "Przeprowadź gumę za plecami pod pachami, chwyć końce i stań w lekkim wykroku. Wypchnij ręce prosto przed siebie i wróć powoli do ustawienia na wysokości klatki.",
  "Tułów stabilny, łokcie pod kątem ok. 45° do ciała. Łatwiej: lżejsza guma. Trudniej: mocniejsza guma lub pauza 1 s.", "Wysuwanie głowy, unoszenie barków, odchylanie się do tyłu.",
  "Upewnij się, że guma jest nieuszkodzona i dobrze leży na plecach.", 2)
r("3124", "Wyciskanie gumy oporowej siedząc", "Band Seated Chest Press", P, "główne", GUM, "Pchanie poziome", "Klatka piersiowa", "PM", "TRI DELF", "Bark, Łokieć, Nadgarstek", "sylwetka, siła",
  "Usiądź prosto na krześle lub ławce, gumę przeprowadź za plecami pod pachami. Wypchnij ręce przed siebie i wróć powoli. Oparte plecy ułatwiają utrzymanie pozycji.",
  "Plecy oparte, łopatki lekko ściągnięte. Łatwiej: lżejsza guma. Trudniej: mocniejsza guma.", "Garbienie się, szarpanie, unoszenie barków.",
  "Sprawdź stan gumy przed ćwiczeniem.", 2, parent="=OG_1254", pos="siedząc")
r("3021", "Pompki łopatkowe", "Scapular Push-Up", P, "pomocnicze", BW, "Aktywacja", "Klatka piersiowa", "SA", "PMN PM TRI DELF", "Nadgarstek, Bark", "sprawność, sylwetka",
  "Przyjmij pozycję podporu przodem na prostych rękach. Nie zginając łokci, opuść klatkę między łopatkami, a potem wypchnij się w górę, rozsuwając łopatki. To mały ruch samych łopatek.",
  "Ręce proste, ruch tylko w łopatkach. Łatwiej: na kolanach lub o ścianę. Trudniej: pompki plus.", "Zginanie łokci, opadające biodra, zbyt szybkie tempo.",
  "Ruch jest bardzo mały; skup się na kontroli, nie na liczbie powtórzeń.", 2)
r("3011", "Pompki łopatkowe na podwyższeniu", "Incline Scapular Push-Up", P, "pomocnicze", BW, "Aktywacja", "Klatka piersiowa", "SA", "PMN PM TRI DELF", "Nadgarstek, Bark", "sprawność, sylwetka",
  "Oprzyj dłonie na stabilnym podwyższeniu (ławka, stół). Ciało w jednej linii, ręce proste. Opuść klatkę między łopatkami i wypchnij ją w górę bez zginania łokci.",
  "Im wyższe podwyższenie, tym łatwiej. Łatwiej: wyższe podparcie. Trudniej: pompki łopatkowe na podłodze.", "Zginanie łokci, wygięte plecy, pośpiech.",
  "Wybierz stabilne podparcie, które się nie przesunie.", 1, parent="=OG_3021", pos="na podwyższeniu")
r("3145", "Pompki plus", "Push-Up Plus", S, "pomocnicze", BW, "Pchanie poziome", "Klatka piersiowa", "SA", "PM PMN TRI DELF", "Nadgarstek, Bark, Łokień".replace("Łokień", "Łokieć"), "sylwetka, sprawność",
  "W pozycji pompki opuść klatkę, wypchnij się w górę, a na końcu dodatkowo rozsuń łopatki, wypychając górną część pleców ku górze. Wróć do kolejnego powtórzenia.",
  "Ciało w jednej linii, na górze plecy lekko zaokrąglone przez rozsunięcie łopatek. Łatwiej: na kolanach. Trudniej: nogi na podwyższeniu.",
  "Opadające biodra, brak końcowego wypchnięcia, niepełny ruch.", "Zacznij od małej liczby powtórzeń.", 3)
r("1396", "Unoszenie palców stóp (tibialis raise)", "Tibialis Raise", P, "pomocnicze", BW, "Wspięcie na palce", "Łydki", "TIB", "", "Kolano", "sprawność",
  "Stań plecami przy ścianie, stopy 30–40 cm od niej, pięty na podłodze. Unieś palce stóp w górę jak najwyżej, ściągając stopy ku goleniom, i opuść powoli. Ćwiczy przód podudzia (piszczel).",
  "Pośladki i plecy przy ścianie, ruch tylko w stopach. Łatwiej: bliżej ściany. Trudniej: dalej od ściany lub jedną stopą.", "Odrywanie pleców od ściany, zginanie kolan, szybki ruch.",
  "Zrób kilka powtórzeń na rozgrzewkę i zwiększaj zakres stopniowo.", 1)
r("1490", "Wspięcia na palce na stopniu", "Step Calf Raise", P, "pomocnicze", BW, "Wspięcie na palce", "Łydki", "GAS", "SOL", "Kolano", "sylwetka, sprawność",
  "Stań na krawędzi stopnia przodostopiem, pięty w powietrzu, przytrzymaj się ściany lub poręczy. Opuść pięty poniżej stopnia, a potem unieś się jak najwyżej na palce. Pełny zakres ruchu.",
  "Ruch płynny, pauza u góry. Łatwiej: obunóż z podparciem. Trudniej: jedna noga.", "Zbyt szybki ruch, uginanie kolan, niepełny zakres.", "Trzymaj się stabilnego uchwytu, stopień nie może się ślizgać.", 1,
  parent="259", pos="na stopniu (pełny zakres)")
r("1022", "Face pull z gumą oporową", "Band Face Pull", P, "główne", GUM, "Przyciąganie poziome", "Barki", "DELR", "TRAP RHOM ROT", "Bark", "sprawność, sylwetka",
  "Zaczep gumę na wysokości twarzy. Chwyć końce i odsuń się, aż guma się napnie. Przyciągnij ręce do twarzy, rozchylając łokcie na boki, i wróć powoli.",
  "Łokcie na wysokości barków, klatka otwarta. Łatwiej: lżejsza guma. Trudniej: pauza 2 s przy twarzy.", "Odchylanie tułowia, unoszenie barków, ciągnięcie samymi rękami.",
  "Stabilny zaczep, lekka guma na początek.", 2, parent="136", grip="neutralny", pos="guma na wysokości twarzy")
r("1017", "Unoszenie Y z gumą oporową", "Band Y-Raise", P, "pomocnicze", GUM, "Odwodzenie", "Barki", "DELR", "TRAP RHOM", "Bark", "sprawność, sylwetka",
  "Stań na gumie, chwyć końce. Z lekko ugiętymi łokciami unieś ręce po skosie w górę, tworząc literę Y, i opuść powoli.",
  "Barki z dala od uszu, ruch płynny. Łatwiej: bez gumy. Trudniej: mocniejsza guma.", "Garbienie, bujanie tułowiem, zbyt mocna guma.", "Zacznij od lekkiej gumy.", 2)
r("3548", "Spacer z hantlem nad głową", "Overhead Dumbbell Carry", S, "pomocnicze", HAN, "Lokomocja", "Barki", "ROT", "DELF TRAP OBL TA", "Bark, Nadgarstek, Plecy — dół", "sprawność, sport",
  "Unieś jeden hantel prosto nad głowę i zablokuj łokieć. Idź powoli, utrzymując tułów prosto i hantel bezpośrednio nad barkiem. Po dystansie zmień rękę.",
  "Żebra nie wychodzą do przodu, brzuch napięty. Łatwiej: lżejszy hantel lub kettlebell przy klatce. Trudniej: dłuższy dystans.", "Wyginanie lędźwi, odchylanie tułowia, hantel przed głową.",
  "Zacznij od bardzo lekkiego hantla i krótkiego dystansu.", 3, uni="tak")
r("0860", "Kickback na wyciągu", "Cable Triceps Kickback", P, "pomocnicze", WYC, "Wyprost łokcia", "Triceps", "TRI", "DELR", "Łokieć", "sylwetka",
  "Ustaw wyciąg nisko, pochyl tułów, łokieć dociśnij do boku. Wyprostuj rękę do tyłu i wróć powoli do ugięcia 90°.",
  "Ruch tylko w łokciu, ramię nieruchomo. Łatwiej: lżejszy ciężar. Trudniej: pauza 1 s przy wyproście.", "Bujanie ramieniem, szarpanie, zbyt duży ciężar.", "", 2, parent="189", uni="tak", pos="na wyciągu")
r("2398", "Pompki wąskie na kolanach", "Close-Grip Knee Push-Up", P, "główne", BW, "Pchanie poziome", "Triceps", "TRI", "PM DELF", "Nadgarstek, Łokieć, Bark", "sylwetka, sprawność",
  "Przyjmij pozycję podporu na kolanach, dłonie pod barkami lub nieco węziej. Zegnij łokcie wzdłuż ciała i opuść klatkę, potem wypchnij się w górę. Ciało w jednej linii od kolan do głowy.",
  "Łokcie blisko tułowia, brzuch napięty. Łatwiej: o ścianę lub podwyższenie. Trudniej: pompki wąskim chwytem na stopach.", "Opadające biodra, rozstawione łokcie, niepełny ruch.",
  "Ułóż pod kolana miękką podkładkę.", 2, parent="117", grip="wąski", pos="na kolanach")
r("1004", "Przysiad z gumą oporową", "Band Squat", P, "główne", GUM, "Przysiad", "Mięśnie czworogłowe uda", "QUAD", "GMAX ADD ERECT", "Kolano, Biodro, Plecy — dół", "sylwetka, redukcja, kondycja",
  "Stań na środku gumy stopami na szerokość barków, końce gumy trzymaj na wysokości barków. Zejdź w przysiad, wypychając biodra do tyłu, i wstań, napinając pośladki.",
  "Kolana w linii stóp, plecy proste, pięty na podłodze. Łatwiej: płytszy przysiad. Trudniej: mocniejsza guma lub pauza na dole.", "Kolana uciekają do środka, odrywanie pięt, zaokrąglone plecy.",
  "Dobierz gumę tak, aby technika była czysta.", 2)
r("1009", "Martwy ciąg rumuński z gumą oporową", "Band Romanian Deadlift", P, "główne", GUM, "Zawias biodrowy", "Mięśnie dwugłowe uda", "HAM", "GMAX ERECT", "Plecy — dół, Biodro", "sylwetka, siła, kondycja",
  "Stań na gumie, końce trzymaj przy biodrach. Z lekko ugiętymi kolanami wypchnij biodra do tyłu, pochylając tułów z prostymi plecami, aż poczujesz rozciągnięcie z tyłu ud. Wróć, prostując biodra.",
  "Guma blisko nóg, plecy płaskie. Łatwiej: mniejszy zakres. Trudniej: mocniejsza guma lub jedna noga.", "Zaokrąglone plecy, uginanie kolan jak w przysiadzie, ruch z dolnych pleców.",
  "Przy bólu dolnego odcinka pleców zmniejsz zakres albo pomiń.", 3)
r("1410", "Wykrok w bok", "Lateral Lunge", P, "główne", f"{BW}, {HAN}", "Wykrok", "Pośladki", "GMAX", "QUAD ADD HAM", "Kolano, Biodro", "sprawność, sylwetka, kondycja",
  "Stań prosto, zrób duży krok w bok i zegnij kolano tej nogi, cofając biodra, druga noga zostaje prosta. Odepchnij się stopą i wróć do pozycji. Powtórz na drugą stronę.",
  "Stopa ugiętej nogi płasko, kolano nad stopą. Łatwiej: mniejszy krok. Trudniej: hantel przy klatce.", "Kolano ucieka do środka, pochylanie tułowia, odrywanie pięty.",
  "Zakres dobierz do mobilności bioder.", 3, uni="tak")
r("1757", "Martwy ciąg jednonóż z hantlami", "Single-Leg Dumbbell Deadlift", S, "główne", HAN, "Zawias biodrowy", "Pośladki", "GMAX", "HAM ERECT TA", "Plecy — dół, Biodro, Kolano", "sprawność, sport, sylwetka",
  "Trzymaj hantle, stań na jednej nodze z lekko ugiętym kolanem. Pochyl tułów, unosząc drugą nogę prosto do tyłu, aż tułów i noga będą mniej więcej poziomo. Wróć, prostując biodro.",
  "Biodra równo, plecy proste. Łatwiej: wersja z podparciem. Trudniej: cięższe hantle.", "Skręcanie miednicy, zaokrąglone plecy, utrata równowagi.",
  "Wykonuj wolno, w razie potrzeby przytrzymaj się stabilnego przedmiotu.", 3, parent="101", uni="tak", pos="na jednej nodze")
r("3561", "Mostek biodrowy z marszem", "Glute Bridge March", P, "pomocnicze", BW, "Zawias biodrowy", "Pośladki", "GMAX", "HAM TA OBL", "Plecy — dół", "sprawność, sylwetka",
  "Leż na plecach, kolana ugięte, unieś biodra w mostek. Utrzymując biodra wysoko i równo, unoś naprzemiennie kolana do klatki, jakbyś maszerował.",
  "Miednica nie opada na boki, pośladki napięte. Łatwiej: sam mostek. Trudniej: wolniejszy marsz z pauzą.", "Opadanie biodra przy unoszeniu nogi, wygięte lędźwie.", "", 2)
r("3006", "Odwodzenie bioder z gumą siedząc", "Band Seated Hip Abduction", P, "pomocnicze", GUM, "Odwodzenie", "Odwodziciele", "ABD", "GMED", "Biodro, Kolano", "sylwetka, sprawność",
  "Usiądź na krześle, gumę załóż nad kolanami. Rozsuń kolana na boki, pokonując opór gumy, i wróć powoli.",
  "Plecy proste, ruch tylko w biodrach. Łatwiej: lżejsza guma. Trudniej: pauza 2 s w rozsunięciu.", "Przechylanie tułowia, szybkie powroty, zbyt mocna guma.", "", 1)
r("1775", "Plank boczny z przywodzeniem nogi", "Side Plank Hip Adduction", S, "pomocnicze", BW, "Przywodzenie", "Przywodziciele", "ADD", "OBL GMED TA", "Bark, Nadgarstek", "sprawność, sylwetka",
  "Przyjmij plank boczny na przedramieniu, górną stopę oprzyj na ławce lub krześle. Dolną nogę unieś w górę do górnej i opuść powoli, trzymając ciało w linii.",
  "Biodra wysoko, tułów prosto. Łatwiej: plank boczny na podwyższeniu bez unoszenia nogi. Trudniej: wolniejsze tempo.", "Opadające biodra, skręt tułowia, szarpanie nogą.", "Przerwij przy odczuciu przeciążenia barku.", 4)
r("3643", "Przysiad kozacki", "Cossack Squat", S, "główne", BW, "Wykrok", "Pośladki", "GMAX", "QUAD ADD HAM", "Kolano, Biodro", "sprawność, sport",
  "Stań szeroko, stopy skierowane lekko na zewnątrz. Przenieś ciężar na jedną nogę, zginając kolano i siadając w bok, druga noga zostaje prosta z palcami w górze. Wróć i zmień stronę.",
  "Pięta ugiętej nogi na podłodze, plecy proste. Łatwiej: mniejsza głębokość z podparciem ręką. Trudniej: pauza na dole.", "Odrywanie pięty, kolano w środku, zapadanie się tułowia.",
  "Dobierz głębokość do mobilności bioder i kolan.", 4, uni="tak")
r("0003", "Rowerek (brzuszki rowerowe)", "Bicycle Crunch", P, "pomocnicze", BW, "Zgięcie tułowia", "Brzuch", "RA", "OBL", "Plecy — dół", "sylwetka, redukcja",
  "Leż na plecach, dłonie za głową, nogi uniesione. Naprzemiennie przyciągaj kolano do przeciwległego łokcia, prostując drugą nogę, w spokojnym tempie.",
  "Dolne plecy blisko podłogi. Łatwiej: stopy bliżej podłogi lub kolana ugięte. Trudniej: wolniejsze tempo.", "Ciągnięcie głowy za szyję, zbyt szybkie tempo, odrywanie lędźwi.", "Przy przeciążeniu szyi oprzyj głowę na podłodze.", 2)
r("1014", "Scyzoryki (V-up)", "V-Up", S, "pomocnicze", BW, "Zgięcie tułowia", "Brzuch", "RA", "OBL TA", "Plecy — dół", "sylwetka, sprawność",
  "Leż na plecach z rękami za głową. Jednocześnie unieś proste nogi i tułów, sięgając dłońmi do stóp, tak aby ciało utworzyło literę V. Opuść się powoli.",
  "Ruch kontrolowany, brzuch napięty. Łatwiej: z ugiętymi kolanami. Trudniej: wolniejszy powrót.", "Zamach, szarpanie, opadanie nóg na podłogę.", "Przy niekomfortowych lędźwiach zmniejsz zakres.", 3)
r("3016", "Curl-up (brzuszek McGilla)", "Curl-Up (McGill)", P, "pomocnicze", BW, "Stabilizacja tułowia", "Brzuch", "RA", "TA", "Plecy — dół", "sprawność, sylwetka",
  "Leż na plecach, jedna noga ugięta, druga wyprostowana, dłonie pod lędźwiami. Unieś lekko głowę i łopatki kilka centymetrów nad podłogę, bez zginania dolnych pleców, i opuść.",
  "Mały ruch, szyja w przedłużeniu pleców. Łatwiej: sam oddech z napięciem brzucha. Trudniej: pauza 5 s.", "Zginanie szyi, zbyt duży ruch, wstrzymywanie oddechu.", "Ruch ma być mały i spokojny.", 1, secs="")
r("3239", "Plank z dotykaniem barków na kolanach", "Kneeling Plank Shoulder Tap", P, "pomocnicze", BW, "Anti-rotacja", "Brzuch", "TA", "RA OBL DELF", "Nadgarstek, Bark", "sprawność, sylwetka",
  "Przyjmij podpór na kolanach, dłonie pod barkami. Naprzemiennie unoś rękę i dotykaj nią przeciwległego barku, utrzymując biodra nieruchomo.",
  "Biodra nie kołyszą się na boki. Łatwiej: szersza podstawa rąk. Trudniej: wersja na stopach (deska z dotknięciem barku).", "Kołysanie biodrami, opadające lędźwie, pośpiech.", "", 1, parent="1404", pos="na kolanach")
r("3147", "Przechylanie miednicy leżąc", "Pelvic Tilt", P, "rozgrzewka", BW, "Mobilizacja", "Brzuch", "TA", "RA GMAX", "Plecy — dół", "sprawność",
  "Leż na plecach, kolana ugięte, stopy na podłodze. Wydychając powietrze, przechyl miednicę tak, aby dolny odcinek pleców delikatnie przylegał do podłogi, a potem wróć do neutralnego ustawienia. Zrób 10–12 powolnych powtórzeń.",
  "Mały, płynny ruch, oddech równy. Łatwiej: mniejszy zakres. Trudniej: utrzymanie pozycji przez 3 s.", "Odpychanie się stopami, zbyt duży ruch, wstrzymywanie oddechu.", "", 1, secs="30")

# ───────────────────────── ODMIANY ─────────────────────────
r("0218", "Wiosłowanie siedząc na wyciągu szerokim chwytem", "Seated Cable Row, Wide Grip", P, "główne", WYC, "Przyciąganie poziome", "Plecy", "RHOM", "TRAP DELR BIC", "Plecy — dół, Łokieć, Bark", "siła, sylwetka",
  "Usiądź przy wyciągu dolnym, stopy na podporach, chwyć szeroki drążek. Przyciągnij drążek do dolnej części klatki, rozchylając łokcie na boki, i wróć powoli.",
  "Tułów prosto, łopatki do siebie. Łatwiej: chwyt neutralny (wiosłowanie siedząc). Trudniej: pauza przy klatce.", "Kołysanie tułowia, zaokrąglone plecy, szarpanie.", "", 2, parent="128", grip="szeroki")
r("2285", "Pullover na maszynie", "Machine Pullover", P, "pomocnicze", MASZ, "Przyciąganie pionowe", "Plecy", "LAT", "TERES PMN TRI", "Bark", "sylwetka",
  "Usiądź na maszynie, ustaw oparcie i uchwyty zgodnie z instrukcją. Prowadź łokcie w dół i do tyłu po łuku, aż zbliżą się do boków tułowia, i wróć powoli.",
  "Ruch płynny, tułów oparty. Łatwiej: mniejszy opór. Trudniej: pauza 1–2 s na dole.", "Szarpanie, podnoszenie barków, zbyt duży ciężar.", "Ustaw zakres tak, aby bark nie był zbyt rozciągnięty.", 2)
r("1429", "Podciąganie na drążku szerokim chwytem", "Wide-Grip Pull-Up", Z, "główne", DRAZ, "Przyciąganie pionowe", "Plecy", "LAT", "TERES BIC RHOM TRAP", "Bark, Łokieć", "siła, sylwetka",
  "Chwyć drążek nachwytem znacznie szerzej niż barki. Z pełnego zwisu podciągnij się, aż broda będzie nad drążkiem, i opuść się kontrolowanie.",
  "Łopatki w dół przed ruchem, klatka do drążka. Łatwiej: podciąganie wspomagane gumą lub chwyt węższy. Trudniej: pauza na górze.", "Kołysanie, niepełny zakres, unoszenie barków.",
  "Szeroki chwyt mocniej obciąża barki; stosuj tylko przy dobrej technice zwykłego podciągania.", 4, parent="2", grip="szeroki nachwyt")
r("3305", "Thruster ze sztangą", "Barbell Thruster", S, "główne", SZT, "Przysiad", "Mięśnie czworogłowe uda", "QUAD", "GMAX DELF TRI ERECT", "Kolano, Bark, Plecy — dół, Nadgarstek", "kondycja, sport, redukcja",
  "Sztangę trzymaj na przedniej stronie barków. Zejdź w przysiad, a wstając, jednym płynnym ruchem wypchnij sztangę nad głowę. Opuść ją z powrotem na barki i wejdź w kolejny przysiad.",
  "Łokcie wysoko w przysiadzie, napięty brzuch. Łatwiej: lekka sztanga lub hantle. Trudniej: cięższa sztanga, większe tempo.", "Zaokrąglone plecy, brak współpracy nóg i rąk, odchylanie się do tyłu.",
  "Zacznij od lekkiego ciężaru i opanuj osobno przysiad z przodu i wyciskanie nad głowę.", 4, parent="1341", pos="sztanga z przodu, wyciskanie nad głowę")
r("0356", "Unoszenie hantla bokiem jednorącz w odchyleniu", "Single-Arm Leaning Lateral Raise", P, "pomocnicze", HAN, "Odwodzenie", "Barki", "DELS", "ROT TRAP", "Bark", "sylwetka",
  "Złap się wolną ręką stabilnego słupka lub drążka i odchyl tułów w bok. Drugą ręką unieś hantel bokiem do linii barku i opuść powoli. Zmień stronę.",
  "Łokieć lekko ugięty, ruch kontrolowany. Łatwiej: lżejszy hantel. Trudniej: pauza 1 s u góry.", "Bujanie, zbyt duży ciężar, unoszenie barku do ucha.", "Użyj lekkich hantli.", 2,
  parent="140", pos="w odchyleniu z podparciem", uni="tak")
r("0864", "Rotacja zewnętrzna barku w odwiedzeniu 90° z hantlem", "Dumbbell 90° External Rotation", S, "pomocnicze", HAN, "Rotacja", "Barki", "ROT", "DELR", "Bark, Łokieć", "sprawność, sylwetka",
  "Stań lub usiądź, ramię unieś na bok do poziomu barku, łokieć zgięty 90° z hantlem w dłoni. Obracaj przedramię w górę, nie zmieniając pozycji łokcia, i wróć powoli.",
  "Łokieć na wysokości barku, ruch tylko w obrocie. Łatwiej: bez ciężaru lub z gumą. Trudniej: wolniejsze tempo.", "Opadający łokieć, zbyt duży ciężar, bujanie tułowiem.",
  "Użyj bardzo lekkiego hantla, to pozycja wymagająca dla barku.", 3, parent="211", pos="ramię odwiedzione 90°")
r("1399", "Dipy na podłodze", "Floor Dip", P, "pomocnicze", BW, "Wyprost łokcia", "Triceps", "TRI", "PM DELF", "Bark, Łokieć, Nadgarstek", "sylwetka, sprawność",
  "Usiądź na podłodze, kolana ugięte, dłonie za biodrami palcami do stóp. Unieś biodra, zegnij łokcie do tyłu i opuść się, po czym wypchnij się w górę.",
  "Łokcie wskazują do tyłu, barki nisko od uszu. Łatwiej: stopy bliżej bioder, mniejszy zakres. Trudniej: dipy na ławce.", "Rozchylanie łokci, zbyt głębokie opuszczanie, unoszenie barków.",
  "Opuszczaj się tylko tak głęboko, by bark pozostał komfortowy.", 2, parent="1093", pos="na podłodze")
r("0296", "Wyciskanie hantli wąsko (hantle złączone)", "Close-Grip Dumbbell Press", S, "główne", f"{HAN}, {LAWKA}", "Pchanie poziome", "Klatka piersiowa", "PM", "TRI DELF", "Bark, Łokieć, Nadgarstek", "sylwetka, siła",
  "Połóż się na ławce, hantle trzymaj złączone nad klatką, dłonie neutralnie. Opuść je do klatki z łokciami blisko ciała i wypchnij w górę, dociskając hantle do siebie.",
  "Hantle cały czas dociśnięte. Łatwiej: lżejsze hantle. Trudniej: pauza przy klatce.", "Rozchylanie łokci, odbijanie od klatki, wyginanie pleców.", "Poproś o asekurację przy ciężkich seriach.", 3, parent="170", grip="wąski, hantle złączone")
r("0330", "Prostowanie ramion z hantlami na ławce skośnej dodatniej", "Incline Dumbbell Triceps Extension", S, "pomocnicze", f"{HAN}, {LAWKA}", "Wyprost łokcia", "Triceps", "TRI", "DELF", "Łokieć, Bark", "sylwetka",
  "Połóż się na ławce skośnej dodatniej, hantle trzymaj nad klatką na wyprostowanych rękach. Zegnij łokcie, opuszczając hantle za głowę, i wyprostuj je z powrotem.",
  "Łokcie nieruchomo skierowane do góry. Łatwiej: lżejsze hantle lub jeden hantel. Trudniej: wolniejsze opuszczanie.", "Rozchylanie łokci, zbyt duży ciężar, unoszenie barków.", "Zacznij od lekkiego ciężaru.", 3,
  parent="1145", pos="ławka skośna dodatnia")
r("0980", "Odwodzenie nogi w tył z gumą w opadzie", "Band Bent-Over Hip Extension", P, "pomocnicze", GUM, "Zawias biodrowy", "Pośladki", "GMAX", "HAM ERECT", "Biodro, Plecy — dół", "sylwetka, sprawność",
  "Załóż gumę wokół stóp lub pod stopą stojącą. Pochyl tułów w opadzie z prostymi plecami, trzymając się podparcia, i wyprostuj jedną nogę do tyłu, napinając pośladek. Wróć powoli.",
  "Biodra równo, ruch tylko w stawie biodrowym. Łatwiej: bez gumy. Trudniej: mocniejsza guma.", "Wyginanie lędźwi, skręcanie miednicy, zamach.", "", 2, parent="194", pos="w opadzie", uni="tak")
r("1435", "Przysiad ze sztangą nisko na plecach (low bar)", "Low-Bar Back Squat", S, "główne", SZT, "Przysiad", "Mięśnie czworogłowe uda", "QUAD", "GMAX ADD ERECT HAM", "Kolano, Biodro, Plecy — dół", "siła, sylwetka, sport",
  "Ułóż sztangę nisko na grzbiecie, na tylnej części barków. Zejdź w przysiad, mocno cofając biodra, z tułowiem bardziej pochylonym niż w zwykłym przysiadzie, i wstań.",
  "Plecy napięte, kolana w linii stóp. Łatwiej: zwykły przysiad ze sztangą. Trudniej: pauza na dole.", "Zaokrąglone plecy, kolana do środka, zbyt płytki przysiad.",
  "Ćwicz w klatce z ogranicznikami lub z asekuracją.", 4, parent="3", pos="sztanga nisko na plecach")
r("0300", "Martwy ciąg z hantlami", "Dumbbell Deadlift", P, "główne", HAN, "Zawias biodrowy", "Plecy", "ERECT", "GMAX HAM QUAD TRAP", "Plecy — dół, Biodro, Kolano, Nadgarstek", "siła, sylwetka, redukcja",
  "Hantle ustaw przy stopach. Odchyl biodra do tyłu, chwyć hantle prostymi plecami i wstań, prostując biodra i kolana jednocześnie. Opuść je kontrolowanie na podłogę.",
  "Plecy płasko, hantle blisko nóg. Łatwiej: hantle na podwyższeniu. Trudniej: cięższe hantle.", "Zaokrąglone plecy, szarpanie z podłogi, odchylanie się do tyłu.",
  "Zacznij od lekkiego ciężaru i opanuj ustawienie pleców.", 3, parent="182", pos="hantle przy stopach")
r("0339", "Uginanie nóg leżąc z hantlem", "Lying Dumbbell Leg Curl", P, "pomocnicze", f"{HAN}, {LAWKA}", "Zgięcie kolana", "Mięśnie dwugłowe uda", "HAM", "GAS", "Kolano", "sylwetka",
  "Połóż się brzuchem na ławce, hantel zaciśnij między stopami. Zegnij kolana, przyciągając hantel ku pośladkom, i opuść powoli.",
  "Biodra przy ławce, ruch tylko w kolanach. Łatwiej: lżejszy hantel. Trudniej: wolniejsze opuszczanie.", "Odrywanie bioder, szarpanie, wypuszczanie hantla.", "Utrzymuj hantel pewnie między stopami.", 2,
  parent="107", pos="leżąc, hantel między stopami")
r("2805", "Martwy ciąg jednonóż z hantlem z podparciem", "Supported Single-Leg Dumbbell Deadlift", P, "główne", HAN, "Zawias biodrowy", "Pośladki", "GMAX", "HAM ERECT", "Plecy — dół, Biodro, Kolano", "sprawność, sylwetka",
  "Jedną ręką oprzyj się o ścianę lub stabilny przedmiot, w drugiej trzymaj lekki hantel. Pochyl tułów, unosząc drugą nogę do tyłu, i wróć. Podparcie pomaga w równowadze.",
  "Biodra równo, plecy proste. Łatwiej: bez hantla. Trudniej: wersja bez podparcia.", "Skręcanie miednicy, zaokrąglone plecy, opieranie się całym ciężarem na podparciu.",
  "Podparcie ma tylko pomagać w równowadze.", 2, parent="=OG_1757", pos="z podparciem", uni="tak")
r("3523", "Mostek biodrowy ze stopami na ławce", "Feet-Elevated Glute Bridge", P, "pomocnicze", f"{BW}, {LAWKA}", "Zawias biodrowy", "Pośladki", "GMAX", "HAM ERECT", "Plecy — dół, Biodro", "sylwetka, sprawność",
  "Połóż się na plecach, stopy oprzyj na ławce lub krześle, kolana ugięte. Unieś biodra, napinając pośladki, i opuść powoli. Większy zakres niż przy stopach na podłodze.",
  "Pośladki napięte na górze, żebra opuszczone. Łatwiej: stopy na podłodze. Trudniej: jedna noga.", "Przeprost w lędźwiach, odpychanie się palcami, szybkie tempo.", "", 2, parent="105", pos="stopy na ławce")
r("2611", "Wypychanie nóg na suwnicy jednonóż", "Single-Leg Press", S, "główne", MASZ, "Przysiad", "Mięśnie czworogłowe uda", "QUAD", "GMAX ADD", "Kolano, Biodro", "sylwetka, siła, sprawność",
  "Usiądź w suwnicy, jedną stopę ustaw na platformie, druga nie dotyka. Zegnij kolano do komfortowej głębokości i wypchnij platformę, nie blokując kolana. Zmień nogę.",
  "Biodra stabilnie na siedzisku, kolano w linii stopy. Łatwiej: obunóż. Trudniej: wolniejsze opuszczanie.", "Odrywanie bioder, blokowanie kolana, kolano do środka.", "Zacznij od mniejszego ciężaru niż w wersji obunóż.", 3,
  parent="92", pos="jedna noga", uni="tak")
r("0740", "Wypychanie nóg na suwnicy szeroką postawą", "Wide-Stance Leg Press", P, "główne", MASZ, "Przysiad", "Pośladki", "GMAX", "QUAD ADD", "Kolano, Biodro", "sylwetka, siła",
  "Usiądź w suwnicy, stopy ustaw szeroko, palce lekko na zewnątrz. Zegnij kolana, prowadząc je w linii stóp, i wypchnij platformę.",
  "Kolana nad stopami, biodra przy siedzisku. Łatwiej: mniej szeroka postawa. Trudniej: wolniejsze opuszczanie.", "Kolana do środka, odrywanie pośladków, blokowanie kolan.", "Nie blokuj kolan na górze.", 2,
  parent="92", pos="szeroka postawa")
r("3544", "Plank boczny na podwyższeniu", "Incline Side Plank", P, "pomocnicze", BW, "Stabilizacja tułowia", "Brzuch", "OBL", "TA GMED", "Bark, Nadgarstek", "sprawność, sylwetka",
  "Oprzyj przedramię lub dłoń na stabilnym podwyższeniu, ciało w linii skośnej, stopy złączone lub jedna przed drugą. Unieś biodra i utrzymaj pozycję.",
  "Biodra wysoko, ciało w jednej linii. Łatwiej: wyższe podwyższenie. Trudniej: plank boczny na podłodze.", "Opadające biodra, skręt tułowia, zapadanie w barku.", "Wybierz stabilne podwyższenie.", 1,
  parent="161", pos="na podwyższeniu", secs="20", side="tak")
r("3419", "L-sit na podłodze", "Floor L-Sit", Z, "pomocnicze", BW, "Stabilizacja tułowia", "Brzuch", "RA", "TA TRI DELF", "Nadgarstek, Bark, Plecy — dół", "sprawność, sylwetka",
  "Usiądź na podłodze z wyprostowanymi nogami, dłonie przy biodrach. Wypchnij się w górę na prostych rękach, unosząc pośladki i nogi nad podłogę. Utrzymaj pozycję.",
  "Ramiona wypchnięte, brzuch napięty. Łatwiej: nogi ugięte (kolana do klatki). Trudniej: dłuższe utrzymanie.", "Zapadnięte barki, uginanie rąk, wstrzymywanie oddechu.",
  "Tylko dla zaawansowanych; zacznij od krótkich prób.", 5, secs="15")
r("3420", "V-sit na podłodze", "Floor V-Sit", Z, "pomocnicze", BW, "Stabilizacja tułowia", "Brzuch", "RA", "TA QUAD DELF", "Plecy — dół, Nadgarstek", "sprawność, sylwetka",
  "Usiądź na podłodze, nogi proste, i jednocześnie unieś nogi i tułów tak, aby ciało utworzyło literę V, ręce wyciągnij wzdłuż nóg. Utrzymaj pozycję.",
  "Plecy proste, brzuch napięty. Łatwiej: kolana ugięte. Trudniej: dłuższe utrzymanie.", "Zaokrąglone plecy, opadające nogi, wstrzymywanie oddechu.",
  "Tylko dla zaawansowanych; przy niekomfortowych lędźwiach przerwij.", 5, secs="15")
r("0846", "Rotacje rosyjskie z obciążeniem", "Weighted Russian Twist", S, "pomocnicze", f"{HAN}, {PLM}", "Rotacja", "Brzuch", "OBL", "RA TA", "Plecy — dół", "sylwetka, sprawność",
  "Usiądź z lekko odchylonym tułowiem i uniesionymi stopami, obciążenie trzymaj przy klatce. Skręcaj tułów raz w jedną, raz w drugą stronę, przenosząc obciążenie obok biodra.",
  "Plecy proste, ruch z tułowia. Łatwiej: stopy na podłodze, bez ciężaru. Trudniej: cięższe obciążenie, stopy w górze.", "Machanie rękami bez skrętu tułowia, zaokrąglone plecy, szybkie tempo.",
  "Zacznij od małego ciężaru i spokojnego tempa.", 3, parent="198", pos="z obciążeniem")
r("0189", "Wiosłowanie jednorącz z wyciągu dolnego w opadzie", "Single-Arm Bent-Over Cable Row", S, "główne", WYC, "Przyciąganie poziome", "Plecy", "LAT", "RHOM BIC DELR", "Plecy — dół, Łokieć", "siła, sylwetka",
  "Ustaw wyciąg nisko, pochyl tułów z prostymi plecami i przyciągnij uchwyt jedną ręką do biodra. Wróć powoli, zachowując stałe napięcie liny. Zmień stronę.",
  "Tułów nieruchomo, łopatka pracuje przy każdym powtórzeniu. Łatwiej: wiosłowanie siedząc na wyciągu. Trudniej: pauza przy biodrze.", "Skręcanie tułowia, zaokrąglone plecy, szarpanie.",
  "Przy bólu dolnych pleców wybierz wersję siedzącą.", 3, parent="128", pos="w opadzie", uni="tak")
r("0579", "Ściąganie na maszynie z wolnym obciążeniem", "Plate-Loaded Lat Pulldown", P, "główne", MASZ, "Przyciąganie pionowe", "Plecy", "LAT", "TERES BIC RHOM", "Bark, Łokieć", "siła, sylwetka",
  "Usiądź w maszynie z talerzami, dociśnij uda pod wałkiem. Ściągnij uchwyty w dół do boków klatki i wróć powoli do wyprostowanych rąk.",
  "Klatka lekko wysunięta, łokcie w dół. Łatwiej: lżejsze obciążenie. Trudniej: pauza 1 s na dole.", "Odchylanie tułowia, szarpanie, niepełny zakres.", "", 2, parent="124", pos="maszyna z wolnym obciążeniem")
r("0768", "Przysiad bułgarski na suwnicy Smitha", "Smith Machine Split Squat", S, "główne", MASZ, "Wykrok", "Pośladki", "GMAX", "QUAD ADD", "Kolano, Biodro", "sylwetka, siła, sprawność",
  "Ustaw ławkę za sobą, tylną stopę oprzyj na niej, sztangę suwnicy trzymaj na barkach. Zegnij przednie kolano, schodząc w dół, i wróć, odpychając się przednią nogą. Zmień nogę.",
  "Przednia stopa daleko, tułów lekko pochylony. Łatwiej: wykrok w tył z masą ciała. Trudniej: pauza na dole.", "Zbyt krótki krok, kolano do środka, odrywanie pięty.", "Ustaw ogranicznik suwnicy na bezpiecznej wysokości.", 4,
  parent="94", pos="tylna stopa na ławce", uni="tak")

HEADER = "zrodlo_id;nazwa_PL;nazwa_EN;poziom;rola;sprzęt;wzorzec;mięśnie;mięśnie_główne;mięśnie_pomocnicze;stawy;cele;opis;wskazówki;typowe_błędy;uwaga_bezpieczeństwa;learningDifficulty;suitableForNoActivity;decyzja_trenera;nie_duplikat;odmiana_id;chwyt;pozycja;jednostronne;intensywnosc;czas_s;na_strone".split(";")
out = sys.argv[1] if len(sys.argv) > 1 else "docs/BAZA-IMPORT-OPENGYM.csv"
with open(out, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(HEADER)
    for row in ROWS:
        assert len(row) == len(HEADER), (row[0], len(row))
        w.writerow(row)
print(f"zapisano {len(ROWS)} wierszy → {out}")
