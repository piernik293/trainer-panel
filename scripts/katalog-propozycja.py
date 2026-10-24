#!/usr/bin/env python3
"""
Propozycja metadanych dla starszych ćwiczeń katalogu wg docs/KATALOG-STANDARD.md.
Tylko CZYTA dane (JSON z zapytania SELECT), niczego nie zapisuje w bazie ani w seedzie.
Użycie: katalog-propozycja.py <ex.json> <wyjście.csv> <wyjście.json>
Reguły są słownikowe (słowa kluczowe w nazwie ćwiczenia, sprzęt, partie, trudność uczenia).
suitableForNoActivity: NIGDY nie proponuje true; wolno zaproponować tylko false (kierunek bezpieczniejszy).
"""
import csv, json, re, sys
from collections import Counter

ex = json.load(open(sys.argv[1], encoding="utf8"))

MACHINES = [  # zamknięta lista konkretnych urządzeń (equipment_detail)
    "Suwnica 45° (prasa do nóg)", "Hack squat", "Suwnica Smitha", "Maszyna do prostowania nóg", "Maszyna do uginania nóg",
    "Maszyna odwodzenia nóg", "Maszyna przywodzenia nóg", "Maszyna Pec Deck (motylek)", "Maszyna do wyciskania (klatka)",
    "Maszyna wspomagająca (podciąganie/dipy)", "T-bar", "Wyciąg górny", "Wyciąg dolny", "Brama (crossover)", "Wyciąg — lina",
    "Wyciąg — drążek", "Wyciąg — uchwyt jednorącz", "Maszyna do łydek (stojąc/siedząc)",
]
JOINTS = ["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"]
PATTERNS = ["Wzruszanie ramion", "Zgięcie/wyprost nadgarstka", "Pchanie poziome", "Pchanie pionowe", "Przyciąganie poziome", "Przyciąganie pionowe", "Przysiad", "Zawias biodrowy", "Wykrok",
            "Zgięcie łokcia", "Wyprost łokcia", "Zgięcie kolana", "Wyprost kolana", "Odwodzenie", "Przywodzenie", "Zgięcie tułowia", "Rotacja",
            "Anti-ekstensja", "Anti-rotacja", "Stabilizacja tułowia", "Wspięcie na palce", "Lokomocja", "Mobilizacja", "Rozciąganie", "Aktywacja", "Inne"]
LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"]

def has(n, *words): return any(w in n for w in words)

# ---------- sprzęt szczegółowy ----------
def machine_detail(e):
    n = e["name"].lower(); eq = e["equipment"]
    out, conf, why = [], "wysoka", []
    if "Maszyna" in eq or "Wyciąg" in eq:
        if has(n, "hack squat"): out = ["Hack squat"]
        elif has(n, "suwnicy 45", "suwnic") and "smith" not in n: out = ["Suwnica 45° (prasa do nóg)"]
        elif "smith" in n: out = ["Suwnica Smitha"]
        elif "prostowanie nóg na maszynie" in n: out = ["Maszyna do prostowania nóg"]
        elif "uginanie nóg" in n and "maszyn" in n: out = ["Maszyna do uginania nóg"]
        elif "odwodzenie nóg na maszynie" in n: out = ["Maszyna odwodzenia nóg"]
        elif "przywodzenie nóg na maszynie" in n: out = ["Maszyna przywodzenia nóg"]
        elif "pec deck" in n: out = ["Maszyna Pec Deck (motylek)"]
        elif "maszynie zbieżnej" in n: out = ["Maszyna do wyciskania (klatka)"]
        elif has(n, "wspomagając", "wspomagane na maszynie"): out = ["Maszyna wspomagająca (podciąganie/dipy)"]
        elif "wspięcia na palce" in n and "Maszyna" in eq: out = ["Maszyna do łydek (stojąc/siedząc)"]
        elif "t-bar" in n: out = ["T-bar"]
        elif has(n, "spięcia brzucha na wyciągu"): out = ["Wyciąg — lina"]; conf = "niska"; why.append("cable crunch zwykle z liną — do potwierdzenia")
        elif has(n, "ściąganie prostych ramion"): out = ["Wyciąg górny"]
        elif "bramie" in n: out = ["Brama (crossover)"]
        elif "na linkach" in n: out = ["Brama (crossover)"]
        elif has(n, "z liną", "liną"): out = ["Wyciąg — lina"]
        elif "wyciągu górnego" in n: out = ["Wyciąg górny"]
        elif has(n, "z drążkiem na wyciągu", "drążka wyciągu"): out = ["Wyciąg — drążek"]
        elif has(n, "nóg na wyciągu"): out = ["Wyciąg dolny"]; conf = "niska"; why.append("uginanie nogi na wyciągu — wyciąg dolny z pasem na kostkę (brak takiego uchwytu na liście)")
        elif has(n, "jednorącz", "zza ciała", "ramienia bokiem na wyciągu", "odwodzenie biodra na wyciągu", "rotacja zewnętrzna barku na wyciągu"):
            out = ["Wyciąg — uchwyt jednorącz"]
        elif has(n, "na wyciągu"): out = ["Wyciąg dolny"] if has(n, "uginanie ramion na wyciągu", "pull-through") else ["Wyciąg — uchwyt jednorącz"]; conf = "niska"; why.append("rodzaj wyciągu/uchwytu odgadnięty z nazwy")
        else: conf = "niska"; why.append("brak jednoznacznego urządzenia w nazwie")
    return out, conf, why

# ---------- sprzęt (zamknięta lista) ----------
NEW_EQUIPMENT = {  # decyzja właściciela 23.10: „Inny” → nowe wartości zamkniętej listy sprzętu
    "svend": "Talerz obciążeniowy", "uchwytach": "Uchwyty do pompek", "kółkach": "Kółka gimnastyczne",
}
def equipment_proposal(e):
    eq = list(dict.fromkeys(e["equipment"]))
    n = e["name"].lower(); conf = "wysoka"; why = []
    if eq == ["Inny"]:
        for key, val in NEW_EQUIPMENT.items():
            if key in n: eq = [val]; break
        else:
            conf = "niska"; why.append("„Inny” bez znanego odpowiednika na liście")
    return eq, None, conf, why

# ---------- miejsce ----------
def location_proposal(e, proposed_equipment=None):
    eq = set(proposed_equipment or e["equipment"]); cur = list(dict.fromkeys(e["training_location"]))
    n = e["name"].lower(); why = []; conf = "wysoka"
    machine = bool(eq & {"Maszyna", "Wyciąg"}) and not (eq & {"Hantle", "Masa własnego ciała", "Gumy oporowe"})
    if machine: prop = ["Siłownia"]
    elif eq & {"Sztanga"} and not (eq & {"Masa własnego ciała", "Gumy oporowe"}): prop = ["Siłownia"] + (["Dom"] if "Dom" in cur and eq == {"Sztanga", "Hantle", "Kettlebell", "Masa własnego ciała"} else [])
    elif eq & {"Talerz obciążeniowy", "Kółka gimnastyczne", "Uchwyty do pompek"} or "pompki" in n:
        prop = cur  # miejsce bez zmian — sprzęt jest przenośny
    elif eq <= {"Masa własnego ciała", "Gumy oporowe", "Drążek", "Poręcze", "Inny", "Ławka"} and not (eq & {"Maszyna", "Wyciąg", "Sztanga"}):
        prop = ["Siłownia", "Dom", "Plener"] if eq & {"Masa własnego ciała", "Gumy oporowe", "Drążek", "Poręcze"} else ["Siłownia", "Dom"]
        if eq == {"Poręcze"} or eq == {"Drążek", "Poręcze"}: prop = ["Siłownia", "Plener"]
    else: prop = cur
    prop = [p for p in ["Siłownia", "Dom", "Plener"] if p in prop]
    if set(prop) != set(cur):
        removed = set(cur) - set(prop); added = set(prop) - set(cur)
        conf = "wysoka" if (removed and not added and machine) else "niska"
        if removed: why.append(f"usuwa {', '.join(sorted(removed))}: wymaga sprzętu, którego nie ma w tym miejscu" if machine else f"usuwa {', '.join(sorted(removed))}")
        if added: why.append(f"dodaje {', '.join(sorted(added))}: ćwiczenie bez sprzętu / z prostym sprzętem")
    return prop, conf, why

# ---------- wzorzec ruchu ----------
def pattern_proposal(e):
    n = e["name"].lower(); cur = e["movement_pattern"]; why = []
    prop = cur; conf = "wysoka"
    if has(n, "szrug") and cur == "Inne": prop = "Wzruszanie ramion"
    elif cur == "Inne":
        if has(n, "wspięcia na palce"): prop = "Wspięcie na palce"
        elif has(n, "szrug", "szrugowanie"): prop = "Wzruszanie ramion"
        elif "skłony boczne" in n: prop = "Anti-rotacja"; conf = "niska"; why.append("skłon boczny z hantlem — najbliższy wzorzec: anty-rotacja/zgięcie boczne tułowia")
        elif "skoki pogo" in n: prop = "Lokomocja"; conf = "niska"; why.append("skok w miejscu o charakterze lokomocji")
    elif has(n, "nadgarstk"): prop = "Zgięcie/wyprost nadgarstka"
    elif "wznosy tułowia" in n: prop = "Zawias biodrowy"
    elif has(n, "superman"): prop = "Stabilizacja tułowia"
    elif "jefferson" in n: prop = "Zawias biodrowy"; conf = "niska"; why.append("Jefferson Curl: obecnie „Zgięcie tułowia”; ruch to zawias/zgięcie kręgosłupa pod obciążeniem")
    elif has(n, "wyciskanie sztangi wąskim chwytem") and cur == "Pchanie poziome": prop = cur; conf = "niska"; why.append("triceps-dominujące wyciskanie; wzorzec zostaje „Pchanie poziome”")
    return prop, conf, why

# ---------- wykonanie ----------
UNILATERAL = ["jednorącz", "jednonóż", "jednej nodze", "bułgarski", "wykrok", "pistol", "jednostronne", "kickback", "koncentryczne",
              "zza ciała", "odwodzenie biodra na wyciągu", "rotacja zewnętrzna barku", "unoszenie ramienia bokiem na wyciągu", "woodchop",
              "uginanie nóg na wyciągu stojąc", "skłony boczne z hantlem", "skok boczny", "skoki boczne"]
def execution_proposal(e):
    n = e["name"].lower(); cur = e["execution"]
    prop = "Jednostronne" if has(n, *UNILATERAL) else "Obustronne"
    conf, why = "wysoka", []
    if prop != cur:
        conf = "niska"; why.append(f"nazwa sugeruje „{prop}”, obecnie „{cur}”")
    if e["id"] in (211, 210): pass
    return prop, conf, why

# ---------- stawy ----------
def joints_proposal(e):
    n = e["name"].lower(); s = set(); conf = "wysoka"; why = []
    if has(n, "przysiad", "wykrok", "wypychanie nóg", "hack", "prostowanie nóg", "skok", "wskok", "zeskok", "przeskoki", "pistol", "zercher", "bułgarski"): s.add("Kolano")
    if has(n, "martwy ciąg", "hip thrust", "pull-through", "przysiad bułgarski", "pistol", "odwodzenie nóg", "przywodzenie nóg", "odwodzenie biodra", "skok", "wskok", "zeskok", "przeskoki", "wykrok", "wznosy tułowia"): s.add("Biodro")
    if has(n, "martwy ciąg", "wiosłowanie sztangą", "wiosłowanie podchwytem", "jefferson", "wznosy tułowia", "superman", "rotacje rosyjskie", "woodchop", "skłony boczne", "high pull", "przysiad ze sztangą", "zercher", "przysiad do skrzyni", "wiosłowanie t-bar", "odwrotne spięcia"): s.add("Plecy — dół")
    if has(n, "wyciskanie", "pompki", "dipy", "unoszenie hantli", "unoszenie ramienia", "arnold", "rozpiętki", "podciąganie", "ściąganie", "svend", "rotacja zewnętrzna barku", "high pull", "odwodzenie ramienia", "wyciskanie nad głowę"): s.add("Bark")
    if has(n, "uginanie ramion", "uginanie młotkowe", "uginanie koncentryczne", "uginanie zottmana", "prostowanie ramion", "wyciskanie francuskie", "wyciskanie jm", "kickback", "wąskim chwytem", "dipy", "spider curl", "bayesian", "uginanie ramienia"): s.add("Łokieć")
    if has(n, "pompki", "nadgarstk", "uginanie ramion ze sztangą", "uginanie ramion ze sztangą nachwytem"): s.add("Nadgarstek")
    if has(n, "podciąganie"): s.add("Łokieć")
    if has(n, "uginanie nóg"): s.discard("Kolano")
    # niska pewność: kombinacje i wyjątki
    if not s: conf = "niska"; why.append("brak wyraźnego obciążenia stawu z listy — puste pole do potwierdzenia")
    if e["joint_stress"] == "Wysokie" and not s: why.append("obecnie obciążenie stawów „Wysokie”, a żaden staw z listy nie pasuje")
    if len(s) >= 4: conf = "niska"; why.append("wiele stawów naraz — warto zawęzić ręcznie")
    return [j for j in JOINTS if j in s], conf, why

# ---------- poziom trudności ----------
def level_proposal(e):
    cur = e["difficulty_level"]; L = e["learning_difficulty"] or 2; j = e["joint_stress"]
    expected = "Początkujący" if L <= 2 and j != "Wysokie" else ("Średniozaawansowany" if L == 3 or (L <= 2 and j == "Wysokie") else "Zaawansowany")
    if L == 4 and j != "Wysokie": expected = "Średniozaawansowany" if j == "Niskie" else "Zaawansowany" if cur == "Zaawansowany" else "Średniozaawansowany"
    ci, ei = LEVELS.index(cur), LEVELS.index(expected)
    if ci == ei or (cur == "Brak aktywności fizycznej"): return cur, "wysoka", []
    if abs(ci - ei) >= 1:
        return expected, "niska", [f"trudność uczenia {L}, obciążenie stawów „{j}” sugerują poziom „{expected}”, obecnie „{cur}”"]
    return cur, "wysoka", []

# ---------- suitableForNoActivity ----------
PLYO = ["skok", "skoki", "wskok", "zeskok", "przeskoki"]
def suitable_proposal(e):
    n = e["name"].lower(); cur = e["suitable_for_no_activity"]
    factors = []
    if e["learning_difficulty"] and e["learning_difficulty"] >= 4: factors.append(f"trudność uczenia {e['learning_difficulty']}")
    if e["joint_stress"] == "Wysokie": factors.append("obciążenie stawów wysokie")
    if has(n, *PLYO): factors.append("ćwiczenie plyometryczne / z lądowaniem")
    if has(n, "pistol", "jefferson", "zercher", "high pull", "martwy ciąg", "przysiad ze sztangą", "wyciskanie sztangą nad głowę", "wyciskanie jm", "dipy na poręczach", "podciąganie na drążku", "pompki na kółkach") and ((e["learning_difficulty"] or 0) >= 3 or e["joint_stress"] != "Niskie"):
        factors.append("wymaga techniki i dużej siły/mobilności")
    neutral = []
    if e["learning_difficulty"] and e["learning_difficulty"] <= 2: neutral.append(f"trudność uczenia {e['learning_difficulty']}")
    neutral.append(f"obciążenie stawów {e['joint_stress'].lower()}")
    if cur is True: prop, conf = (False, "niska") if factors else (True, "wysoka")
    elif cur is False: prop, conf = False, "wysoka"
    else:
        # brak danych: wolno zaproponować TYLKO false (nigdy true)
        if factors and (len(factors) >= 2 or has(n, *PLYO)): prop, conf = False, "wysoka"
        elif factors: prop, conf = False, "niska"
        else: prop, conf = None, "wysoka"
    return cur, prop, conf, factors, neutral

# ---------- złożenie ----------
rows = []
for e in ex:
    eq, other, c_eq, w_eq = equipment_proposal(e)
    det, c_det, w_det = machine_detail(e)
    loc, c_loc, w_loc = location_proposal(e, eq)
    pat, c_pat, w_pat = pattern_proposal(e)
    exe, c_exe, w_exe = execution_proposal(e)
    joints, c_j, w_j = joints_proposal(e)
    lvl, c_lvl, w_lvl = level_proposal(e)
    cur_s, prop_s, c_s, f_s, neutral = suitable_proposal(e)
    reasons, confs = [], []
    def add(label, conf, why):
        confs.append(conf)
        if conf == "niska": reasons.extend(f"{label}: {w}" for w in why)
    add("sprzęt", c_eq, w_eq); add("urządzenie", c_det, w_det); add("miejsce", c_loc, w_loc); add("wzorzec", c_pat, w_pat)
    add("wykonanie", c_exe, w_exe); add("stawy", c_j, w_j); add("poziom", c_lvl, w_lvl)
    if prop_s is False and c_s == "niska": confs.append("niska"); reasons.append("suitableForNoActivity → false: pojedynczy czynnik ryzyka (" + "; ".join(f_s) + ")")
    changes = []
    if set(loc) != set(e["training_location"]): changes.append("miejsce")
    if pat != e["movement_pattern"]: changes.append("wzorzec")
    if exe != e["execution"]: changes.append("wykonanie")
    if lvl != e["difficulty_level"]: changes.append("poziom")
    if prop_s is False and cur_s is not False: changes.append("suitableForNoActivity→false")
    if eq != list(dict.fromkeys(e["equipment"])): changes.append("sprzęt (nowa wartość listy)")
    changes += ["+stawy" if joints else "stawy: puste", "+urządzenie" if det else ""]
    conf = "niska" if "niska" in confs else "wysoka"
    rows.append({
        "id": e["id"], "nazwa": e["name"], "partia_glowna": e["main_muscle_group"], "partie_dodatkowe": "; ".join(e["secondary_muscle_groups"] or []),
        "rola_obecna": e["role"], "rola_propozycja": e["role"],
        "sprzet_obecny": "; ".join(e["equipment"]), "sprzet_propozycja": "; ".join(eq), "urzadzenie_szczegolowo_propozycja": "; ".join(det),
        "miejsce_obecne": "; ".join(dict.fromkeys(e["training_location"])), "miejsce_propozycja": "; ".join(loc),
        "wzorzec_obecny": e["movement_pattern"], "wzorzec_propozycja": pat,
        "wykonanie_obecne": e["execution"], "wykonanie_propozycja": exe,
        "obciazenie_stawow_obecne": e["joint_stress"], "stawy_propozycja": "; ".join(joints),
        "poziom_obecny": e["difficulty_level"], "poziom_propozycja": lvl, "trudnosc_uczenia": e["learning_difficulty"],
        "suitable_obecnie": "brak" if cur_s is None else str(cur_s).lower(),
        "suitable_propozycja": ("false" if prop_s is False else ("brak (bez zmian)" if cur_s is None else str(prop_s).lower())),
        "suitable_czynniki_ryzyka": "; ".join(f_s), "suitable_uwaga": ("nie jest to propozycja ustawienia true; " if prop_s is None else "") + "cechy: " + "; ".join(neutral),
        "pewnosc": conf, "uzasadnienie_przy_niskiej": " | ".join(reasons) if conf == "niska" else "",
        "zmiany": ", ".join(x for x in changes if x),
    })
# paczki po ~25, wg partii głównej i id
order = sorted(rows, key=lambda r: (r["partia_glowna"], r["id"]))
n = len(order); packs = 5
size = -(-n // packs)
for i, r in enumerate(order): r["paczka"] = i // size + 1
rows = sorted(order, key=lambda r: (r["paczka"], r["partia_glowna"], r["id"]))
cols = ["paczka", "id", "nazwa", "partia_glowna", "partie_dodatkowe", "pewnosc", "uzasadnienie_przy_niskiej", "zmiany",
        "rola_obecna", "rola_propozycja", "sprzet_obecny", "sprzet_propozycja", "urzadzenie_szczegolowo_propozycja",
        "miejsce_obecne", "miejsce_propozycja", "wzorzec_obecny", "wzorzec_propozycja", "wykonanie_obecne", "wykonanie_propozycja",
        "obciazenie_stawow_obecne", "stawy_propozycja", "poziom_obecny", "poziom_propozycja", "trudnosc_uczenia",
        "suitable_obecnie", "suitable_propozycja", "suitable_czynniki_ryzyka", "suitable_uwaga"]
with open(sys.argv[2], "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols, delimiter=";"); w.writeheader()
    for r in rows: w.writerow({c: r[c] for c in cols})
json.dump(rows, open(sys.argv[3], "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(len(rows), Counter(r["pewnosc"] for r in rows), Counter(r["paczka"] for r in rows))
