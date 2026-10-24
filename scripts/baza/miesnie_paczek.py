"""Dopisuje do paczek docs/BAZA-PACZKA-0N.csv kolumny mięśnie_główne i mięśnie_pomocnicze
(nasze 28 mięśni szczegółowych) na podstawie primaryMuscles / secondaryMuscles z free-exercise-db.
Tabela mapowania: docs/IMPORT-LOG.md. Idempotentne: istniejące kolumny są nadpisywane wartością z mapowania
tylko gdy są puste (ręczne poprawki trenera zostają).

Użycie: python3 -I scripts/baza/miesnie_paczek.py ~/free-exercise-db-source/dist/exercises.json docs/BAZA-PACZKA-0*.csv
"""
import csv
import io
import json
import re
import sys

# Nazwy jak w tabeli specific_muscles (catalogueSeed.ts).
M = {
    1: "Mięsień piersiowy większy", 3: "Mięsień najszerszy grzbietu", 4: "Mięsień czworoboczny grzbietu",
    5: "Mięśnie równoległoboczne", 7: "Prostowniki grzbietu", 8: "Mięsień naramienny (głowa przednia)",
    9: "Mięsień naramienny (głowa boczna)", 10: "Mięsień naramienny (głowa tylna)", 12: "Mięsień dwugłowy ramienia",
    14: "Mięsień trójgłowy ramienia", 15: "Zginacze nadgarstka i palców", 17: "Mięsień prosty brzucha",
    18: "Mięśnie skośne brzucha", 19: "Mięsień poprzeczny brzucha", 20: "Mięsień pośladkowy wielki",
    23: "Mięsień czworogłowy uda", 24: "Mięśnie kulszowo-goleniowe", 25: "Mięśnie przywodziciele uda",
    26: "Mięśnie odwodziciele uda", 27: "Mięsień brzuchaty łydki", 28: "Mięsień płaszczkowaty",
}

SIMPLE = {
    "chest": [1], "lats": [3], "traps": [4], "middle back": [5], "lower back": [7], "biceps": [12],
    "triceps": [14], "forearms": [15], "glutes": [20], "quadriceps": [23], "hamstrings": [24],
    "adductors": [25], "abductors": [26], "neck": [],  # szyi nie ma w naszym modelu — pomijana
}

REAR = re.compile(r"rear|reverse|odwrotn|tyln", re.I)
FRONT = re.compile(r"front|w przód|przodem", re.I)


def shoulders(primary: bool, pattern: str, names: str) -> list[int]:
    if REAR.search(names) or (not primary and pattern == "Przyciąganie poziome"):
        return [10]
    if FRONT.search(names):
        return [8]
    if primary and pattern in ("Pchanie pionowe", "Odwodzenie"):
        return [9]
    return [8]


def abdominals(pattern: str) -> list[int]:
    if pattern in ("Anti-ekstensja", "Stabilizacja tułowia"):
        return [19]
    if pattern in ("Rotacja", "Anti-rotacja"):
        return [18]
    return [17]


def map_muscle(src: str, primary: bool, pattern: str, names: str) -> list[int]:
    if src == "shoulders":
        return shoulders(primary, pattern, names)
    if src == "abdominals":
        return abdominals(pattern)
    if src == "calves":
        return [27]
    return SIMPLE[src]


def muscles_for(ex: dict, pattern: str, names: str) -> tuple[list[str], list[str]]:
    prim: list[int] = []
    for s in ex["primaryMuscles"]:
        prim += [i for i in map_muscle(s, True, pattern, names) if i not in prim]
    sec: list[int] = []
    if "calves" in ex["primaryMuscles"]:
        sec.append(28)  # wspięcia: płaszczkowaty jako pomocniczy (jak w katalogu)
    for s in ex["secondaryMuscles"]:
        sec += [i for i in map_muscle(s, False, pattern, names) if i not in prim and i not in sec]
    return [M[i] for i in prim], [M[i] for i in sec]


def main() -> None:
    source = {e["id"]: e for e in json.load(open(sys.argv[1], encoding="utf-8"))}
    for path in sys.argv[2:]:
        raw = open(path, "rb").read().decode("utf-8-sig")
        crlf = "\r\n" in raw
        rows = list(csv.reader(io.StringIO(raw), delimiter=";"))
        header = rows[0]
        if "mięśnie_główne" not in header:
            at = header.index("mięśnie") + 1
            header[at:at] = ["mięśnie_główne", "mięśnie_pomocnicze"]
            for r in rows[1:]:
                r[at:at] = ["", ""]
        ix = {k: i for i, k in enumerate(header)}
        filled = 0
        for r in rows[1:]:
            ex = source.get(r[ix["zrodlo_id"]])
            if not ex:
                continue
            prim, sec = muscles_for(ex, r[ix["wzorzec"]], f'{r[ix["nazwa_EN"]]} {r[ix["nazwa_PL"]]}')
            if not r[ix["mięśnie_główne"]].strip():
                r[ix["mięśnie_główne"]] = ", ".join(prim)
                filled += 1
            if not r[ix["mięśnie_pomocnicze"]].strip():
                r[ix["mięśnie_pomocnicze"]] = ", ".join(sec)
        out = io.StringIO()
        csv.writer(out, delimiter=";", lineterminator="\r\n" if crlf else "\n").writerows(rows)
        open(path, "wb").write(("﻿" + out.getvalue()).encode("utf-8"))
        print(f"{path}: {len(rows) - 1} wierszy, uzupełniono {filled}")


if __name__ == "__main__":
    main()
