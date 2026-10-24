#!/usr/bin/env python3
"""Krok A / B wdrożenia propozycji katalogu (docs/KATALOG-PROPOZYCJA.csv). Tylko generuje pliki; nie łączy się z bazą.
 KROK A (zaostrzające) → lib/db/migrations/0020_katalog_krok_a.sql + docs/KATALOG-KROK-A.md:
   dopisanie flag obciążenia stawów (joint_stress_areas), suitableForNoActivity = false. (Podniesienia learningDifficulty propozycja nie zawiera.)
 KROK B (rozluźniające i brakujące pola) → docs/KATALOG-DO-PRZEGLADU.csv (decyzja_trenera PUSTE). suitableForNoActivity = true NIGDY."""
import csv, os
root = os.path.join(os.path.dirname(__file__), "..")
rows = list(csv.DictReader(open(os.path.join(root, "docs/KATALOG-PROPOZYCJA.csv"), encoding="utf-8-sig"), delimiter=";"))
LV = {"Początkujący": 1, "Średniozaawansowany": 2, "Zaawansowany": 3}
q = lambda s: "'" + s.replace("'", "''") + "'"

# ── KROK A ────────────────────────────────────────────────────────────────
joints = [(r["id"], r["nazwa"], [j.strip() for j in r["stawy_propozycja"].split(";") if j.strip()]) for r in rows if r["stawy_propozycja"].strip()]
falses = [(r["id"], r["nazwa"], r["suitable_czynniki_ryzyka"]) for r in rows if r["suitable_propozycja"].strip() == "false"]
sql = ["-- Katalog, krok A (24.10.2026): TYLKO zmiany zaostrzające — mogą wyłącznie usunąć ćwiczenie z doboru.",
       "-- Źródło: docs/KATALOG-PROPOZYCJA.csv (decyzje właściciela). Idempotentne; nazwa chroni przed pomyłką id na innej bazie.",
       "-- 1) flagi obciążenia stawów dopisywane do istniejących (nigdy nie usuwane)",
       "UPDATE exercises e SET joint_stress_areas = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(e.joint_stress_areas, '{}'::text[]) || v.areas) x ORDER BY x)), updated_at = now()",
       "FROM (VALUES"]
sql.append(",\n".join("  (%s, %s, ARRAY[%s]::text[])" % (i, q(n), ", ".join(q(j) for j in js)) for i, n, js in joints))
sql += [") AS v(id, name, areas)", "WHERE e.id = v.id AND e.name = v.name;", "",
        "-- 2) suitableForNoActivity = false (tylko gdzie dziś brak wartości; wartości ustawionej przez trenera nie ruszamy)",
        "UPDATE exercises SET suitable_for_no_activity = false, updated_at = now()",
        "WHERE suitable_for_no_activity IS NULL AND (id, name) IN ("]
sql.append(",\n".join("  (%s, %s)" % (i, q(n)) for i, n, _ in falses)); sql.append(");")
open(os.path.join(root, "lib/db/migrations/0020_katalog_krok_a.sql"), "w", encoding="utf-8").write("\n".join(sql) + "\n")
md = ["# Katalog — krok A (wdrożone zmiany zaostrzające)", "",
      "Data: 24.10.2026. Źródło: `docs/KATALOG-PROPOZYCJA.csv`. Migracja danych: `lib/db/migrations/0020_katalog_krok_a.sql` (generator: `scripts/katalog-krok-ab.py`). Kopia bazy przed zmianą: `~/backups/`.", "",
      "Zmiany **tylko zaostrzające** — mogą wyłącznie usunąć ćwiczenie z doboru, nigdy dodać: flagi obciążenia stawów, `suitableForNoActivity = false`. Podniesienia `learningDifficulty` propozycja nie zawiera (kolumna „trudnosc_uczenia” to wartość obecna). Reguła „dla nieaktywnych tylko `true`” sprawia, że `false` i brak wartości zachowują się tak samo; `false` zapisuje świadomą ocenę.", "",
      "## 1. Flagi obciążenia stawów (`joint_stress_areas`): %d ćwiczeń" % len(joints), "", "Stare: puste (wszystkie). Pole czytają dziś: dobór rozgrzewki i zgłoszenia bólu; nie zmienia doboru ćwiczeń głównych.", "", "| id | ćwiczenie | stare | nowe |", "|---|---|---|---|"]
md += ["| %s | %s | — | %s |" % (i, n, ", ".join(js)) for i, n, js in joints]
md += ["", "## 2. `suitableForNoActivity` → false: %d ćwiczeń" % len(falses), "", "| id | ćwiczenie | stare | nowe | czynniki ryzyka |", "|---|---|---|---|---|"]
md += ["| %s | %s | brak | false | %s |" % (i, n, c) for i, n, c in falses]
open(os.path.join(root, "docs/KATALOG-KROK-A.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")

# ── KROK B ────────────────────────────────────────────────────────────────
out = []
def add(r, pole, ob, pr, powod): out.append([r["id"], r["nazwa"], pole, ob, pr, powod, ""])
for r in rows:
    if r["poziom_obecny"] != r["poziom_propozycja"]:
        low = LV[r["poziom_propozycja"]] < LV[r["poziom_obecny"]]
        add(r, "poziom trudności", r["poziom_obecny"], r["poziom_propozycja"], ("rozluźniająca (poziom niższy)" if low else "zaostrzająca, ale poza listą kroku A (podniesienie poziomu)") + "; " + (r["uzasadnienie_przy_niskiej"] or "pewność " + r["pewnosc"]))
    if r["wzorzec_obecny"] != r["wzorzec_propozycja"]: add(r, "wzorzec ruchu", r["wzorzec_obecny"], r["wzorzec_propozycja"], "uporządkowanie metadanych; pewność " + r["pewnosc"])
    if r["wykonanie_obecne"] != r["wykonanie_propozycja"]: add(r, "wykonanie", r["wykonanie_obecne"], r["wykonanie_propozycja"], "uporządkowanie metadanych; pewność " + r["pewnosc"])
    if r["miejsce_obecne"] != r["miejsce_propozycja"]:
        add(r, "miejsce treningu", r["miejsce_obecne"], r["miejsce_propozycja"], "rozluźniająca (dochodzi miejsce, w którym ćwiczenie może się pojawić)" if set(r["miejsce_propozycja"].split("; ")) > set(r["miejsce_obecne"].split("; ")) else "zmiana kolejności/zawartości")
    if r["sprzet_obecny"] != r["sprzet_propozycja"]: add(r, "sprzęt", r["sprzet_obecny"], r["sprzet_propozycja"], "nowa wartość zamkniętej listy zamiast „Inny” (decyzja właściciela 23.10.2026); wpływa na dopasowanie do sprzętu klienta")
    if r["urzadzenie_szczegolowo_propozycja"].strip(): add(r, "urządzenie szczegółowo (equipment_detail)", "puste", r["urzadzenie_szczegolowo_propozycja"], "brakujące pole")
    if not r["stawy_propozycja"].strip(): add(r, "stawy obciążane", "puste", "(bez wyraźnego stawu z listy)", "brakujące pole — do potwierdzenia przez trenera")
    if r["suitable_propozycja"].strip() != "false": add(r, "suitableForNoActivity", "brak", "(do oceny trenera)", "brakujące pole; true tylko decyzją trenera. " + r["suitable_uwaga"])
with open(os.path.join(root, "docs/KATALOG-DO-PRZEGLADU.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";"); w.writerow(["id", "nazwa", "pole", "obecnie", "propozycja", "powód", "decyzja_trenera"]); w.writerows(out)
print("A: stawy", len(joints), "false", len(falses), "| B:", len(out), "wierszy")
