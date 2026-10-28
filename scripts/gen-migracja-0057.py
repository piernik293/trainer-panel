#!/usr/bin/env python3
"""Generuje lib/db/migrations/0057_katalog_decyzje.sql i scripts/katalog-decyzje-cofnij.sql z pliku decyzji właściciela (PRZEGLAD-KATALOGU-rekomendacje.csv).
Reguła pliku: kolumna „TWOJA DECYZJA”, a gdy pusta — „MOJA REKOMENDACJA”; „PROPOZYCJA Claude” jest nieważna. Użycie: scripts/gen-migracja-0057.py <plik.csv>"""
import csv, sys, os, re, collections

rows = list(csv.reader(open(sys.argv[1], encoding="utf-8-sig"), delimiter=";"))
dec = collections.OrderedDict()
for r in rows[1:151]:
    r += [""] * (10 - len(r))
    d = r[9].strip() or r[6].strip()
    assert d in ("zatwierdź", "tylko od P", "tylko od Ś", "ukryj"), (r[0], d)
    dec[int(r[0])] = (d, r[1])
# Wyjątki od pliku (decyzja „zostaw bezpieczniej”): id → (decyzja stosowana, powód). Zapisane też w docs/DO-DECYZJI.md.
EXCEPTIONS = {89: ("tylko od P", "Przysiad do skrzyni (sztanga/hantle/kettlebell, złożone, obciążenie stawów średnie) jest na liście „nie promować dla BA” z wcześniejszej decyzji i testu; uzasadnienie w pliku opisuje ćwiczenie izolowane/maszynowe")}
for i, (d, why) in EXCEPTIONS.items():
    assert i in dec and dec[i][0] == "zatwierdź"
    dec[i] = (d, dec[i][1])
groups = collections.defaultdict(list)
for i, (d, n) in dec.items(): groups[d].append(i)
all_ids = list(dec)
ids = lambda l: ", ".join(map(str, sorted(l)))

# 11 nowych ćwiczeń (12 z sekcji 2 pliku minus „Unoszenie prostych nóg w zwisie”, które już istnieje jako id 1262)
LOC = "ARRAY['Siłownia','Dom','Plener']"
def arr(xs): return "ARRAY[" + ",".join("'" + x.replace("'", "''") + "'" for x in xs) + "]::text[]"
LEVELS = {"Początkujący": ["Początkujący", "Średniozaawansowany", "Zaawansowany"], "Średniozaawansowany": ["Średniozaawansowany", "Zaawansowany"], "Zaawansowany": ["Zaawansowany"]}
CPLX = {1: "Prosta", 2: "Umiarkowana", 3: "Umiarkowana", 4: "Złożona", 5: "Złożona"}
NEW = [
 dict(slug="zwis-na-drazku", name="Zwis na drążku", main="Plecy", sec=["Biceps", "Przedramiona", "Barki"], eq=["Drążek"], req=[], eqo=None, diff="Początkujący", pat="Przyciąganie pionowe", type="Izolowane", role="pomocnicze", learn=1, stress="Średnie", areas=["Bark", "Łokieć"], unilateral=False, base=1102,
  desc="Zwis na drążku na prostych rękach z lekko ściągniętymi łopatkami. Przygotowuje chwyt i barki do podciągania.",
  how="Chwyć drążek nachwytem na szerokość barków. Zwiśnij na prostych rękach, nogi oderwane od podłogi lub lekko ugięte. Ściągnij łopatki lekko w dół i utrzymaj pozycję 10–30 sekund.",
  mist="Barki podciągnięte do uszu, bujanie ciałem, wstrzymywanie oddechu.", tips="Zacznij od krótkich zwisów i dokładaj sekundy. Oddychaj spokojnie. Łatwiej: stopy na podłodze i część ciężaru na nogach.",
  safety="Użyj stabilnego drążka, który udźwignie Twój ciężar. Przerwij przy bólu barku lub łokcia. Wykonuj w komfortowym zakresie.", dur=20, goals=["Poprawa sprawności", "Zwiększenie siły"],
  ladder=("Kalistenika: podciąganie", 1, "Początkujący")),
 dict(slug="negatywy-podciagniecia", name="Negatywy podciągnięcia", main="Plecy", sec=["Biceps", "Barki", "Przedramiona"], eq=["Drążek"], req=[], eqo="Podpórka lub skok, żeby wejść nad drążek", diff="Średniozaawansowany", pat="Przyciąganie pionowe", type="Złożone", role="główne", learn=3, stress="Średnie", areas=["Bark", "Łokieć"], unilateral=False, base=2,
  desc="Wejdź nad drążek (ze skoku lub z podpórki) i opuszczaj ciało powoli, 3–5 sekund, aż do pełnego zwisu. Buduje siłę do pierwszego podciągnięcia.",
  how="Ustaw się nad drążkiem z brodą powyżej niego (wskocz lub użyj podpórki). Opuszczaj ciało powoli przez 3–5 sekund do pełnego wyprostu rąk. Zejdź z drążka, wróć na górę i powtórz.",
  mist="Zbyt szybkie opadanie, bujanie ciałem, niepełny zwis na dole.", tips="Licz sekundy w głowie. Łopatki aktywne przez cały ruch. Mało powtórzeń, ale wolno.",
  safety="Użyj stabilnego drążka. Kontroluj opadanie i nie puszczaj drążka w dole. Przy bólu barku lub łokcia przerwij.", dur=None, goals=["Zwiększenie siły", "Budowa sylwetki", "Poprawa sprawności"],
  ladder=("Kalistenika: podciąganie", 3, "Średniozaawansowany")),
 dict(slug="podciaganie-lucznik-archer", name="Podciąganie łucznik (archer)", main="Plecy", sec=["Biceps", "Barki", "Przedramiona"], eq=["Drążek"], req=[], eqo=None, diff="Zaawansowany", pat="Przyciąganie pionowe", type="Złożone", role="główne", learn=5, stress="Wysokie", areas=["Bark", "Łokieć"], unilateral=True, base=2,
  desc="Podciąganie z naciskiem na jedną rękę, druga prosta w bok. Wersja przejściowa do podciągania jednorącz.",
  how="Chwyć drążek szeroko. Podciągnij się w stronę jednej ręki, druga zostaje prosta i prowadzi tylko pomocniczo. Opuść się powoli i zmień stronę.",
  mist="Zginanie ręki pomocniczej, bujanie, niepełny zakres ruchu.", tips="Najpierw opanuj szerokie podciągnięcia. Zaczynaj od małej różnicy w obciążeniu rąk.",
  safety="Ćwiczenie bardzo wymagające dla barków i łokci. Wykonuj tylko po opanowaniu zwykłego podciągania, przy bólu przerwij.", dur=None, goals=["Zwiększenie siły", "Poprawa sprawności"],
  ladder=("Kalistenika: podciąganie", 8, "Zaawansowany")),
 dict(slug="negatywy-dipow", name="Negatywy dipów", main="Klatka piersiowa", sec=["Triceps", "Barki"], eq=["Poręcze"], req=[], eqo=None, diff="Średniozaawansowany", pat="Pchanie poziome", type="Złożone", role="główne", learn=3, stress="Średnie", areas=["Bark", "Łokieć"], unilateral=False, base=175,
  desc="Wejdź w górną pozycję na poręczach i opuszczaj ciało powoli, 3–5 sekund, do ugięcia łokci. Przygotowuje do pełnych dipów.",
  how="Wejdź na poręcze na prostych rękach. Opuszczaj ciało powoli przez 3–5 sekund, łokcie lekko do tyłu. Zejdź na dole i wróć na górę bez wypychania.",
  mist="Zbyt szybkie opadanie, barki wciągnięte do uszu, zbyt głęboki zakres bez kontroli.", tips="Klatka lekko w przód, łopatki aktywne. Schodź tylko tak nisko, jak potrafisz kontrolować.",
  safety="Użyj stabilnych poręczy. Nie schodź głębiej, niż pozwala bark bez bólu. Przy bólu przerwij.", dur=None, goals=["Zwiększenie siły", "Budowa sylwetki"],
  ladder=("Kalistenika: dipy", 2, "Średniozaawansowany")),
 dict(slug="dipy-z-guma", name="Dipy z gumą", main="Klatka piersiowa", sec=["Triceps", "Barki"], eq=["Poręcze"], req=["Poręcze", "Gumy oporowe"], eqo="Guma oporowa zawieszona nad poręczami lub założona pod kolanami", diff="Średniozaawansowany", pat="Pchanie poziome", type="Złożone", role="główne", learn=3, stress="Średnie", areas=["Bark", "Łokieć"], unilateral=False, base=175,
  desc="Dipy na poręczach z gumą pod kolanami, która odciąża ruch na dole. Pozwala robić pełne powtórzenia, zanim wystarczy siły na dipy bez pomocy.",
  how="Zaczep gumę o poręcze i załóż ją pod kolana lub stopy. Opuść ciało, łokcie lekko do tyłu, i wypchnij się w górę. Im cieńsza guma, tym mniej pomocy.",
  mist="Zbyt głęboki zakres bez kontroli, odbijanie się od gumy, barki wciągnięte do uszu.", tips="Z czasem zmniejszaj opór gumy. Kontroluj tempo opadania.",
  safety="Sprawdź, czy guma jest zaczepiona pewnie. Użyj stabilnych poręczy. Przy bólu barku lub łokcia przerwij.", dur=None, goals=["Zwiększenie siły", "Budowa sylwetki"],
  ladder=("Kalistenika: dipy", 3, "Średniozaawansowany")),
 dict(slug="dipy-z-obciazeniem", name="Dipy z obciążeniem", main="Klatka piersiowa", sec=["Triceps", "Barki"], eq=["Poręcze"], req=["Poręcze"], eqo="Pas z obciążeniem albo hantel zaciśnięta między stopami", diff="Zaawansowany", pat="Pchanie poziome", type="Złożone", role="główne", learn=4, stress="Wysokie", areas=["Bark", "Łokieć"], unilateral=False, base=175,
  desc="Dipy na poręczach z dodatkowym ciężarem na pasie. Dla osób, które mają mocne dipy bez obciążenia.",
  how="Zapnij pas z obciążeniem lub zaciśnij hantel między stopami. Opuść ciało kontrolowanie, łokcie lekko do tyłu, i wypchnij się w górę do pełnego wyprostu.",
  mist="Zbyt duży ciężar, skrócony zakres ruchu, odbijanie się na dole.", tips="Zaczynaj od niewielkiego ciężaru i zwiększaj powoli. Technika ważniejsza niż obciążenie.",
  safety="Obciążenie zwiększaj stopniowo. Użyj stabilnych poręczy. Przy bólu barku lub łokcia przerwij.", dur=None, goals=["Zwiększenie siły", "Budowa sylwetki"],
  ladder=("Kalistenika: dipy", 6, "Zaawansowany")),
 dict(slug="pompki-lucznik-archer", name="Pompki łucznik (archer)", main="Klatka piersiowa", sec=["Triceps", "Barki"], eq=["Masa własnego ciała"], req=[], eqo=None, diff="Zaawansowany", pat="Pchanie poziome", type="Złożone", role="główne", learn=4, stress="Wysokie", areas=["Bark", "Łokieć", "Nadgarstek"], unilateral=True, base=117,
  desc="Pompka z przeniesieniem ciężaru na jedną rękę, druga prosta w bok. Wersja przejściowa do pompki jednorącz.",
  how="Ustaw ręce szeroko. Opuszczaj się w stronę jednej ręki, druga zostaje prosta. Wypchnij się i zmień stronę.",
  mist="Zginanie ręki pomocniczej, opadające biodra, niepełny zakres.", tips="Zaczynaj od niewielkiego przeniesienia ciężaru. Ciało w jednej linii.",
  safety="Wymagające dla barków, łokci i nadgarstków. Wykonuj po opanowaniu zwykłych pomp, przy bólu przerwij.", dur=None, goals=["Zwiększenie siły", "Poprawa sprawności"],
  ladder=("Kalistenika: pompki", 11, "Zaawansowany")),
 dict(slug="wioslowanie-australijskie-nogi-proste", name="Wiosłowanie australijskie — nogi proste", main="Plecy", sec=["Biceps", "Barki"], eq=["Drążek", "Kółka gimnastyczne", "TRX / pasy treningowe"], req=[], eqo="Nisko zawieszony drążek, kółka lub taśmy", diff="Średniozaawansowany", pat="Przyciąganie poziome", type="Złożone", role="główne", learn=3, stress="Średnie", areas=["Bark", "Łokieć"], unilateral=False, base=1089,
  desc="Podciąganie w poziomie pod niskim drążkiem z prostymi nogami opartymi na piętach. Trudniejsze niż wersja z ugiętymi kolanami.",
  how="Połóż się pod niskim drążkiem i chwyć go nachwytem. Nogi proste, pięty na podłodze, ciało w jednej linii. Przyciągnij klatkę do drążka i opuść się powoli.",
  mist="Opadające biodra, wysuwanie głowy, niepełny ruch.", tips="Biodra wysoko, łopatki do siebie. Łatwiej: ugnij kolana. Trudniej: nogi wyżej.",
  safety="Użyj stabilnego drążka lub kółek. Wykonuj w komfortowym zakresie. Przy bólu przerwij.", dur=None, goals=["Zwiększenie siły", "Budowa sylwetki", "Poprawa sprawności"],
  ladder=("Kalistenika: wiosłowanie", 4, "Średniozaawansowany")),
 dict(slug="wioslowanie-australijskie-nogi-wyzej-lub-na-kolkach", name="Wiosłowanie australijskie — nogi wyżej lub na kółkach", main="Plecy", sec=["Biceps", "Barki"], eq=["Kółka gimnastyczne", "Drążek"], req=[], eqo="Podwyższenie pod stopy (ławka, krzesło)", diff="Zaawansowany", pat="Przyciąganie poziome", type="Złożone", role="główne", learn=4, stress="Średnie", areas=["Bark", "Łokieć"], unilateral=False, base=1089,
  desc="Podciąganie w poziomie z nogami na podwyższeniu albo na kółkach gimnastycznych. Najtrudniejsza wersja wiosłowania australijskiego.",
  how="Połóż się pod drążkiem lub kółkami, nogi proste oparte na podwyższeniu. Ciało w jednej linii, przyciągnij klatkę do drążka lub kółek i opuść się powoli.",
  mist="Opadające biodra, bujanie, niepełny zakres.", tips="Im wyżej nogi, tym trudniej. Na kółkach łokcie blisko ciała.",
  safety="Upewnij się, że podwyższenie i kółka są stabilne. Przy bólu barku lub łokcia przerwij.", dur=None, goals=["Zwiększenie siły", "Poprawa sprawności"],
  ladder=("Kalistenika: wiosłowanie", 5, "Zaawansowany")),
 dict(slug="toes-to-bar", name="Toes to bar", main="Brzuch", sec=["Przedramiona", "Barki"], eq=["Drążek"], req=[], eqo=None, diff="Zaawansowany", pat="Zgięcie tułowia", type="Izolowane", role="pomocnicze", learn=5, stress="Wysokie", areas=["Bark", "Plecy — dół"], unilateral=False, base=165,
  desc="W zwisie na drążku unoszenie stóp aż do dotknięcia drążka. Mocne ćwiczenie na brzuch i chwyt.",
  how="Zwiśnij na drążku, nogi razem. Unieś proste nogi i dotknij stopami drążka, potem opuść je powoli bez bujania.",
  mist="Bujanie całym ciałem, zbyt szybkie opuszczanie, ugięte ręce.", tips="Najpierw opanuj unoszenie prostych nóg w zwisie. Kontroluj ruch w dół.",
  safety="Wymaga mocnego chwytu i barków. Użyj stabilnego drążka, przy bólu przerwij.", dur=None, goals=["Poprawa sprawności", "Zwiększenie siły"],
  ladder=("Kalistenika: brzuch w zwisie", 4, "Zaawansowany")),
 dict(slug="pistol-z-podparciem", name="Pistol z podparciem", main="Mięśnie czworogłowe uda", sec=["Pośladki", "Mięśnie dwugłowe uda"], eq=["Masa własnego ciała"], req=[], eqo="Drążek, ściana lub poręcz do podparcia ręką", diff="Zaawansowany", pat="Przysiad", type="Złożone", role="główne", learn=4, stress="Wysokie", areas=["Kolano", "Biodro"], unilateral=True, base=225,
  desc="Przysiad na jednej nodze z podparciem ręką o drążek lub ścianę. Krok przed pistoletem bez pomocy.",
  how="Stań na jednej nodze, drugą wyciągnij przed siebie. Przytrzymaj się drążka lub ściany i zejdź w przysiad, kolano ustawione nad stopą. Wróć na górę.",
  mist="Kolano uciekające do środka, odrywanie pięty, zbyt mocne podciąganie się rękami.", tips="Mniej pomocy z każdym tygodniem. Wolne opuszczanie.",
  safety="Wymagające dla kolana i biodra. Schodź tylko tak głęboko, jak pozwala komfort. Przy bólu przerwij.", dur=None, goals=["Zwiększenie siły", "Poprawa sprawności"],
  ladder=("Kalistenika: nogi", 8, "Zaawansowany")),
]
META = {'zwis-na-drazku': ('Pull', 'Strzałkowa', 1, 1), 'negatywy-podciagniecia': ('Pull', 'Strzałkowa', 3, 4), 'podciaganie-lucznik-archer': ('Pull', 'Strzałkowa', 4, 4), 'negatywy-dipow': ('Pchanie', 'Poprzeczna', 3, 4), 'dipy-z-guma': ('Pchanie', 'Poprzeczna', 2, 3), 'dipy-z-obciazeniem': ('Pchanie', 'Poprzeczna', 4, 4), 'pompki-lucznik-archer': ('Pchanie', 'Poprzeczna', 3, 3), 'wioslowanie-australijskie-nogi-proste': ('Pull', 'Strzałkowa', 3, 3), 'wioslowanie-australijskie-nogi-wyzej-lub-na-kolkach': ('Pull', 'Strzałkowa', 3, 4), 'toes-to-bar': ('Core', 'Strzałkowa', 4, 3), 'pistol-z-podparciem': ('Przysiad', 'Strzałkowa', 3, 4)}  # movement_category, plane_of_motion, neurological_fatigue, doms_potential (jak u ćwiczeń bazowych)
EXIST_LADDER = [("Kalistenika: brzuch w zwisie", 2, "Średniozaawansowany", 1262)]  # istniejące ćwiczenie z sekcji 2 podpięte do drabinki

def sql(s): return "'" + s.replace("'", "''") + "'"
out = []
out.append("""-- Decyzje właściciela po przeglądzie katalogu (28.10.2026, PRZEGLAD-KATALOGU-rekomendacje.csv): migracja DANYCH, addytywna i odwracalna.
-- 1) kopia starych wartości (tabela catalogue_decision_backup) dla wszystkich id z pliku; 2) zatwierdzenia wg decyzji; 3) 11 nowych ćwiczeń kalistenicznych
-- (12 z sekcji 2 pliku minus „Unoszenie prostych nóg w zwisie” — już istnieje jako id 1262) z przypisaniem mięśni skopiowanym od ćwiczenia bazowego
-- i podpięciem do drabinek. Wyjątek od pliku: id 89 zostaje „tylko od P” (patrz docs/DO-DECYZJI.md). Cofnięcie: scripts/katalog-decyzje-cofnij.sql. Nie zmienia nazw, nie usuwa nic. suitable_for_no_activity = true tylko dla id z listy „zatwierdź”.
CREATE TABLE IF NOT EXISTS catalogue_decision_backup (
  id serial PRIMARY KEY,
  migration text NOT NULL,
  exercise_id integer NOT NULL,
  suitable_for_no_activity boolean,
  reviewed_by_trainer boolean,
  verification_status text,
  hidden boolean,
  difficulty_level text,
  saved_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_decision_backup_idx ON catalogue_decision_backup (migration, exercise_id);
""")
out.append(f"""-- Jednorazowość: db-setup uruchamia wszystkie migracje za każdym razem, więc decyzje stosujemy tylko do id, które nie mają jeszcze kopii zapasowej 0057
-- (późniejsze zmiany właściciela w katalogu nie zostaną nadpisane przy kolejnym uruchomieniu).
CREATE TEMP TABLE catalogue_decision_todo AS
SELECT id FROM exercises WHERE id IN ({ids(all_ids)}) AND id NOT IN (SELECT exercise_id FROM catalogue_decision_backup WHERE migration = '0057');
INSERT INTO catalogue_decision_backup (migration, exercise_id, suitable_for_no_activity, reviewed_by_trainer, verification_status, hidden, difficulty_level)
SELECT '0057', id, suitable_for_no_activity, reviewed_by_trainer, verification_status, hidden, difficulty_level FROM exercises
WHERE id IN (SELECT id FROM catalogue_decision_todo)
ON CONFLICT (migration, exercise_id) DO NOTHING;
""")
out.append(f"""-- zatwierdź ({len(groups['zatwierdź'])}): zatwierdzone przez trenera, dostępne od BA
UPDATE exercises SET reviewed_by_trainer = true, verification_status = 'zweryfikowane', suitable_for_no_activity = true, updated_at = now()
WHERE id IN ({ids(groups['zatwierdź'])}) AND id IN (SELECT id FROM catalogue_decision_todo);
-- tylko od P ({len(groups['tylko od P'])}): zatwierdzone, bez dostępu dla BA
UPDATE exercises SET reviewed_by_trainer = true, verification_status = 'zweryfikowane', suitable_for_no_activity = false, updated_at = now()
WHERE id IN ({ids(groups['tylko od P'])}) AND id IN (SELECT id FROM catalogue_decision_todo);
-- tylko od Ś ({len(groups['tylko od Ś'])}): zatwierdzone, bez dostępu dla P i BA (reguła trudności wymusza poziom; „Dipy na podłodze” miały trudność Początkujący — podniesiona do Średniozaawansowany wg Twojej wcześniejszej decyzji)
UPDATE exercises SET reviewed_by_trainer = true, verification_status = 'zweryfikowane', suitable_for_no_activity = false, updated_at = now()
WHERE id IN ({ids(groups['tylko od Ś'])}) AND id IN (SELECT id FROM catalogue_decision_todo);
UPDATE exercises SET difficulty_level = 'Średniozaawansowany', updated_at = now() WHERE id = 1629 AND difficulty_level = 'Początkujący' AND id IN (SELECT id FROM catalogue_decision_todo);
""")
if groups["ukryj"]:
    out.append(f"UPDATE exercises SET hidden = true, updated_at = now() WHERE id IN ({ids(groups['ukryj'])}) AND id IN (SELECT id FROM catalogue_decision_todo);\n")
for e in NEW:
    cols = dict(
        name=sql(e["name"]), slug=sql(e["slug"]), main_muscle_group=sql(e["main"]), secondary_muscle_groups=arr(e["sec"]), equipment=arr(e["eq"]), required_equipment_all=arr(e["req"]),
        equipment_other=sql(e["eqo"]) if e["eqo"] else "NULL", training_location=arr(["Siłownia", "Dom", "Plener"]), difficulty_level=sql(e["diff"]), movement_pattern=sql(e["pat"]),
        description=sql(e["desc"]), execution_instructions=sql(e["how"]), common_mistakes=sql(e["mist"]), coaching_tips=sql(e["tips"]), exercise_type=sql(e["type"]),
        safety_notes=sql(e["safety"]), suitable_experience_levels=arr(LEVELS[e["diff"]]), training_goals=arr(e["goals"]), execution=sql("Jednostronne" if e["unilateral"] else "Obustronne"),
        requires_spotter="false", can_be_performed_to_failure=sql("Nie"), joint_stress=sql(e["stress"]), learning_difficulty=str(e["learn"]), exercise_priority=sql("Średni"),
        suitable_for_no_activity="false", movement_complexity=sql(CPLX[e["learn"]]), is_active="true", role=sql(e["role"]), verification_status=sql("zweryfikowane"),
        joint_stress_areas=arr(e["areas"]), source=sql("own"), review_batch=sql("katalog-decyzje-0057"), reviewed_by_trainer="true", hidden="false", unilateral="true" if e["unilateral"] else "false",
    )
    mc, pl, nf, dp = META[e["slug"]]
    cols.update(movement_category=sql(mc), plane_of_motion=sql(pl), neurological_fatigue=str(nf), doms_potential=str(dp), resistance_type=sql("Masa własnego ciała"))
    if e["dur"]: cols["default_duration_seconds"] = str(e["dur"])
    names = ", ".join(cols); vals = ", ".join(cols.values())
    out.append(f"-- {e['name']} ({e['diff']}, baza przypisań mięśni: id {e['base']})\nINSERT INTO exercises ({names})\nSELECT {vals}\nWHERE NOT EXISTS (SELECT 1 FROM exercises WHERE slug = {sql(e['slug'])});")
    out.append(f"""INSERT INTO exercise_muscle_assignments (exercise_id, specific_muscle_id, is_primary, coefficient)
SELECT n.id, a.specific_muscle_id, a.is_primary, a.coefficient FROM exercises n JOIN exercise_muscle_assignments a ON a.exercise_id = {e['base']}
WHERE n.slug = {sql(e['slug'])} AND NOT EXISTS (SELECT 1 FROM exercise_muscle_assignments z WHERE z.exercise_id = n.id);""")
    p, step, lvl = e["ladder"]
    out.append(f"""INSERT INTO exercise_ladder_steps (pattern, step_order, level, exercise_id)
SELECT {sql(p)}, {step}, {sql(lvl)}, id FROM exercises WHERE slug = {sql(e['slug'])}
ON CONFLICT (pattern, exercise_id) DO NOTHING;
""")
for p, step, lvl, xid in EXIST_LADDER:
    out.append(f"""INSERT INTO exercise_ladder_steps (pattern, step_order, level, exercise_id)
SELECT {sql(p)}, {step}, {sql(lvl)}, id FROM exercises WHERE id = {xid}
ON CONFLICT (pattern, exercise_id) DO NOTHING;
""")
dst = os.path.join(os.path.dirname(__file__), "../lib/db/migrations/0057_katalog_decyzje.sql")
open(dst, "w").write("\n".join(out))

rb = f"""-- COFNIĘCIE migracji 0057 (katalog po decyzjach właściciela). Nie jest częścią migracji (nie uruchamia się automatycznie); uruchamiaj ręcznie po pg_dump.
-- Przywraca stare wartości z catalogue_decision_backup, a 11 dodanych ćwiczeń ukrywa i dezaktywuje (nic nie usuwa).
UPDATE exercises e SET suitable_for_no_activity = b.suitable_for_no_activity, reviewed_by_trainer = b.reviewed_by_trainer, verification_status = b.verification_status,
  hidden = b.hidden, difficulty_level = b.difficulty_level, updated_at = now()
FROM catalogue_decision_backup b WHERE b.migration = '0057' AND b.exercise_id = e.id;
UPDATE exercises SET hidden = true, is_active = false, updated_at = now() WHERE review_batch = 'katalog-decyzje-0057';
"""
open(os.path.join(os.path.dirname(__file__), "katalog-decyzje-cofnij.sql"), "w").write(rb)
print({k: len(v) for k, v in groups.items()}, "nowych:", len(NEW))
