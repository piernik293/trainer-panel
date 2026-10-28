#!/usr/bin/env python3
"""Uzupełnienie obciążenia stawów (decyzja 3b, 28.10.2026): dla WSZYSTKICH aktywnych ćwiczeń bez kompletnych danych wylicza `joint_stress` i `joint_stress_areas`
wg KATALOG-STANDARD (Niskie/Średnie/Wysokie; stawy: Kolano, Biodro, Plecy — dół, Bark, Łokieć, Nadgarstek). NIE nadpisuje istniejących wartości (poziomu ani stawów).
Przy niepewności wybiera WYŻSZE obciążenie. Wynik: docs/STAWY-UZUPELNIENIE.csv, lib/db/migrations/0059_stawy_uzupelnienie.sql, scripts/stawy-uzupelnienie-cofnij.sql.
Tylko odczyt z bazy (DATABASE_URL). Użycie: scripts/stawy-uzupelnienie.py"""
import csv, json, os, re, subprocess, collections

url = os.environ["DATABASE_URL"]
def q(sql):
    out = subprocess.run(["psql", url, "-At", "-c", sql], capture_output=True, text=True, check=True).stdout
    return [json.loads(l) for l in out.splitlines() if l.strip()]
rows = q("""select row_to_json(t) from (select id, name, main_muscle_group as main, secondary_muscle_groups as sec, equipment, coalesce(difficulty_level,'') as diff,
  coalesce(movement_pattern,'') as pat, coalesce(role,'') as role, coalesce(exercise_type,'') as type, coalesce(intensity,'') as inten, learning_difficulty as learn,
  joint_stress as level, joint_stress_areas as areas, coalesce(execution,'') as exec, coalesce(unilateral,false) as uni, is_active, hidden from exercises where is_active order by id) t""")

LVL = {"Niskie": 0, "Średnie": 1, "Wysokie": 2}; NAME = ["Niskie", "Średnie", "Wysokie"]
BW = {"Masa własnego ciała", "Brak sprzętu", "Gumy oporowe", "Roller", "Ławka", "Ławeczka treningowa", "Uchwyty do pompek", "Kółka gimnastyczne", "Piłka stabilizacyjna (bosu/fit)"}
def loadclass(e):
    eq = set(e["equipment"] or [])
    if not eq or eq <= BW: return "bw"
    if eq & {"Sztanga", "Sztanga i talerze", "Sztanga łamana (EZ)", "Klatka / Power rack", "Landmine"} and not (eq & BW): return "barbell"
    if eq & {"Maszyna", "Wyciąg", "TRX / pasy treningowe"} and not (eq & {"Hantle", "Kettlebell"}): return "machine"
    return "free"

def lacks(e):
    lv = (e["level"] or "").strip()
    if not lv: return True
    if e["areas"] is None: return True
    return len(e["areas"]) == 0 and lv != "Niskie"

# kalibracja: najczęstszy znany poziom w grupie (wzorzec, klasa obciążenia, trudność); przy remisie wyższy
known = collections.defaultdict(collections.Counter)
for e in rows:
    if e["level"]: known[(e["pat"], loadclass(e), e["diff"])][e["level"]] += 1
def calib(e):
    c = known.get((e["pat"], loadclass(e), e["diff"]))
    if not c or sum(c.values()) < 2: return None
    best = max(c.items(), key=lambda kv: (kv[1], LVL[kv[0]]))
    return best[0]

HIGH = re.compile(r"martwy ciąg|przysiad ze sztang|zercher|front squat|przysiad przedni|pistol|nordic|muscle|stani[eu] na rękach|jednorącz|łucznik|archer|bułgarski|wyskok|skok|zeskok|burpee|snatch|clean|rwanie|podrzut|bounds|plyo|hang |good morning", re.I)
MID = re.compile(r"nad głow|zza głowy|dipy|podciąg|wiosłowanie sztang|przyciąganie sztang|rumuński|wykrok|przysiad|wspinaczk|rotacj|skręt|brzuszki|sit-up|scyzoryk|v-up|unoszenie nóg|rowerek|nożyce|plank|deska|pompk|wznosy tułowia|superman|ab wheel|rollout|hip thrust|mostek", re.I)

def level_of(e):
    why = []
    lv = 0
    if e["role"] in ("rozciąganie", "rozgrzewka"):
        if re.search(r"skok|pajac|wyskok|bieg|sprint|burpee", e["name"], re.I): lv = 1; why.append("rozgrzewka z elementem skoku/biegu")
        else: why.append("rozciąganie/mobilizacja")
    else:
        if e["inten"]: lv = 2; why.append("pliometria")
        if e["diff"] == "Zaawansowany": lv = max(lv, 2); why.append("trudność Zaawansowany")
        elif e["diff"] == "Średniozaawansowany": lv = max(lv, 1); why.append("trudność Średniozaawansowany")
        lc = loadclass(e)
        compound = e["type"] == "Złożone"
        lower_or_press = e["pat"] in ("Przysiad", "Wykrok", "Zawias biodrowy", "Pchanie poziome", "Pchanie pionowe", "Przyciąganie pionowe", "Przyciąganie poziome")
        if compound and lc in ("free", "machine") and lower_or_press: lv = max(lv, 1); why.append("złożone z obciążeniem")
        if lc == "barbell" and compound: lv = max(lv, 2 if e["pat"] in ("Przysiad", "Zawias biodrowy", "Wykrok") else 1); why.append("sztanga, ruch złożony")
        if e["uni"] and lc != "bw" and e["pat"] in ("Przysiad", "Wykrok", "Zawias biodrowy"): lv = max(lv, 1); why.append("jednostronne z obciążeniem")
        if e["learn"] is not None and e["learn"] >= 5: lv = max(lv, 2); why.append("trudność uczenia 5")
        elif e["learn"] is not None and e["learn"] >= 4: lv = max(lv, 1); why.append("trudność uczenia 4")
        if HIGH.search(e["name"]) and not re.search(r"rumuński", e["name"], re.I): lv = max(lv, 2 if e["diff"] != "Początkujący" else 1); why.append("nazwa: ruch wysokiego ryzyka")
        elif MID.search(e["name"]): lv = max(lv, 1 if (e["diff"] != "Początkujący" or lc != "bw" or e["pat"] in ("Zgięcie tułowia", "Rotacja")) else 0); 
        if e["pat"] in ("Zgięcie tułowia", "Rotacja") and MID.search(e["name"]): lv = max(lv, 1); why.append("zgięcie/rotacja tułowia")
    if not e["level"]:
        c = calib(e)
        if c and LVL[c] > lv: lv = LVL[c]; why.append(f"jak podobne ćwiczenia ({c})")
    return lv, why

def areas_of(e):
    n = e["name"].lower(); a = []
    def add(*x):
        for j in x:
            if j not in a: a.append(j)
    p, m = e["pat"], e["main"]
    if e["inten"] or re.search(r"skok|pajac|wyskok|bieg|sprint|skip|carioca", n): add("Kolano", "Biodro")
    if p in ("Przysiad", "Wykrok"): add("Kolano", "Biodro")
    if p == "Zawias biodrowy": add("Biodro", "Plecy — dół")
    if p == "Pchanie poziome": add("Bark", "Łokieć", "Nadgarstek")
    if p == "Pchanie pionowe": add("Bark", "Łokieć")
    if p in ("Przyciąganie poziome", "Przyciąganie pionowe"): add("Bark", "Łokieć")
    if p == "Zgięcie łokcia": add("Łokieć")
    if p == "Wyprost łokcia":
        add("Łokieć")
        if re.search(r"nad głow|zza głowy|francusk", n): add("Bark")
    if p in ("Odwodzenie", "Przywodzenie"):
        add("Bark") if m in ("Barki",) else add("Biodro")
    if p in ("Zgięcie tułowia", "Anti-ekstensja", "Anti-rotacja", "Stabilizacja tułowia", "Rotacja"): add("Plecy — dół")
    if p in ("Zgięcie kolana", "Wyprost kolana"): add("Kolano")
    if p == "Wspięcie na palce": add("Kolano")
    if re.search(r"spięci\w* brzucha|brzuszk|unoszenie nóg|rowerek|nożyce|scyzoryk|wznosy tułowia|wyprosty tułowia|przechylanie miednicy|rotacje rosyjskie|skłon", n): add("Plecy — dół")
    if re.search(r"monster walk|wejście na podest|step-up|wykrok|przysiad|podest", n): add("Kolano", "Biodro")
    if re.search(r"inchworm", n): add("Bark", "Nadgarstek", "Plecy — dół")
    if re.search(r"halo|szrug|face pull|rozpiętk|unoszenie ramion|unoszenie ramienia|wznosy ramion", n): add("Bark")
    if re.search(r"plank|deska|pompk|podpór|wspinaczk|burpee|dead bug|bird dog|crawl|inchworm|dipy", n): add("Bark", "Nadgarstek")
    if re.search(r"rotacj\w* (zewn|wewn)\w* barku|barku", n): add("Bark")
    if e["role"] in ("rozciąganie", "rozgrzewka") or p in ("Mobilizacja", "Rozciąganie", "Oddychanie", "Inne", "Aktywacja", "Lokomocja"):
        if re.search(r"kolan|rzepk", n): add("Kolano")
        if re.search(r"biodr|pośladk|uda|ud\b|czworogł|dwugł|przywodz|odwodz|pachwin", n): add("Biodro")
        if re.search(r"bark|ramię|ramion|klatk|rozpiętk|rękami", n): add("Bark")
        if re.search(r"łokc|przedramien", n): add("Łokieć")
        if re.search(r"nadgarst|dłon|przedramien", n): add("Nadgarstek")
        if re.search(r"kręgosłup|plecy|pleców|lędźw|skłon|skręt|tułow|boczn", n): add("Plecy — dół")
        if re.search(r"całego ciała|mobilizacja", n): add("Bark", "Biodro", "Plecy — dół")
        if re.search(r"\bnóg\b", n): add("Kolano", "Biodro")
        if re.search(r"górnej części ciała", n): add("Bark", "Plecy — dół")
    mobility = e["role"] in ("rozciąganie", "rozgrzewka") or p in ("Oddychanie", "Mobilizacja", "Rozciąganie")
    if not a and not mobility:  # z partii mięśniowej (nie dla rozciągania, mobilizacji i oddechu: tam brak stawu z listy jest prawdą)
        by = {"Klatka piersiowa": ["Bark", "Łokieć"], "Barki": ["Bark"], "Triceps": ["Łokieć"], "Biceps": ["Łokieć"], "Plecy": ["Bark", "Łokieć"], "Przedramiona": ["Łokieć", "Nadgarstek"],
              "Mięśnie czworogłowe uda": ["Kolano", "Biodro"], "Mięśnie dwugłowe uda": ["Kolano", "Biodro"], "Pośladki": ["Biodro"], "Odwodziciele": ["Biodro"], "Przywodziciele": ["Biodro"],
              "Łydki": ["Kolano"], "Brzuch": ["Plecy — dół"], "Całe ciało": ["Kolano", "Biodro", "Bark"]}
        add(*by.get(m, []))
        if a: pass
    return a

ORDER = ["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"]
out = []; stats = collections.Counter()
for e in rows:
    if not lacks(e): continue
    had_level, had_areas = e["level"], e["areas"]
    lv, why = level_of(e) if not e["level"] else (LVL[e["level"]], [])
    new_level = e["level"] or NAME[lv]
    new_areas = list(had_areas) if had_areas else []
    derived = False
    if had_areas is None or len(new_areas) == 0:  # pusta lista przy braku danych = nieznane, nie „brak stawów”
        new_areas = [j for j in ORDER if j in areas_of(e)]
        derived = bool(new_areas) or had_areas is None
    # nigdy puste stawy przy poziomie wyższym niż Niskie (przy niepewności: partia mięśniowa)
    if not new_areas and new_level != "Niskie":
        new_areas = ["Kolano", "Biodro"] if e["main"].startswith("Mięśnie") else ["Bark", "Łokieć"]; why.append("brak jednoznacznych stawów — przyjęto najbliższe (ostrożnie)")
    # brak stawów i poziom Niskie: dopuszczalne tylko dla rozciągania szyi itp.; jeśli wyliczyliśmy cokolwiek, zapisz
    chg = []
    if not had_level: chg.append(f"poziom: {NAME[lv]}")
    if derived: chg.append("stawy: z wzorca ruchu i nazwy")
    if had_level and derived and LVL[had_level] < lv and e["role"] not in ("rozciąganie", "rozgrzewka"):
        why.append(f"UWAGA: istniejący poziom {had_level} jest niższy niż wynikałoby z reguł — zostawiono (nie nadpisuję)")
    out.append(dict(id=e["id"], name=e["name"], areas=new_areas, level=new_level, set_level=not had_level, set_areas=derived,
                    reason="; ".join(why + chg) + f" | było: poziom={had_level or 'brak'}, stawy={'brak' if had_areas is None else had_areas}"))
    stats[(new_level, "poziom ustawiony" if not had_level else "poziom był")] += 1

root = os.path.join(os.path.dirname(__file__), "..")
with open(os.path.join(root, "docs/STAWY-UZUPELNIENIE.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["id", "nazwa", "stawy", "poziom obciążenia", "powód"])
    for r in out: w.writerow([r["id"], r["name"], ", ".join(r["areas"]) or "brak (rozciąganie bez stawów z listy)", r["level"], r["reason"]])
def arr(xs): return "ARRAY[" + ",".join("'" + x.replace("'", "''") + "'" for x in xs) + "]::text[]"
values = ",\n".join(f"  ({r['id']}, {'NULL' if not r['set_level'] else repr(r['level']).replace(chr(34), chr(39))}, {arr(r['areas'])}, {'true' if r['set_areas'] else 'false'})" for r in out)
sql = f"""-- Uzupełnienie obciążenia stawów (decyzja 3b właściciela, 28.10.2026; lista z uzasadnieniem: docs/STAWY-UZUPELNIENIE.csv). Migracja DANYCH, addytywna i odwracalna.
-- Wypełnia TYLKO brakujące pola (poziom obciążenia i/lub lista stawów) u {len(out)} aktywnych ćwiczeń; nie nadpisuje istniejących wartości; przy niepewności wyższe obciążenie.
-- Jednorazowość: db-setup uruchamia wszystkie migracje za każdym razem, więc stosujemy tylko do id bez kopii zapasowej 0059. Cofnięcie: scripts/stawy-uzupelnienie-cofnij.sql.
CREATE TABLE IF NOT EXISTS catalogue_joint_backup (
  id serial PRIMARY KEY,
  migration text NOT NULL,
  exercise_id integer NOT NULL,
  joint_stress text,
  joint_stress_areas text[],
  saved_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_joint_backup_idx ON catalogue_joint_backup (migration, exercise_id);

CREATE TEMP TABLE joint_fill (id integer, lvl text, areas text[], set_areas boolean);
INSERT INTO joint_fill (id, lvl, areas, set_areas) VALUES
{values};

CREATE TEMP TABLE joint_fill_todo AS
SELECT f.id FROM joint_fill f JOIN exercises e ON e.id = f.id
WHERE f.id NOT IN (SELECT exercise_id FROM catalogue_joint_backup WHERE migration = '0059');
INSERT INTO catalogue_joint_backup (migration, exercise_id, joint_stress, joint_stress_areas)
SELECT '0059', e.id, e.joint_stress, e.joint_stress_areas FROM exercises e WHERE e.id IN (SELECT id FROM joint_fill_todo)
ON CONFLICT (migration, exercise_id) DO NOTHING;
UPDATE exercises e SET
  joint_stress = COALESCE(NULLIF(e.joint_stress, ''), f.lvl),
  joint_stress_areas = CASE WHEN f.set_areas THEN f.areas ELSE e.joint_stress_areas END,
  updated_at = now()
FROM joint_fill f WHERE f.id = e.id AND e.id IN (SELECT id FROM joint_fill_todo);
"""
open(os.path.join(root, "lib/db/migrations/0059_stawy_uzupelnienie.sql"), "w").write(sql)
open(os.path.join(root, "scripts/stawy-uzupelnienie-cofnij.sql"), "w").write("""-- COFNIĘCIE migracji 0059 (obciążenie stawów). Nie jest częścią migracji; uruchamiaj ręcznie po pg_dump. Przywraca stare wartości z catalogue_joint_backup.
UPDATE exercises e SET joint_stress = b.joint_stress, joint_stress_areas = b.joint_stress_areas, updated_at = now()
FROM catalogue_joint_backup b WHERE b.migration = '0059' AND b.exercise_id = e.id;
""")
print("do uzupełnienia:", len(out), dict(collections.Counter(r["level"] for r in out)), "poziom ustawiony:", sum(r["set_level"] for r in out), "stawy ustawione:", sum(r["set_areas"] for r in out))
