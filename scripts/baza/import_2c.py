#!/usr/bin/env python3
"""Składa docs/BAZA-IMPORT-2C.csv z scripts/baza/grupy_2c.tsv (grupy G1–G9 z POMINIETE-POSORTOWANE.csv wskazane przez właściciela 25.10.2026).
Skróty mięśni rozwija do pełnych nazw; teksty bezpieczeństwa wg tagu. Uruchomienie: python3 -I scripts/baza/import_2c.py"""
import csv, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
M = {"PW": "Mięsień pośladkowy wielki", "PSM": "Mięsień pośladkowy średni", "KG": "Mięśnie kulszowo-goleniowe", "CU": "Mięsień czworogłowy uda", "PR": "Prostowniki grzbietu",
     "NP": "Mięsień naramienny (głowa przednia)", "NB": "Mięsień naramienny (głowa boczna)", "NT": "Mięsień naramienny (głowa tylna)", "RO": "Mięśnie stożka rotatorów",
     "TR": "Mięsień trójgłowy ramienia", "PS": "Mięsień piersiowy większy", "NG": "Mięsień najszerszy grzbietu", "CZ": "Mięsień czworoboczny grzbietu",
     "RW": "Mięśnie równoległoboczne", "OB": "Mięsień obły większy", "BR": "Mięsień brzuchaty łydki", "PL": "Mięsień płaszczkowaty", "PB": "Mięsień prosty brzucha",
     "SK": "Mięśnie skośne brzucha", "PQ": "Mięsień poprzeczny brzucha", "BI": "Mięsień dwugłowy ramienia", "RA": "Mięsień ramienny", "ZN": "Zginacze nadgarstka i palców", "PN": "Prostowniki nadgarstka i palców", "PRZ": "Mięśnie przywodziciele uda", "ODW": "Mięśnie odwodziciele uda"}
U = {"K": "Zacznij od lekkiego ciężaru i opanuj technikę; przy bólu przerwij ćwiczenie.",
     "J": "Ćwiczenie dynamiczne: rozgrzej się przed startem, ląduj miękko i zacznij od małej liczby powtórzeń. Przy bólu przerwij.",
     "O": "Ćwiczenie techniczne dla zaawansowanych — ucz się go pod okiem trenera, zaczynaj od lekkiego ciężaru. Przy bólu przerwij.",
     "T": "Ćwiczenie dynamiczne: rozgrzej się przed startem i zachowaj wolne miejsce wokół. Przy bólu przerwij.",
     "S": "Rolować spokojnie, bez nacisku na stawy i kości; przy ostrym bólu przerwij ćwiczenie.",
     "N": "Rozciągaj do wyraźnego, ale komfortowego napięcia. Przy bólu, kłuciu lub drętwieniu przerwij ćwiczenie.",
     "L": "Zacznij od lekkiego ciężaru; plecy proste przez cały ruch. Przy bólu przerwij ćwiczenie.",
     "C": "Ćwiczenie dla zaawansowanych — wykonuj dopiero po opanowaniu prostszych wersji. Przy bólu przerwij.",
     "D": "Wykonuj w komfortowym zakresie, w spokojnym tempie. Przy bólu przerwij ćwiczenie.",
     "W": "Łokcie nie wyżej niż do wysokości klatki; przy bólu barku przerwij ćwiczenie."}
GOALS = {"sport", "sprawność", "siła", "kondycja", "sylwetka", "redukcja"}
HEAD = ["zrodlo_id", "nazwa_PL", "nazwa_EN", "poziom", "rola", "sprzęt", "wzorzec", "mięśnie", "mięśnie_główne", "mięśnie_pomocnicze", "stawy", "cele", "opis", "wskazówki", "typowe_błędy", "uwaga_bezpieczeństwa", "learningDifficulty", "suitableForNoActivity", "decyzja_trenera", "nie_duplikat", "odmiana_id", "chwyt", "pozycja", "jednostronne", "intensywnosc", "czas_s", "na_strone"]
exp = lambda codes: ", ".join(M[c.strip()] for c in codes.split(",") if c.strip())
def split_primary(prim, sec):
    """Baza dopuszcza jeden mięsień główny na ćwiczenie (indeks ema_one_primary_per_exercise_idx): pierwszy zostaje, reszta jest pomocnicza."""
    pr = [c.strip() for c in prim.split(",") if c.strip()]
    return pr[0], ",".join(pr[1:] + [c.strip() for c in sec.split(",") if c.strip()])
SRC = sys.argv[1] if len(sys.argv) > 1 else "scripts/baza/grupy_2c.tsv"
DST = sys.argv[2] if len(sys.argv) > 2 else "docs/BAZA-IMPORT-2C.csv"
out = []
for line in open(os.path.join(ROOT, SRC), encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    if len(p) < 17: sys.exit(f"za mało kolumn: {p[0]} ({len(p)})")
    p[8], p[9] = split_primary(p[8], p[9])
    rest = p[17:]
    inten = next((x for x in rest if x in ("niska", "średnia", "wysoka")), "")
    parent = next((x for x in rest if x.startswith("=") or re.fullmatch(r"\d{2,}", x)), "")
    uni = "tak" if "t" in rest else ""
    dur = next((x[5:] for x in rest if x.startswith("czas=")), "")
    side = "tak" if "strona" in rest else ""
    pos = next((x for x in rest if x and x not in ("niska", "średnia", "wysoka", "t", "strona") and not x.startswith("czas=") and x != parent), "")
    out.append({"zrodlo_id": p[0], "nazwa_PL": p[1], "nazwa_EN": p[2], "poziom": p[3], "rola": p[4], "sprzęt": p[5], "wzorzec": p[6], "mięśnie": p[7],
                "mięśnie_główne": exp(p[8]), "mięśnie_pomocnicze": exp(p[9]), "stawy": p[10], "cele": p[11], "opis": p[12], "wskazówki": p[13], "typowe_błędy": p[14],
                "uwaga_bezpieczeństwa": U[p[15]], "learningDifficulty": p[16], "suitableForNoActivity": "", "decyzja_trenera": "tak", "nie_duplikat": "tak" if p[0] == "Supine_Two-Arm_Overhead_Throw" else "",
                "odmiana_id": parent, "chwyt": "", "pozycja": pos, "jednostronne": uni, "intensywnosc": inten, "czas_s": dur, "na_strone": side})
with open(os.path.join(ROOT, DST), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=HEAD, delimiter=";"); w.writeheader(); w.writerows(out)
print(len(out), "wierszy ->", DST)
