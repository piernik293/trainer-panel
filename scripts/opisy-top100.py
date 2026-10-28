#!/usr/bin/env python3
"""Opisy i wskazówki dla klienta (top 100 ćwiczeń + top 20 rozgrzewek + top 20 schłodzeń; blok 2 nocy 29.10.2026).
Teksty: scripts/opisy/czesc1.py, czesc2.py. Waliduje je (długość, żargon, angielskie wtręty, formy zależne od płci), pisze docs/OPISY-TOP100.csv („było → jest”),
lib/db/migrations/0061_opisy_top100.sql (kopia starych tekstów, jednorazowa, po `slug`, bo id różnią się między bazami) i scripts/opisy-top100-cofnij.sql.
Dane „było” z kopii katalogu w schemacie `sim` (odczyt). Użycie: scripts/opisy-top100.py [--check]"""
import csv, json, os, re, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(here, "opisy"))
from czesc1 import T1; from czesc2 import T2
TEXTS = {**T1, **T2}
sel = json.load(open(os.path.expanduser("~/logs/top-ids.json")))
url = os.environ["DATABASE_URL"]; test = url.rsplit("/", 1)[0] + "/trainer_panel_test"
def q(db, sql):
    out = subprocess.run(["psql", db, "-At", "-F", "\x1f", "-c", sql], capture_output=True, text=True, check=True).stdout
    return [l.split("\x1f") for l in out.splitlines()]
ids = sorted({i for v in sel.values() for i in v})
cur = {r[1]: dict(sim_id=int(r[0]), name=r[2], desc=r[3], how=r[4], tips=r[5], mist=r[6]) for r in q(test, f"select id, slug, name, coalesce(description,''), coalesce(execution_instructions,''), coalesce(coaching_tips,''), coalesce(common_mistakes,'') from sim.exercises where id in ({','.join(map(str, ids))})")}
group = {}
for k, label in (("main", "ćwiczenie (top 100)"), ("warm", "rozgrzewka (top 20)"), ("cool", "schłodzenie (top 20)")):
    for i in sel[k]:
        s = [s for s, c in cur.items() if c["sim_id"] == i][0]
        group.setdefault(s, []).append(label)
app_id = {r[0]: int(r[1]) for r in q(url, "select slug, id from exercises")}

EN = re.compile(r"\b(core|range of motion|ROM|tempo|reps|set|sets|bar|rack|press|pull|push|swing|squat|deadlift|row|cable|lockout|spotter|hip|glute|lats|warm-?up|cool-?down|drive|brace|bracing|tension|flare|cue|setup|stance|grip|kettlebell|dumbbell|band)\b", re.I)
JARGON = re.compile(r"excentry|koncentry|izometry|ekscentry|\bROM\b|zakres ruchu|stabilizacj|propriocep|aktywacj|protrakcj|retrakcj|lordoz|kifoz|neutraln\w+ pozycj|supinac|pronac|mobilizacj|izolacj|kompleks|hipertrofi|\bRIR\b|\bRPE\b|latissimus|trapez|naramienn|czworogłow|kulszowo|przywodzicie|odwodzicie|tułów w linii neutral", re.I)
GENDER = re.compile(r"\b\w+(łeś|łaś|łem|łam)\b|\b\w+ł(a)?(byś|abyś)\b|\b\w+(ł|ła)by(m|ś)\b", re.I)
NOUNS = {"tyłem", "krzesłem", "ciałem", "stołem", "kołem", "hasłem", "łokciem"}  # rzeczowniki w narzędniku, nie czasowniki w pierwszej osobie
def sents(t): return [x for x in re.split(r"(?<=[.!?])\s+", t.strip()) if x]
problems = []
for slug, (opis, how, tips, mist) in TEXTS.items():
    h = how if how is not None else cur[slug]["how"]
    chk = {"opis": opis, "instrukcja": h, "wskazówki": tips, "błąd": mist}
    if not (1 <= len(sents(opis)) <= 2) or len(opis) > 200: problems.append((slug, "opis: 1–2 zdania, do 200 znaków", len(opis)))
    if not (2 <= len(sents(tips)) <= 3): problems.append((slug, "wskazówki: 2–3 zdania", len(sents(tips))))
    if len(sents(mist)) != 1: problems.append((slug, "błąd: dokładnie 1 zdanie", len(sents(mist))))
    if len(sents(h)) > 4: problems.append((slug, "instrukcja: do 4 zdań", len(sents(h))))
    for f, t in chk.items():
        for rx, label in ((EN, "angielskie słowo"), (JARGON, "żargon"), (GENDER, "forma zależna od płci")):
            m = next((x for x in rx.finditer(t) if x.group(0).lower() not in NOUNS), None)
            if m: problems.append((slug, f"{f}: {label}", m.group(0)))
        if re.search(r"[Ѐ-ӿ]", t): problems.append((slug, f"{f}: znak spoza alfabetu łacińskiego", ""))
if problems:
    for p in problems: print("PROBLEM", *p)
    sys.exit(1)
print("walidacja OK:", len(TEXTS), "pozycji")
if "--check" in sys.argv: sys.exit(0)

root = os.path.join(here, "..")
changed = 0
with open(os.path.join(root, "docs/OPISY-TOP100.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["id", "nazwa", "grupa", "opis: było", "opis: jest", "instrukcja: było", "instrukcja: jest", "wskazówki: było", "wskazówki: jest", "błąd: było", "błąd: jest", "decyzja właściciela"])
    for slug, (opis, how, tips, mist) in TEXTS.items():
        c = cur[slug]; h = how if how is not None else c["how"]
        w.writerow([app_id.get(slug, ""), c["name"], ", ".join(group[slug]), c["desc"], opis, c["how"], h, c["tips"], tips, c["mist"], mist, ""])
        changed += 1
def lit(s): return "$t$" + s + "$t$"
vals = ",\n".join(f"  ({lit(slug)}, {lit(o)}, {lit(h) if h is not None else 'NULL'}, {lit(t)}, {lit(m)})" for slug, (o, h, t, m) in TEXTS.items())
sql = f"""-- Opisy i wskazówki dla klienta: top 100 ćwiczeń + top 20 rozgrzewek + top 20 schłodzeń ({len(TEXTS)} pozycji; blok 2 nocy 29.10.2026; „było → jest”: docs/OPISY-TOP100.csv).
-- Migracja DANYCH, addytywna i odwracalna: kopia starych tekstów w catalogue_text_backup; wybór po `slug` (id różnią się między bazami); nie zmienia nazw.
-- Jednorazowość: db-setup uruchamia wszystkie migracje za każdym razem, więc stosujemy tylko do ćwiczeń bez kopii 0061. Cofnięcie: scripts/opisy-top100-cofnij.sql.
CREATE TABLE IF NOT EXISTS catalogue_text_backup (
  id serial PRIMARY KEY,
  migration text NOT NULL,
  exercise_id integer NOT NULL,
  description text,
  execution_instructions text,
  coaching_tips text,
  common_mistakes text,
  saved_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_text_backup_idx ON catalogue_text_backup (migration, exercise_id);

CREATE TEMP TABLE text_fill (slug text, descr text, how text, tips text, mist text);
INSERT INTO text_fill (slug, descr, how, tips, mist) VALUES
{vals};

CREATE TEMP TABLE text_fill_todo AS
SELECT e.id, f.slug FROM text_fill f JOIN exercises e ON e.slug = f.slug
WHERE e.id NOT IN (SELECT exercise_id FROM catalogue_text_backup WHERE migration = '0061');
INSERT INTO catalogue_text_backup (migration, exercise_id, description, execution_instructions, coaching_tips, common_mistakes)
SELECT '0061', e.id, e.description, e.execution_instructions, e.coaching_tips, e.common_mistakes FROM exercises e WHERE e.id IN (SELECT id FROM text_fill_todo)
ON CONFLICT (migration, exercise_id) DO NOTHING;
UPDATE exercises e SET description = f.descr, execution_instructions = COALESCE(f.how, e.execution_instructions), coaching_tips = f.tips, common_mistakes = f.mist, updated_at = now()
FROM text_fill f WHERE f.slug = e.slug AND e.id IN (SELECT id FROM text_fill_todo);
"""
open(os.path.join(root, "lib/db/migrations/0061_opisy_top100.sql"), "w").write(sql)
open(os.path.join(here, "opisy-top100-cofnij.sql"), "w").write("""-- COFNIĘCIE migracji 0061 (opisy i wskazówki): przywraca stare teksty z catalogue_text_backup. Nie jest częścią migracji; uruchamiaj ręcznie po pg_dump.
UPDATE exercises e SET description = b.description, execution_instructions = b.execution_instructions, coaching_tips = b.coaching_tips, common_mistakes = b.common_mistakes, updated_at = now()
FROM catalogue_text_backup b WHERE b.migration = '0061' AND b.exercise_id = e.id;
""")
print("zapisano CSV i migrację:", changed, "pozycji")
