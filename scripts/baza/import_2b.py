#!/usr/bin/env python3
"""Składa docs/BAZA-IMPORT-2B.csv: odmiany z POMINIETE-POSORTOWANE.csv (nowa_decyzja = odmiana).
Własne opisy odmian: scripts/baza/odmiany_opisy_*.tsv; metadane (wzorzec, mięśnie, stawy, rola, bezpieczeństwo) dziedziczone z ćwiczenia głównego w bazie.
Wymaga DATABASE_URL (psql). Uruchomienie: set -a; . ./.env; set +a; python3 -I scripts/baza/import_2b.py"""
import csv, glob, os, subprocess, sys, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
URL = os.environ["DATABASE_URL"]
def q(sql):
    out = subprocess.run(["psql", URL, "-At", "-F", "\x1f", "-c", sql], capture_output=True, text=True, check=True).stdout
    return [l.split("\x1f") for l in out.split("\n") if l]
ex = {int(r[0]): r for r in q("select id,name,coalesce(difficulty_level,''),coalesce(role,''),coalesce(movement_pattern,''),main_muscle_group,coalesce(array_to_string(joint_stress_areas,', '),''),coalesce(learning_difficulty,2),coalesce(safety_notes,'') from exercises")}
byname = {r[1]: int(r[0]) for r in ex.values()}
mus = {}
for eid, name, prim in q("select a.exercise_id, m.name, a.is_primary from exercise_muscle_assignments a join specific_muscles m on m.id=a.specific_muscle_id order by a.is_primary desc, m.name"):
    mus.setdefault(int(eid), {"p": [], "s": []})["p" if prim == "t" else "s"].append(name)
src = {r["źródło_id"]: r for r in csv.DictReader(open(os.path.expanduser("~/POMINIETE-POSORTOWANE.csv"), encoding="utf-8-sig"), delimiter=";")}
txt = {}
for f in sorted(glob.glob(os.path.join(ROOT, "scripts/baza/odmiany_opisy_*.tsv"))):
    for line in open(f, encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) < 10: sys.exit(f"zła liczba kolumn: {p[:2]}")
        txt[p[0]] = p
EQ = {"Sztanga", "Hantle", "Kettlebell", "Maszyna", "Wyciąg", "Drążek", "Gumy oporowe", "Piłka", "Talerz obciążeniowy", "Poręcze", "Masa własnego ciała", "Piłka lekarska", "Ławka"}
HEAD = ["zrodlo_id", "nazwa_PL", "nazwa_EN", "poziom", "rola", "sprzęt", "wzorzec", "mięśnie", "mięśnie_główne", "mięśnie_pomocnicze", "stawy", "cele", "opis", "wskazówki", "typowe_błędy", "uwaga_bezpieczeństwa", "learningDifficulty", "suitableForNoActivity", "decyzja_trenera", "nie_duplikat", "odmiana_id", "chwyt", "pozycja", "jednostronne", "intensywnosc"]
out, err = [], []
for sid, r in src.items():
    if r["nowa_decyzja"] != "odmiana": continue
    if sid not in txt: err.append(f"brak opisu: {sid}"); continue
    t = txt[sid]
    m = re.match(r"^(\d+) ", r["ćwiczenie_główne"])
    if m: pid = int(m.group(1))
    else:
        nm = r["ćwiczenie_główne"].replace("[nowe] ", "").strip()
        pid = byname.get(nm)
        if pid is None: err.append(f"brak rodzica w bazie: {sid} -> {nm}"); continue
    if pid not in ex: err.append(f"rodzic {pid} nie istnieje: {sid}"); continue
    pe = ex[pid]
    level = pe[2] if t[2] == "-" else t[2]
    if level == "Brak aktywności fizycznej": level = "Początkujący"
    equip = r["sprzęt"] if t[3] == "-" else t[3]
    eqs = [e.strip() for e in equip.split(",") if e.strip()]
    if not eqs or any(e not in EQ for e in eqs): err.append(f"sprzęt?: {sid} '{equip}'"); continue
    pm = mus.get(pid, {"p": [], "s": []})
    ld = pe[7] if t[10].strip() in ("", "-") else t[10].strip()
    out.append({"zrodlo_id": sid, "nazwa_PL": t[1], "nazwa_EN": r["nazwa_EN"], "poziom": level, "rola": pe[3] or "pomocnicze", "sprzęt": ", ".join(eqs),
                "wzorzec": pe[4], "mięśnie": pe[5], "mięśnie_główne": ", ".join(pm["p"]), "mięśnie_pomocnicze": ", ".join(pm["s"]), "stawy": pe[6], "cele": "",
                "opis": t[7], "wskazówki": t[8], "typowe_błędy": t[9], "uwaga_bezpieczeństwa": pe[8], "learningDifficulty": ld, "suitableForNoActivity": "",
                "decyzja_trenera": "tak", "nie_duplikat": "", "odmiana_id": str(pid), "chwyt": t[4].replace("-", "") if t[4] == "-" else t[4],
                "pozycja": "" if t[5] == "-" else t[5], "jednostronne": "tak" if t[6] == "t" else "", "intensywnosc": ""})
for sid in txt:
    if sid not in src or src[sid]["nowa_decyzja"] != "odmiana": err.append(f"opis bez wiersza odmiany: {sid}")
with open(os.path.join(ROOT, "docs/BAZA-IMPORT-2B.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=HEAD, delimiter=";"); w.writeheader(); w.writerows(out)
print(len(out), "odmian ->", "docs/BAZA-IMPORT-2B.csv"); print("\n".join(err) or "bez błędów")
