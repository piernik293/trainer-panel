#!/usr/bin/env python3
"""docs/GRAFIKI-TOP50.csv: najczęściej wybierane ćwiczenia w symulacji 1000 profili (pełny katalog), osobno rozgrzewki i schłodzenia, z pokryciem top 50 / top 100.
Wejście: zrzut symulacji (SIM_DUMP=… SIM_SCHEMA=sim scripts/generator-sim.sh 1000). Tylko odczyt z bazy. Użycie: scripts/grafiki-top50.py zrzut.json"""
import csv, json, os, subprocess, sys, collections
dump = json.load(open(sys.argv[1]))
url = os.environ["DATABASE_URL"]; test = url.rsplit("/", 1)[0] + "/trainer_panel_test"
def q(db, sql):
    out = subprocess.run(["psql", db, "-At", "-F", "\x1f", "-c", sql], capture_output=True, text=True, check=True).stdout
    return [l.split("\x1f") for l in out.splitlines()]
meta = {}
for r in q(test, """select id, name, main_muscle_group, coalesce(movement_pattern,''), array_to_string(equipment,'/'), coalesce(description,''), coalesce(execution_instructions,''),
    coalesce(coaching_tips,''), coalesce(common_mistakes,''), coalesce(image_url,''), coalesce(video_url,''), coalesce(role,'') from sim.exercises"""):
    meta[int(r[0])] = dict(name=r[1], group=r[2], pat=r[3], equip=r[4] or "masa ciała", desc=r[5], how=r[6], tips=r[7], mist=r[8], img=r[9], vid=r[10], role=r[11])
app_id = {r[1]: int(r[0]) for r in q(url, "select id, name from exercises")}
main_c, warm_c, cool_c = collections.Counter(), collections.Counter(), collections.Counter()
for d in dump:
    if d["status"] != 200: continue
    main_c.update(d["ids"]); warm_c.update(d.get("warm", [])); cool_c.update(d.get("cool", []))
def has_text(m):
    ok_desc = bool(m["desc"].strip()); ok_tips = bool(m["tips"].strip()) and bool(m["how"].strip())
    return ("tak" if ok_desc else "BRAK opisu") + " / " + ("tak" if ok_tips else "BRAK wskazówek")
def media(m): return "tak" if (m["img"] or m["vid"]) else "nie"
def rows_for(counter, n):
    total = sum(counter.values()); out = []
    for i, c in counter.most_common(n):
        m = meta[i]
        out.append([app_id.get(m["name"], i), m["name"], m["group"], m["pat"], m["equip"], f"{100*c/total:.2f}".replace(".", ","), c, has_text(m), media(m)])
    return out, total
def cover(counter, n):
    t = sum(counter.values()); return 100 * sum(c for _, c in counter.most_common(n)) / t
root = os.path.join(os.path.dirname(__file__), "..")
with open(os.path.join(root, "docs/GRAFIKI-TOP50.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";")
    hdr = ["id", "nazwa", "partia", "wzorzec", "sprzęt", "% wyborów", "liczba wyborów", "opis / wskazówki", "grafika lub wideo"]
    p50, p100, p20w, p20c = cover(main_c, 50), cover(main_c, 100), cover(warm_c, 20), cover(cool_c, 20)
    w.writerow(["POKRYCIE (symulacja 1000 profili, pełny katalog)"]); w.writerow(["top 50 ćwiczeń obejmuje % wszystkich ćwiczeń w planach", f"{p50:.1f}".replace(".", ",")])
    w.writerow(["top 100 ćwiczeń obejmuje %", f"{p100:.1f}".replace(".", ",")]); w.writerow(["top 20 rozgrzewek obejmuje % wszystkich rozgrzewek w planach", f"{p20w:.1f}".replace(".", ",")])
    w.writerow(["top 20 schłodzeń obejmuje % wszystkich schłodzeń w planach", f"{p20c:.1f}".replace(".", ",")])
    w.writerow(["różnych ćwiczeń użytych w planach", len(main_c), "z aktywnych w katalogu", len(meta)]); w.writerow([])
    for title, counter, n in [("TOP 50 ĆWICZEŃ", main_c, 50), ("TOP 20 ROZGRZEWEK", warm_c, 20), ("TOP 20 SCHŁODZEŃ", cool_c, 20)]:
        r, total = rows_for(counter, n)
        w.writerow([title + f" (podstawa: {total} wystąpień)"]); w.writerow(hdr)
        for x in r: w.writerow(x)
        w.writerow([])
top = main_c.most_common(10); tot = sum(main_c.values())
print(f"pokrycie: top50 {p50:.1f}%, top100 {p100:.1f}%, top20 rozgrzewek {p20w:.1f}%, top20 schłodzeń {p20c:.1f}%; użytych {len(main_c)} z {len(meta)}")
print("top10:", [(meta[i]['name'], f"{100*c/tot:.1f}%") for i, c in top])
no_text = [meta[i]["name"] for i, _ in main_c.most_common(50) if not (meta[i]["desc"].strip() and meta[i]["tips"].strip() and meta[i]["how"].strip())]
print("top50 bez opisu/wskazówek:", len(no_text), no_text[:8])
