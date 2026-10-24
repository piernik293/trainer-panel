#!/usr/bin/env python3
"""Dopisuje paczkę ręcznych decyzji/tłumaczeń (stdin) do scripts/baza/paczki.tsv, kluczując po źródło_id.
Formaty linii (indeks = pozycja w nowe_ids.json):  i|Nazwa PL  |  i|P|powód  |  i|D|nid|pewność|powód  |  i|W|nid|pewność|Nazwa PL"""
import json, os, sys
here = os.path.dirname(__file__)
ids = json.load(open(os.path.join(here, "nowe_ids.json")))
out = open(os.path.join(here, "paczki.tsv"), "a", encoding="utf-8")
n = 0
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    p = line.split("|"); i = int(p[0]); sid = ids[i]
    if len(p) == 2: row = [sid, "nowe", "", "", "", p[1]]
    elif p[1] == "P": row = [sid, "pomiń", "", "", p[2], ""]
    elif p[1] == "D": row = [sid, "duplikat", p[2], p[3], p[4], ""]
    elif p[1] == "W": row = [sid, "wariant", p[2], p[3], "wariant (chwyt/ustawienie/sprzęt)", p[4]]
    else: raise SystemExit("zła linia: " + line)
    out.write("\t".join(row) + "\n"); n += 1
print("dopisano", n)
