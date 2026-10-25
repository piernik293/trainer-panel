#!/usr/bin/env python3
"""Łączy paczki 1–6 z decyzjami z BAZA-KANDYDACI.csv w jeden plik importu (docs/BAZA-IMPORT-2A.csv):
dodaje kolumny odmiana_id / chwyt / pozycja / jednostronne / intensywnosc i stosuje poprawki właściciela (blok 2D, 25.10.2026).
Uruchomienie: python3 -I scripts/baza/import_2a.py"""
import csv, glob, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs")
cand = {r[0]: r for r in csv.reader(open(f"{D}/BAZA-KANDYDACI.csv", encoding="utf-8-sig"), delimiter=";")}
rows, header = [], None
for f in sorted(glob.glob(f"{D}/BAZA-PACZKA-0*.csv")):
    rd = csv.DictReader(open(f, encoding="utf-8-sig"), delimiter=";")
    header = rd.fieldnames
    rows += list(rd)
# Rodzic odmiany: nasze_id z kandydatów, a tam gdzie powód wskazuje inne ćwiczenie niż kolumna — id z powodu (zgłoszone w raporcie).
PARENT_OVERRIDE = {"Cable_Lying_Triceps_Extension": "157", "Reverse_Cable_Curl": "204", "Smith_Machine_Close-Grip_Bench_Press": "158", "Ring_Dips": "175",
                   "Natural_Glute_Ham_Raise": "=Floor_Glute-Ham_Raise",
                   "Split_Squats": "95"}  # sprawdzone z 95: ten sam ruch, ale bez podparcia i wyższy poziom -> odmiana 95, nie nowe ćwiczenie
INTENSITY = {"Box_Skip": "niska", "Fast_Skipping": "niska", "Carioca_Quick_Step": "niska", "Double_Leg_Butt_Kick": "niska",
             "Star_Jump": "średnia", "Split_Jump": "średnia", "Freehand_Jump_Squat": "średnia"}
UNI = ("One-Arm", "Single", "One-Leg", "One-Legged", "Alternating", "Split", "Lunge", "Pistol")
out = []
for r in rows:
    k = r["zrodlo_id"]
    dec = cand[k][3]
    if dec not in ("nowe", "wariant"):
        print("pominięto (decyzja kandydata:", dec + "):", k); continue
    r = dict(r)
    r["decyzja_trenera"] = "tak"  # ZGODA właściciela (blok 2A): import poprawnych wierszy
    r["odmiana_id"] = PARENT_OVERRIDE.get(k, cand[k][4]) if (dec == "wariant" or k in PARENT_OVERRIDE) else ""
    r["chwyt"] = r["pozycja"] = ""
    r["jednostronne"] = "tak" if any(u in r["nazwa_EN"] for u in UNI) and k not in ("Split_Jump", "Split_Squats") else ""
    r["intensywnosc"] = INTENSITY.get(k, "")
    if r["intensywnosc"] and r["poziom"] in ("Brak aktywności fizycznej", "Początkujący"):
        r["poziom"] = "Średniozaawansowany"  # pliometria: nigdy BA/P
    if k == "Chin-Up": r["poziom"] = "Średniozaawansowany"
    if k == "Bench_Dips": r["stawy"] = "Łokieć, Bark"
    if k == "Split_Squats":
        r["mięśnie"] = "Mięśnie czworogłowe uda"
        r["mięśnie_główne"] = "Mięsień czworogłowy uda"
        r["mięśnie_pomocnicze"] = "Mięsień pośladkowy wielki, Mięśnie kulszowo-goleniowe, Mięsień brzuchaty łydki"
    # Sprawdzone ręcznie: zwykły przysiad z masą ciała to nie przysiad do skrzyni (90) — dopasowanie nazw było przypadkowe.
    r["nie_duplikat"] = "tak" if k == "Bodyweight_Squat" else ""
    out.append(r)
cols = header + ["nie_duplikat", "odmiana_id", "chwyt", "pozycja", "jednostronne", "intensywnosc"]
with open(f"{D}/BAZA-IMPORT-2A.csv", "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols, delimiter=";", extrasaction="ignore"); w.writeheader(); w.writerows(out)
print(len(out), "wierszy ->", "docs/BAZA-IMPORT-2A.csv")
