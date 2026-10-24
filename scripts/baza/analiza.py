#!/usr/bin/env python3
"""Analiza zewnętrznej bazy free-exercise-db (Unlicense) względem naszego katalogu.
Tylko lista ruchów jako ściąga: nazwa, sprzęt, mięśnie, poziom. Opisów, instrukcji i mediów NIE używamy.
Użycie: analiza.py <free-exercise-db>/dist/exercises.json <katalog_wyjściowy>
Nasz katalog czyta tylko do odczytu przez psql ($DATABASE_URL)."""
import json, os, re, subprocess, sys, csv, collections
from difflib import SequenceMatcher
sys.path.insert(0, os.path.dirname(__file__))
from ours_en import OURS_EN
from reguly import *  # słowniki: MIESNIE, SPRZET, SYNONIMY, WZORCE, MANUAL itd.

src_path, out_dir = sys.argv[1:3]
src = json.load(open(src_path))
rows = subprocess.run(["psql", os.environ["DATABASE_URL"], "-At", "-F|", "-c",
    "select id,name,main_muscle_group,array_to_string(equipment,','),coalesce(movement_pattern,'') from exercises order by id"],
    capture_output=True, text=True, check=True).stdout.strip().splitlines()
ours = {}
for r in rows:
    i, n, m, e, p = r.split("|")
    ours[int(i)] = dict(id=int(i), name=n, muscle=m, equip=set(e.split(",")), pattern=p, en=OURS_EN[int(i)])

STOP = {"the","a","an","with","on","to","of","and","exercise","from","in","for","your","your","position","version","style"}
def norm_tokens(name):
    s = name.lower().replace("-", " ").replace("/", " ").replace("'", "")
    toks = re.findall(r"[a-z0-9]+", s)
    out = []
    for t in toks:
        if t in STOP: continue
        t = SYNONIMY_TOKENOW.get(t, t)
        if len(t) > 3 and t.endswith("s") and not t.endswith("ss"): t = t[:-1]
        out.append(t)
    return out
def key(name): return " ".join(sorted(set(norm_tokens(name))))
OURS_KEYS = {i: key(o["en"]) for i, o in ours.items()}

def eq_pl(x):
    e = x.get("equipment"); n = x["name"].lower()
    if e == "other":
        for pat, val in SPRZET_Z_NAZWY:
            if re.search(pat, n): return val
        return None
    return SPRZET.get(e)
def muscle_pl(x): return MIESNIE.get(x["primaryMuscles"][0], "Inne") if x["primaryMuscles"] else "Inne"
def pattern_pl(x):
    n = x["name"].lower()
    if x["id"] in WZORZEC_RECZNY: return WZORZEC_RECZNY[x["id"]]
    if x["category"] == "stretching": return "Rozciąganie"
    for pat, val in WZORCE:
        if re.search(pat, n): return val
    return ""
def pomin_powod(x):
    n = x["name"].lower()
    if x["category"] in POMIN_KATEGORIE: return POMIN_KATEGORIE[x["category"]]
    if x["primaryMuscles"] and x["primaryMuscles"][0] == "neck" or re.search(r"\bneck\b", n): return "szyja — ryzyko bez wartości dla trenera personalnego"
    for pat, powod in POMIN_NAZWY:
        if re.search(pat, n): return powod
    e = eq_pl(x)
    if e is None: return "sprzęt spoza zamkniętej listy (%s)" % x.get("equipment")
    return ""

def best_match(x):
    k = key(x["name"]); ks = set(k.split())
    best = (0, None)
    for i, ok in OURS_KEYS.items():
        os_ = set(ok.split())
        if not ks or not os_: continue
        sc = 2 * len(ks & os_) / (len(ks) + len(os_))
        if sc > best[0]: best = (sc, i)
    return best

PACZKI = {}
for line in open(os.path.join(os.path.dirname(__file__), "paczki.tsv"), encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    if len(p) == 6: PACZKI[p[0]] = tuple(p[1:])
NAZWY_PL = {}
_np = os.path.join(os.path.dirname(__file__), "nazwy_pl_wariantow.tsv")
if os.path.exists(_np):
    for line in open(_np, encoding="utf-8"):
        a = line.rstrip("\n").split("\t")
        if len(a) == 2: NAZWY_PL[a[0]] = a[1]
out = []
seen = {}
for x in src:
    sid = x["id"]; k = key(x["name"])
    rec = dict(zrodlo_id=sid, nazwa_EN=x["name"], kat=x["category"])
    rec["sprzet"] = SPRZET_RECZNY.get(sid) or eq_pl(x) or ""; rec["miesnie"] = muscle_pl(x)
    rec["poziom"] = POZIOM.get(x["level"], ""); rec["wzorzec"] = pattern_pl(x)
    rec["rola"] = ROLA_RECZNA.get(sid, rola(x)); rec["stawy"] = stawy(rec["wzorzec"], x); rec["cele"] = cele(x, rec)
    sc, oid = best_match(x)
    rec["najblizsze_id"] = oid; rec["wynik"] = round(sc, 2)
    powod = pomin_powod(x)
    if sid in MANUAL:                       # decyzje po ręcznym przeglądzie par
        rec.update(zip(("decyzja", "nasze_id", "pewnosc", "powod"), MANUAL[sid]))
    elif powod:
        rec.update(decyzja="pomiń", nasze_id="", pewnosc="", powod=powod)
    elif k in seen:
        rec.update(decyzja="duplikat", nasze_id="", pewnosc="wysoka", powod="duplikat wewnątrz źródła: %s" % seen[k])
    elif sc >= 0.999:
        rec.update(decyzja="duplikat", nasze_id=oid, pewnosc="wysoka", powod="ta sama nazwa po normalizacji i synonimach")
    elif sc >= 0.8:
        rec.update(decyzja="do decyzji", nasze_id=oid, pewnosc="niska", powod="podobna do id %s (%s) — sprawdź" % (oid, ours[oid]["name"]))
    else:
        rec.update(decyzja="nowe", nasze_id="", pewnosc="", powod="")
    seen.setdefault(k, x["name"])
    if sid in PACZKI:                       # paczki ręcznych decyzji i tłumaczeń (paczki.tsv)
        dec, nid, pew, pow_, pl = PACZKI[sid]
        rec.update(decyzja=dec, nasze_id=int(nid) if nid else "", pewnosc=pew, powod=pow_)
        if pl: rec["nazwa_PL"] = pl
    if rec.get("pewnosc") == "niska" and rec["decyzja"] in ("duplikat", "wariant"):
        rec["powod"] = "NISKA PEWNOŚĆ (%s): %s" % (rec["decyzja"], rec["powod"]); rec["decyzja"] = "do decyzji"
    if sid in PLIO:                         # A2: wybrane podstawy pliometrii
        pl, wz, sp, st, uw = PLIO[sid]
        rec.update(decyzja="nowe", nasze_id="", pewnosc="", powod="pliometria, tylko poziom średniozaawansowany/zaawansowany i cel sport/kondycja — nigdy początkujący ani brak aktywności; %s" % uw,
                   nazwa_PL=pl, wzorzec=wz, sprzet=sp, stawy=st, poziom="Średniozaawansowany", rola="pomocnicze", cele="sport, kondycja")
    elif sid in PLIO_DUP:
        rec.update(decyzja="duplikat", nasze_id=PLIO_DUP[sid], pewnosc="wysoka", powod="pliometria — mamy to ćwiczenie w katalogu")
    if rec["decyzja"] == "wariant":         # A3: zostaje max 30 wariantów-zamienników
        if sid in WARIANTY_ZAMIENNIKI: rec["powod"] = "zamiennik: " + WARIANTY_ZAMIENNIKI[sid]
        else: rec["powod"] = "wariant kosmetyczny (pominięty)"; rec["decyzja"] = "pomiń"; rec["pewnosc"] = ""
    if rec["rola"] in ("rozciąganie", "rozgrzewka") and rec["decyzja"] in ("nowe", "wariant", "do decyzji"): rec["poziom"] = "Początkujący"  # poziom źródła nie ma tu znaczenia
    rec.setdefault("nazwa_PL", NAZWY_PL.get(sid, ""))
    out.append(rec)
json.dump(out, open(os.path.join(out_dir, "kandydaci.json"), "w"), ensure_ascii=False, indent=1)
print(collections.Counter(r["decyzja"] for r in out))

# ── wyjścia: docs/BAZA-KANDYDACI.csv + statystyki do docs/BAZA-ANALIZA.md ──
docs = sys.argv[3] if len(sys.argv) > 3 else out_dir
cols = ["źródło_id","nazwa_EN","proponowana_nazwa_PL","decyzja","nasze_id","pewność","powód","poziom","rola","sprzęt","wzorzec","mięśnie","stawy","cele","suitableForNoActivity"]
order = {"nowe": 0, "do decyzji": 1, "wariant": 2, "duplikat": 3, "pomiń": 4}
with open(os.path.join(docs, "BAZA-KANDYDACI.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";"); w.writerow(cols)
    for r in sorted(out, key=lambda r: (order[r["decyzja"]], r["nazwa_EN"])):
        pomin = r["decyzja"] == "pomiń"
        w.writerow([r["zrodlo_id"], r["nazwa_EN"], r["nazwa_PL"], r["decyzja"], r["nasze_id"], r["pewnosc"], r["powod"], r["poziom"],
            "" if pomin else r["rola"], r["sprzet"], "" if pomin else r["wzorzec"], r["miesnie"], "" if pomin else r["stawy"], "" if pomin else r["cele"], ""])
stat = collections.Counter(r["decyzja"] for r in out)
print(dict(stat))
pw = collections.Counter(r["powod"].split(" (")[0].split(" — ")[0] for r in out if r["decyzja"] == "pomiń")
print(pw.most_common(40))

json.dump(out, open(os.path.join(out_dir, "kandydaci.json"), "w"), ensure_ascii=False, indent=1)
