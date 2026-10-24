#!/usr/bin/env python3
"""Propozycja pola „przydatne do celu” (siła, sylwetka, redukcja, kondycja, sprawność, sport) dla naszych ćwiczeń. Tylko odczyt bazy.
Użycie: cele_nasze.py <wyjście.csv>"""
import csv, os, subprocess, sys
q = ("select id,name,coalesce(exercise_type,''),coalesce(role,''),array_to_string(equipment,','),coalesce(movement_pattern,''),"
     "coalesce(difficulty_level,''),array_to_string(training_goals,', ') from exercises where is_active order by id")
rows = [l.split("|") for l in subprocess.run(["psql", os.environ["DATABASE_URL"], "-At", "-F|", "-c", q], capture_output=True, text=True, check=True).stdout.strip().splitlines()]
BIG = ("Przysiad","Zawias biodrowy","Wykrok","Przyciąganie pionowe","Pchanie poziome","Pchanie pionowe","Przyciąganie poziome")
def cele(typ, rola, eq, wz, lvl):
    if rola == "rozciąganie" or wz == "Rozciąganie": return ["sprawność"]
    if rola == "rozgrzewka" or wz in ("Mobilizacja", "Aktywacja"): return ["sprawność"]
    g = []; comp = typ == "Złożone"; loaded = any(e in eq for e in ("Sztanga", "Maszyna", "Hantle", "Wyciąg"))
    if wz in ("Skok",) or "Skok" in wz: g += ["sport", "sprawność"]
    elif comp and loaded: g += ["siła", "sylwetka"]
    elif comp: g += ["sprawność", "kondycja"]
    else: g += ["sylwetka"]
    if comp and wz in BIG: g.append("redukcja")
    if wz in ("Stabilizacja tułowia", "Rotacja", "Lokomocja", "Anti-ekstensja", "Anti-rotacja"): g += ["sprawność", "sport"]
    if lvl == "Zaawansowany": g.append("sport")
    return list(dict.fromkeys(g))
with open(sys.argv[1], "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";"); w.writerow(["id", "nazwa", "cele_obecnie", "cele_propozycja"])
    for i, n, typ, rola, eq, wz, lvl, now in rows:
        w.writerow([i, n, now, ", ".join(cele(typ, rola, eq, wz, lvl))])
print(len(rows))
