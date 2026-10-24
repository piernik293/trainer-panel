#!/usr/bin/env python3
"""Paczki do przeglądu (po 20): docs/BAZA-PACZKA-NN.csv z kandydatów „nowe”. Kolejność: rozciąganie/rozgrzewka → masa ciała → reszta.
Opisy własne (scripts/baza/opisy.tsv), błędy i uwagi bezpieczeństwa z domyślnych tekstów wg wzorca. suitableForNoActivity i decyzja_trenera PUSTE.
Użycie: paczki_do_przegladu.py <kandydaci.json> <docs>"""
import csv, json, os, sys
here = os.path.dirname(__file__)
cand = {r["zrodlo_id"]: r for r in json.load(open(sys.argv[1]))}
order = json.load(open(os.path.join(here, "kolejnosc_paczek.json")))
op = {}
for l in open(os.path.join(here, "opisy.tsv"), encoding="utf-8"):
    p = l.rstrip("\n").split("|"); op[p[0]] = p[1:]
BLEDY = {
 "Rozciąganie": ("Szarpanie, wstrzymywanie oddechu, rozciąganie na siłę.", "Rozciągaj do wyraźnego, ale komfortowego napięcia. Przy bólu, kłuciu lub drętwieniu przerwij ćwiczenie."),
 "Mobilizacja": ("Zbyt szybkie, nerwowe ruchy i niepełny zakres.", "Ruch w zakresie bez bólu, zacznij od małych ruchów. Przy bólu przerwij ćwiczenie."),
 "Przysiad": ("Kolana zapadające się do środka, odrywanie pięt, zaokrąglone plecy.", "Dobierz zakres i obciążenie do możliwości; przy bólu kolana skróć zakres lub przerwij."),
 "Wykrok": ("Przednie kolano uciekające do środka, pochylony tułów, zbyt krótki krok.", "Zadbaj o równowagę (oparcie w pobliżu); przy bólu kolana skróć zakres lub przerwij."),
 "Zawias biodrowy": ("Zaokrąglone plecy, ruch z pleców zamiast z bioder, zbyt duże obciążenie.", "Zacznij od lekkiego obciążenia, plecy proste; przy bólu pleców przerwij ćwiczenie."),
 "Pchanie poziome": ("Opadające barki, zbyt szeroko rozstawione łokcie, wyginanie dolnych pleców.", "Zadbaj o asekurację przy większym obciążeniu; przy bólu barku lub nadgarstka przerwij."),
 "Pchanie pionowe": ("Wyginanie dolnych pleców, wyciskanie z odchyleniem tułowia, szarpanie.", "Napięty brzuch i pośladki; przy bólu barku przerwij ćwiczenie."),
 "Przyciąganie pionowe": ("Bujanie ciałem, niepełny zakres, unoszenie barków do uszu.", "Użyj gumy lub maszyny wspomagającej, jeśli to zbyt trudne; przy bólu barku lub łokcia przerwij."),
 "Przyciąganie poziome": ("Zaokrąglone plecy, szarpanie, ruch tylko rękami.", "Plecy proste; przy bólu pleców lub barku przerwij ćwiczenie."),
 "Wyprost łokcia": ("Łokcie uciekające na boki, szarpanie, zbyt duże obciążenie.", "Obciążenie dobierz ostrożnie; przy bólu łokcia przerwij."),
 "Zgięcie łokcia": ("Bujanie tułowiem, szarpanie, zbyt duże obciążenie.", "Łokcie przy tułowiu, ruch kontrolowany; przy bólu łokcia przerwij."),
 "Zgięcie/wyprost nadgarstka": ("Zbyt duże obciążenie, ruch z całego przedramienia.", "Obciążenie bardzo lekkie, ruch w zakresie bez bólu; przy bólu nadgarstka przerwij."),
 "Wzruszanie ramion": ("Krążenie barków, unoszenie zamiast ruchu pionowego, zbyt duże obciążenie.", "Obciążenie umiarkowane; przy bólu barku lub szyi przerwij."),
 "Zgięcie tułowia": ("Ciągnięcie głowy rękami, szarpanie, odrywanie dolnych pleców.", "Szyja swobodna; przy bólu pleców lub szyi przerwij ćwiczenie."),
 "Rotacja": ("Szarpanie, zbyt duży zakres obrotu, utrata stabilności.", "Obciążenie lekkie, ruch kontrolowany; przy bólu pleców lub barku przerwij."),
 "Stabilizacja tułowia": ("Opadające biodra, wstrzymywanie oddechu.", "Zakres dopasuj do siły; przy bólu pleców przerwij ćwiczenie."),
 "Odwodzenie": ("Zamach, zbyt duże obciążenie, unoszenie barków.", "Obciążenie lekkie, ruch kontrolowany; przy bólu barku lub biodra przerwij."),
 "Przywodzenie": ("Szarpanie, zbyt szeroki zakres w barku, zbyt duże obciążenie.", "Zakres do komfortu stawów; przy bólu przerwij ćwiczenie."),
 "Zgięcie kolana": ("Unoszenie bioder, szarpanie, zbyt szybki powrót.", "Ruch powolny; przy bólu kolana lub skurczu przerwij ćwiczenie."),
 "Wspięcie na palce": ("Skracanie zakresu, bujanie, zbyt szybkie tempo.", "Pełny zakres, stabilna równowaga; przy bólu łydki lub ścięgna przerwij."),
 "Lokomocja": ("Twarde lądowanie, nierówny rytm, zbyt szybkie tempo kosztem techniki.", "Krótkie serie, miękkie lądowanie; tylko dla średniozaawansowanych i wyżej; przy bólu przerwij."),
}
DEF = ("Pośpiech, utrata napięcia w tułowiu, zbyt duże obciążenie kosztem techniki.", "Zacznij od lekkiego obciążenia; przy bólu przerwij ćwiczenie.")
cols = ["nazwa_PL","nazwa_EN","poziom","rola","sprzęt","wzorzec","mięśnie","stawy","cele","opis","wskazówki","typowe_błędy","uwaga_bezpieczeństwa","suitableForNoActivity","decyzja_trenera"]
for n in range(0, len(order), 20):
    with open(os.path.join(sys.argv[2], "BAZA-PACZKA-%02d.csv" % (n // 20 + 1)), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";"); w.writerow(cols)
        for sid in order[n:n + 20]:
            r = cand[sid]; opis, wsk = op[sid][0], op[sid][1]
            bl, uw = BLEDY.get(r["wzorzec"], DEF)
            if r["rola"] == "rozgrzewka" and r["wzorzec"] != "Mobilizacja": bl, uw = BLEDY["Mobilizacja"]
            w.writerow([r["nazwa_PL"], r["nazwa_EN"], r["poziom"], r["rola"], r["sprzet"], r["wzorzec"], r["miesnie"], r["stawy"], r["cele"], opis, wsk, bl, uw, "", ""])
print(len(order), "pozycji,", (len(order) + 19) // 20, "paczek")

# paczka 06: warianty-zamienniki + wiersze „do potwierdzenia” (One Arm Against Wall, Dumbbell Raise)
op6 = {}
for l in open(os.path.join(here, "opisy_wariantow.tsv"), encoding="utf-8"):
    p = l.rstrip("\n").split("|"); op6[p[0]] = p[1:]
rows6 = [r for r in cand.values() if r["decyzja"] == "wariant"] + [cand["One_Arm_Against_Wall"], cand["Dumbbell_Raise"]]
with open(os.path.join(sys.argv[2], "BAZA-PACZKA-06.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";"); w.writerow(cols)
    for r in rows6:
        opis, wsk = op6[r["zrodlo_id"]]
        bl, uw = BLEDY.get(r["wzorzec"], DEF)
        w.writerow([r["nazwa_PL"], r["nazwa_EN"], r["poziom"], r["rola"], r["sprzet"], r["wzorzec"], r["miesnie"], r["stawy"], r["cele"], opis, wsk, bl, uw, "", ""])
print("paczka 06:", len(rows6), "wierszy")
