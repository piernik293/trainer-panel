#!/usr/bin/env python3
"""Plik do przeglądu katalogu z właścicielem (decyzje 52–54): docs/PRZEGLAD-KATALOGU.csv. NICZEGO NIE ZMIENIA W BAZIE (tylko odczyt).

Wejście: dwa zrzuty symulacji 1000 profili (SIM_DUMP): stan faktyczny i katalog „odblokowany” (na BAZIE TESTOWEJ: suitable_for_no_activity=true tam, gdzie
było NULL; zatwierdzone przez trenera; zweryfikowane; trudność uczenia 2 tam, gdzie brak). „Ile razy brakowało” = liczba dni, które w stanie faktycznym były
odrzucone albo krótsze, a po odblokowaniu użyły tego ćwiczenia. Użycie: scripts/przeglad-katalogu.py <zrzut_bazowy.json> <zrzut_odblokowany.json>
"""
import csv, json, os, re, subprocess, sys
from collections import Counter, defaultdict

base = json.load(open(sys.argv[1])); relax = json.load(open(sys.argv[2]))
url = os.environ["DATABASE_URL"]

def q(sql):
    out = subprocess.run(["psql", url, "-At", "-F", "\x1f", "-c", sql], capture_output=True, text=True, check=True).stdout
    return [l.split("\x1f") for l in out.splitlines()]

rows = q("""select id, name, main_muscle_group, array_to_string(equipment,'/'), coalesce(difficulty_level,''), coalesce(learning_difficulty::text,''),
  coalesce(suitable_for_no_activity::text,''), coalesce(verification_status,''), reviewed_by_trainer::text, coalesce(joint_stress,''), coalesce(intensity,''),
  coalesce(parent_exercise_id::text,''), coalesce(movement_pattern,'') from exercises where is_active and not hidden and name not like '[test%'""")
ex = {}
for r in rows:
    ex[int(r[0])] = dict(id=int(r[0]), name=r[1], group=r[2], equip=r[3], diff=r[4], learn=int(r[5]) if r[5] else None, suit=r[6], ver=r[7], rev=r[8] == "true", stress=r[9], inten=r[10], parent=r[11], pattern=r[12])

def gated(e):  # something the owner still has to decide
    return e["suit"] == "" or e["ver"] != "zweryfikowane" or not e["rev"] or e["learn"] is None

key = lambda d: (d["p"], d["t"])
bydays = defaultdict(list)
for d in base: bydays[d["p"]].append(d)
rel = defaultdict(list)
for d in relax: rel[d["p"]].append(d)
credit, credit_low = Counter(), Counter()
credit_lvl = defaultdict(Counter)  # id -> poziom -> dni
for p, days in bydays.items():
    for i, b in enumerate(days):
        r = rel[p][i] if i < len(rel[p]) else None
        if not r or r["t"] != b["t"]: continue
        short = b["status"] != 200 or len(b["ids"]) < 4
        better = r["status"] == 200 and (b["status"] != 200 or len(r["ids"]) > len(b["ids"]))
        if not (short and better): continue
        for xid in set(r["ids"]) - set(b["ids"]):
            if xid in ex and gated(ex[xid]):
                credit[xid] += 1
                credit_lvl[xid][b["level"]] += 1
                if b["level"] in ("Brak aktywności fizycznej", "Początkujący"): credit_low[xid] += 1

names = Counter(re.sub(r"\W+", " ", e["name"].lower()).strip() for e in ex.values())
first_id = {}
for e in sorted(ex.values(), key=lambda e: e["id"]): first_id.setdefault(re.sub(r"\W+", " ", e["name"].lower()).strip(), e["id"])
BLOCK = ("bear crawl", "człapak", "superman", "żabka", "pająk", "inchworm")  # nazwy blokowane na stałe w silniku V0

def proposal(e):
    norm = re.sub(r"\W+", " ", e["name"].lower()).strip()
    if names[norm] > 1 and first_id[norm] != e["id"]: return "ukryj", f"duplikat nazwy z id {first_id[norm]}"
    if any(b in e["name"].lower() for b in BLOCK): return "ukryj", "i tak blokowane w generatorze (lista wykluczonych nazw)"
    if e["inten"] or "skok" in e["name"].lower(): return "tylko od Ś", "pliometria: od Ś wg zasad skoków"
    if e["diff"] == "Zaawansowany": return "tylko od Ś", "trudność Zaawansowany (decyzja 50a wyklucza BA i P)"
    if e["stress"] == "Wysokie": return "tylko od Ś", "wysokie obciążenie stawów"
    if e["learn"] is not None and e["learn"] >= 4: return "tylko od Ś", f"trudność uczenia {e['learn']}"
    if e["diff"] == "Średniozaawansowany" or (e["learn"] == 3): return "tylko od Ś", "trudność Średniozaawansowany lub uczenia 3"
    if e["learn"] is None: return ("tylko od P" if e["diff"] == "Początkujący" else "zatwierdź"), "brak trudności uczenia — uzupełnić przy zatwierdzeniu"
    bw = e["equip"] in ("", "Masa własnego ciała", "Gumy oporowe", "Brak sprzętu")
    if e["diff"] in ("Brak aktywności fizycznej",) or (e["diff"] == "Początkujący" and e["learn"] <= 2 and e["stress"] in ("Niskie", "") and bw):
        return "zatwierdź", "łatwe, niskie obciążenie stawów, bez sprzętu lub z gumą"
    return "tylko od P", "trudność Początkujący, wymaga sprzętu lub średnie obciążenie stawów"

ALLOWED = {"zatwierdź": ("Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"), "tylko od P": ("Początkujący", "Średniozaawansowany", "Zaawansowany"),
           "tylko od Ś": ("Średniozaawansowany", "Zaawansowany"), "ukryj": ()}
def realized(e):
    return sum(n for lvl, n in credit_lvl[e["id"]].items() if lvl in ALLOWED[proposal(e)[0]])

def status(e):
    bits = []
    if e["ver"] != "zweryfikowane": bits.append(e["ver"] or "brak statusu")
    if not e["rev"]: bits.append("niezatwierdzone (import)")
    if e["learn"] is None: bits.append("brak trudności uczenia")
    return "; ".join(bits) or "zweryfikowane"

def lowlevel(e): return e["diff"] in ("Początkujący", "Brak aktywności fizycznej", "")
def bwband(e): return e["equip"] in ("", "Masa własnego ciała", "Gumy oporowe", "Brak sprzętu")
cands = [e for e in ex.values() if gated(e)]
# najpierw: bez sprzętu / z gumą oraz używane u BA/P; w grupach wg „ile razy brakowało”
cands.sort(key=lambda e: (0 if (bwband(e) or credit_low[e["id"]] > 0) else 1, -credit[e["id"]], -credit_low[e["id"]], e["id"]))
cands = cands[:150]

# sekcja 2 (decyzja 54.4): 13 brakujących ćwiczeń — NIE dodawane do bazy przed akceptacją
MISSING = [
 ("Zwis na drążku", "Utrzymanie zwisu na prostych rękach, łopatki lekko ściągnięte; start do podciągania.", "P"),
 ("Negatywy podciągnięcia", "Wejście nad drążek (skok lub podpórka) i powolne opuszczanie ciała w 3–5 s.", "Ś"),
 ("Podciąganie łucznik (archer)", "Podciąganie z naciskiem na jedną rękę, druga prosta w bok.", "Z"),
 ("Negatywy dipów", "Wejście w górną pozycję na poręczach i powolne opuszczanie ciała w 3–5 s.", "Ś"),
 ("Dipy z gumą", "Dipy na poręczach z gumą pod kolanami odciążającą ruch.", "Ś"),
 ("Dipy z obciążeniem", "Dipy na poręczach z dodatkowym ciężarem na pasie.", "Z"),
 ("Pompki łucznik (archer)", "Pompka z przeniesieniem ciężaru na jedną rękę, druga prosta w bok.", "Z"),
 ("Wiosłowanie australijskie — nogi proste", "Podciąganie w poziomie pod drążkiem z prostymi nogami opartymi na piętach.", "Ś"),
 ("Wiosłowanie australijskie — nogi wyżej lub na kółkach", "Podciąganie w poziomie z nogami na podwyższeniu albo na kółkach gimnastycznych.", "Z"),
 ("Unoszenie prostych nóg w zwisie", "W zwisie na drążku unoszenie prostych nóg do poziomu.", "Ś"),
 ("Toes to bar", "W zwisie na drążku unoszenie stóp do drążka.", "Z"),
 ("Pistol z podparciem", "Przysiad na jednej nodze z podparciem ręką o drążek lub ścianę.", "Z"),
 ("L-sit z podparciem", "Siad kątowy na poręczach lub podłodze z lekko ugiętymi nogami.", "Ś"),
]

out = os.path.join(os.path.dirname(__file__), "../docs/PRZEGLAD-KATALOGU.csv")
with open(out, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["id", "nazwa", "partia", "sprzęt", "trudność", "obecny status", "suitable_for_no_activity", "ile razy brakowało w symulacji", "w tym dni BA/P", "ile usunie wg PROPOZYCJI", "PROPOZYCJA", "powód", "decyzja właściciela"])
    for e in cands:
        pr, why = proposal(e)
        w.writerow([e["id"], e["name"], e["group"], e["equip"] or "masa ciała", e["diff"], status(e), e["suit"] or "brak", credit[e["id"]], credit_low[e["id"]], realized(e), pr, why, ""])
    w.writerow([])
    w.writerow(["SEKCJA 2: BRAKUJĄCE ĆWICZENIA KALISTENICZNE (decyzja 54.4) — NIE ma ich w bazie, dopisać dopiero po akceptacji"])
    w.writerow(["nazwa", "opis (1 zdanie)", "szczebel", "", "", "", "", "", "", "", "decyzja właściciela"])
    for n, d, s in MISSING: w.writerow([n, d, s, "", "", "", "", "", "", "", ""])
tot = sum(credit.values())
print("usunie wg propozycji (suma dni):", sum(realized(e) for e in cands))
print(f"wierszy: {len(cands)}, z kredytem > 0: {sum(1 for e in cands if credit[e['id']])}, suma kredytu: {tot}, wszystkich do decyzji (gated): {sum(1 for e in ex.values() if gated(e))} z {len(ex)}")
print(Counter(proposal(e)[0] for e in cands))
