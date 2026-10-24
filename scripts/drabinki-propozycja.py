#!/usr/bin/env python3
"""Propozycja drabinek progresji (docs/DRABINKI.md + docs/DRABINKI-DO-PRZEGLADU.csv). Czyta katalog tylko do odczytu ($DATABASE_URL).
Szczeble: BA = brak aktywności, P = początkujący, S = średniozaawansowany, Z = zaawansowany.
Wpis: (szczebel, id | None, uwaga[, kandydat z bazy zewnętrznej]) — None = „do uzupełnienia z bazy zewnętrznej”."""
import csv, os, subprocess, sys
LAD = {
 "Przysiad": [("BA", 90, "przysiad do skrzyni z masą ciała — start dla osób nieaktywnych"), ("BA", None, "przysiad do krzesła (pomocniczy, niższy próg)", "Chair Squat (wariant 90)"),
   ("P", None, "przysiad z masą własnego ciała", "Bodyweight Squat"), ("P", 88, "goblet — nauka wzorca z przeciwwagą"), ("P", 92, "boczna ścieżka maszynowa: suwnica 45°"),
   ("S", 3, "przysiad ze sztangą (przykład zatwierdzony)"), ("S", 93, "boczna ścieżka maszynowa: suwnica Smitha"), ("Z", 191, "przysiad ze sztangą z przodu"), ("Z", 225, "przysiad jednonóż (pistol)")],
 "Zawias biodrowy": [("BA", 105, "mostek biodrowy (glute bridge)"), ("P", 101, "martwy ciąg rumuński z hantlami"), ("P", 103, "alternatywa: martwy ciąg z kettlebell (suitable = true)"),
   ("S", 100, "martwy ciąg rumuński ze sztangą"), ("S", 102, "alternatywa: martwy ciąg z trap barem"), ("Z", 182, "martwy ciąg konwencjonalny"), ("Z", 192, "martwy ciąg sumo")],
 "Wykrok": [("BA", 260, "wejście na niskie podwyższenie z podparciem"), ("BA", 95, "przysiad wykroczny z podparciem"), ("P", None, "przysiad split bez podwyższenia", "Split Squats"),
   ("P", 96, "wykrok w tył"), ("S", 97, "wykroki chodzone"), ("Z", 94, "przysiad bułgarski")],
 "Pchanie poziome": [("BA", 322, "pompki ścienne (dziś rola „rozgrzewka” — do decyzji, czy ćwiczenie główne)"), ("BA", 115, "boczna ścieżka maszynowa: wyciskanie na maszynie siedząc"),
   ("P", 116, "pompki na podwyższeniu"), ("P", 118, "pompki na kolanach"), ("P", 117, "pompki klasyczne"), ("S", 170, "wyciskanie hantli leżąc"), ("S", 1, "wyciskanie sztangi leżąc (przykład zatwierdzony)"), ("Z", 171, "wyciskanie sztangi na ławce ujemnej"), ("Z", 220, "pompki na kółkach gimnastycznych")],
 "Pchanie pionowe": [("BA", 137, "wyciskanie na maszynie nad głowę"), ("P", 139, "wyciskanie hantli siedząc"), ("P", 4, "wyciskanie hantli nad głowę"), ("S", 138, "Arnold press"),
   ("Z", 186, "wyciskanie sztangą nad głowę"), ("Z", None, "wyciskanie kettlebell oburącz / landmine", "Two-Arm Kettlebell Military Press")],
 "Przyciąganie poziome": [("BA", 134, "wiosłowanie gumą oporową"), ("BA", 130, "wiosłowanie na maszynie"), ("P", 131, "wiosłowanie jednorącz hantlem"), ("P", 129, "wiosłowanie hantlami z podparciem klatki"),
   ("P", None, "wiosłowanie w zwisie (australijskie)", "Inverted Row"), ("S", 132, "wiosłowanie T-bar z podparciem klatki"), ("S", 180, "wiosłowanie sztangą w opadzie"), ("Z", None, "do uzupełnienia (np. wiosłowanie w zwisie z obciążeniem, renegade row)", "Alternating Renegade Row")],
 "Przyciąganie pionowe": [("BA", 123, "ściąganie drążka wyciągu górnego chwytem neutralnym"), ("BA", None, "łopatkowe podciągnięcia w zwisie", "Scapular Pull-Up"), ("P", 126, "podciąganie na maszynie wspomagającej"),
   ("P", None, "podciąganie z gumą wspomagającą", "Band Assisted Pull-Up (zamiennik)"), ("S", None, "podciąganie podchwytem (chin-up)", "Chin-Up"), ("Z", 127, "podciąganie chwytem neutralnym"), ("Z", 2, "podciąganie na drążku (przykład zatwierdzony)")],
 "Core i antyrotacja": [("BA", 159, "dead bug"), ("BA", 160, "bird dog"), ("P", 5, "plank"), ("P", 161, "plank boczny"), ("P", 162, "Pallof press (antyrotacja)"),
   ("S", 197, "hollow body hold"), ("S", None, "Pallof press z rotacją", "Pallof Press With Rotation (wariant 162)"), ("Z", 166, "ab wheel rollout")],
 "Łydki": [("BA", 259, "wspięcia na palce obunóż stojąc"), ("P", 195, "wspięcia na palce jednostronne stojąc"), ("S", 109, "wspięcia na palce stojąc z obciążeniem"), ("S", 110, "wspięcia na palce siedząc"),
   ("Z", None, "wspięcia jednonóż z obciążeniem", "Dumbbell Seated One-Leg Calf Raise")],
}
ids = sorted({s[1] for l in LAD.values() for s in l if s[1]})
out = subprocess.run(["psql", os.environ["DATABASE_URL"], "-At", "-F|", "-c",
  "select id,name,coalesce(difficulty_level,''),coalesce(learning_difficulty::text,''),coalesce(suitable_for_no_activity::text,''),coalesce(joint_stress,''),coalesce(role,'') from exercises where id in (%s)" % ",".join(map(str, ids))],
  capture_output=True, text=True, check=True).stdout.strip().splitlines()
db = {int(l.split("|")[0]): l.split("|") for l in out}
YN = {"true": "tak", "t": "tak", "false": "nie", "f": "nie", "": "brak"}
rows = []; md = []
for wz, steps in LAD.items():
    md += ["### " + wz, "", "| Szczebel | Ćwiczenie | Poziom (dziś) | Trudność uczenia | Dla nieaktywnych | Stawy | Uwaga |", "|---|---|---|---|---|---|---|"]
    for k, s in enumerate(steps, 1):
        sz, i, uw = s[0], s[1], s[2]; cand = s[3] if len(s) > 3 else ""
        if i:
            d = db[i]; md.append("| %s | **%s** (id %d) | %s | %s | %s | %s | %s |" % (sz, d[1], i, d[2], d[3], YN[d[4]], d[5], uw))
            rows.append([wz, k, sz, i, d[1], "istnieje", "", d[2], d[3], YN[d[4]], d[5], uw, ""])
        else:
            md.append("| %s | _do uzupełnienia z bazy zewnętrznej_: %s | — | — | — | — | %s |" % (sz, cand, uw))
            rows.append([wz, k, sz, "", "", "do uzupełnienia", cand, "", "", "", "", uw, ""])
    md.append("")
with open(os.path.join(sys.argv[1], "DRABINKI-DO-PRZEGLADU.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";"); w.writerow(["wzorzec", "kolejność", "szczebel", "id", "nazwa", "status", "kandydat_z_bazy", "poziom_dziś", "trudność_uczenia", "dla_nieaktywnych", "stawy", "uwaga", "decyzja_trenera"]); w.writerows(rows)
open(os.path.join(sys.argv[1], "DRABINKI-tabele.md.tmp"), "w", encoding="utf-8").write("\n".join(md))
print(len(rows), "szczebli")
