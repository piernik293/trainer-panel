#!/usr/bin/env python3
"""Buduje docs/KATALOG-PROPOZYCJA.md z JSON-a wygenerowanego przez katalog-propozycja.py. Użycie: <prop.json> <wyjście.md>"""
import json, sys, collections
r = json.load(open(sys.argv[1], encoding="utf8"))
conf = collections.Counter(x["pewnosc"] for x in r)
ch = collections.Counter(c for x in r for c in x["zmiany"].split(", ") if c)
packs = collections.defaultdict(list)
for x in r: packs[x["paczka"]].append(x)
suit = collections.Counter(x["suitable_propozycja"] for x in r)
MACHINES = ["Suwnica 45° (prasa do nóg)", "Hack squat", "Suwnica Smitha", "Maszyna do prostowania nóg", "Maszyna do uginania nóg", "Maszyna odwodzenia nóg", "Maszyna przywodzenia nóg", "Maszyna Pec Deck (motylek)", "Maszyna do wyciskania (klatka)", "Maszyna wspomagająca (podciąganie/dipy)", "T-bar", "Wyciąg górny", "Wyciąg dolny", "Brama (crossover)", "Wyciąg — lina", "Wyciąg — drążek", "Wyciąg — uchwyt jednorącz", "Maszyna do łydek (stojąc/siedząc)"]
md = f'''# Propozycja uzupełnienia metadanych 126 starszych ćwiczeń (do przeglądu)

Status: **tylko propozycja** — baza, seed i kod aplikacji niezmienione. Dane w `docs/KATALOG-PROPOZYCJA.csv` (separator `;`, UTF-8 z BOM, otwiera się w Excelu/LibreOffice). Standard: `docs/KATALOG-STANDARD.md`. Generatory: `scripts/katalog-propozycja.py` (CSV) i `scripts/katalog-propozycja-md.py` (ten plik); czytają eksport z SELECT i niczego nie zapisują.

## Decyzje właściciela (23.10.2026) — uwzględnione
1. `false` w `suitableForNoActivity` tylko przy czynnikach ryzyka, reszta pusta do oceny właściciela.
2. Nowe wzorce ruchu: **„Wzruszanie ramion”** (szrugsy) i **„Zgięcie/wyprost nadgarstka”** (ćwiczenia nadgarstków).
3. „Inny” w sprzęcie zastąpiony nowymi wartościami zamkniętej listy: **„Talerz obciążeniowy”** (Svend Press), **„Uchwyty do pompek”**, **„Kółka gimnastyczne”**.

## Zakres
126 ćwiczeń ze statusem „do_weryfikacji” sprzed listy rozgrzewki: 125 zwykłych (role główne/pomocnicze) + „Band Pull-Apart” (id 209, rola rozgrzewka). We wszystkich 126 `suitableForNoActivity` jest dziś puste („brak”).

## suitableForNoActivity
- **Nigdzie nie proponuję `true`.** Kolumny `suitable_obecnie` (dziś: brak dla wszystkich) i `suitable_propozycja` (tylko „brak (bez zmian)” albo `false`). Test `katalog-propozycja.test.ts` pilnuje, że `true` się nie pojawi.
- `false` dla ćwiczeń z czynnikami ryzyka dla osób nieaktywnych: trudność uczenia ≥ 4, wysokie obciążenie stawów, skoki/lądowanie albo ćwiczenie wymagające techniki i siły (przy trudności ≥ 3 lub średnim/wysokim obciążeniu stawów). Pewność „wysoka” przy ≥ 2 czynnikach lub plyometrii, „niska” przy jednym.
- `suitable_czynniki_ryzyka` wymienia powody, `suitable_uwaga` — neutralne cechy (informacja do Twojej decyzji, **nie** sugestia `true`).
- Propozycja: **{suit['false']} × false**, {suit['brak (bez zmian)']} × bez zmian (brak).

## Podsumowanie propozycji
| Pewność | Liczba |
|---|---|
| wysoka | {conf['wysoka']} |
| niska (z uzasadnieniem w CSV) | {conf['niska']} |

| Zmiana | Ćwiczeń |
|---|---|
| nowe: stawy obciążane (`joint_stress_areas`) | {ch['+stawy']} (pozostałe {ch['stawy: puste']} — bez wyraźnego stawu z listy, do potwierdzenia) |
| nowe: urządzenie szczegółowo (`equipment_detail`) | {ch['+urządzenie']} |
| miejsce treningu | {ch['miejsce']} |
| wzorzec ruchu (w tym nowe wartości) | {ch['wzorzec']} |
| wykonanie (jedno-/obustronne) | {ch['wykonanie']} |
| poziom trudności | {ch['poziom']} |
| sprzęt: nowa wartość listy zamiast „Inny” | {ch['sprzęt (nowa wartość listy)']} |
| suitableForNoActivity → false | {ch['suitableForNoActivity→false']} |

Rola (`główne`/`pomocnicze`) bez zmian (wynika z typu Złożone/Izolowane); sprzęt z zamkniętej listy jest już poprawny we wszystkich wierszach.

## Jak powstały propozycje
- **Stawy:** słowa kluczowe w nazwie (przysiad/wykrok/skoki → kolano; martwy ciąg/hip thrust → biodro i plecy dół; wyciskanie/pompki/dipy/rozpiętki/podciąganie → bark; uginanie/prostowanie ramion, dipy → łokieć; pompki i ćwiczenia nadgarstków → nadgarstek). Lista: Kolano, Biodro, Plecy — dół, Bark, Łokieć, Nadgarstek.
- **Urządzenia (zamknięta lista):** {', '.join(MACHINES)}.
- **Miejsce:** maszyny i wyciągi tylko Siłownia; sztanga Siłownia; ćwiczenia z masą ciała, gumami, drążkiem, poręczami także Dom/Plener (poręcze i drążek bez Domu); sprzęt przenośny (talerz, uchwyty, kółka) bez zmian.
- **Poziom:** z trudności uczenia i obciążenia stawów; każda różnica względem dzisiejszego poziomu to „niska pewność” (ocena trenera).

## Paczki do przeglądu (po ~25)
Podział wg partii głównej i id. Pełne dane w CSV, kolumna `paczka`.
'''
for p in sorted(packs):
    rows = packs[p]
    md += f"\n### Paczka {p} ({len(rows)} ćwiczeń: id {min(x['id'] for x in rows)}–{max(x['id'] for x in rows)})\n\n| id | Ćwiczenie | Partia | Pewność | Zmiany | suitable |\n|---|---|---|---|---|---|\n"
    for x in rows:
        md += f"| {x['id']} | {x['nazwa']} | {x['partia_glowna']} | {x['pewnosc']} | {x['zmiany']} | {x['suitable_propozycja']} |\n"
md += '''
## Dalej (po zatwierdzeniu paczek)
Migracja danych (osobne zadanie, `pg_dump` przed, tylko kolumny nullable / uzupełnienie wartości) i aktualizacja seedu. Nowe wartości list (wzorce, sprzęt) dochodzą do `exercise-constants.ts` i standardu razem z migracją. `true` w `suitableForNoActivity` może nadać wyłącznie właściciel, ćwiczenie po ćwiczeniu.
'''
open(sys.argv[2], "w", encoding="utf8").write(md)
