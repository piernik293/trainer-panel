"""Reguły mapowania free-exercise-db → nasz standard (docs/KATALOG-STANDARD.md) i decyzje po ręcznym przeglądzie."""
import re

MIESNIE = {"chest":"Klatka piersiowa","lats":"Plecy","middle back":"Plecy","lower back":"Plecy","traps":"Plecy","shoulders":"Barki",
  "biceps":"Biceps","triceps":"Triceps","forearms":"Przedramiona","abdominals":"Brzuch","glutes":"Pośladki",
  "quadriceps":"Mięśnie czworogłowe uda","hamstrings":"Mięśnie dwugłowe uda","calves":"Łydki","abductors":"Odwodziciele",
  "adductors":"Przywodziciele","neck":"Inne"}
SPRZET = {"barbell":"Sztanga","dumbbell":"Hantle","body only":"Masa własnego ciała","cable":"Wyciąg","machine":"Maszyna",
  "kettlebells":"Kettlebell","bands":"Gumy oporowe","exercise ball":"Piłka","e-z curl bar":"Sztanga",
  None:"Masa własnego ciała","other":None,"medicine ball":None,"foam roll":None}
# tylko dla equipment == "other": sprzęt z nazwy (kolejność ma znaczenie)
SPRZET_Z_NAZWY = [
  (r"suspended|\bstraps?\b|trx", "TRX"), (r"\bring", "Kółka gimnastyczne"), (r"trap bar", "Sztanga"),
  (r"parallel bar|\bdips?\b|knee/hip raise", "Poręcze"), (r"\bchin|pull.?up|pulldown|hang", "Drążek"),
  (r"plate", "Talerz obciążeniowy"), (r"hyperextension|back extension", "Ławka"), (r"ab roller", "Inny"),
  (r"stretch|hamstring|groin|quad|bridge|glute", "Masa własnego ciała"),
]
POMIN_KATEGORIE = {"strongman":"strongman — specjalistyczne/ryzykowne, poza zakresem trenera personalnego",
  "olympic weightlifting":"podrzut/rwanie/zarzut — technika olimpijska, wysokie ryzyko",
  "cardio":"cardio — poza katalogiem siłowym (osobny temat)",
  "plyometrics":"pliometria — wysokie obciążenie stawów; mamy 12 własnych ćwiczeń skocznych"}
POMIN_NAZWY = [
  (r"-smr\b|\bsmr\b|foam", "rolowanie (SMR) — poza zakresem"), (r"rope climb|battling|sled|chain|wrist roller|balance board|plate pinch|hand squeeze|otis|london bridge|gironda|rocky",
   "egzotyczny sprzęt lub ćwiczenie specjalistyczne"),
  (r"muscle.?up|kipping|one arm chin|one handed hang|side to side chin", "gimnastyka zaawansowana / wysokie ryzyko barków"),
  (r"behind (the )?(neck|head).*press|press behind|behind neck", "wyciskanie zza głowy — wysokie ryzyko dla barków"),
  (r"\bjump|\bhop\b|\bbound|\bclean\b|snatch|\bjerk\b", "skok/dynamika — zakres pliometrii"),
  (r"balance|bosu", "niestabilne podłoże — ryzyko bez wartości dla początkujących"),
]
POZIOM = {"beginner":"Początkujący","intermediate":"Średniozaawansowany","expert":"Zaawansowany",None:""}
SYNONIMY_TOKENOW = {"dumbell":"dumbbell","db":"dumbbell","bb":"barbell","flye":"fly","flies":"fly","flyes":"fly","pressdown":"pushdown",
  "chinup":"pullup","kb":"kettlebell","laying":"lying","e":"ez","z":"ez"}
WZORCE = [  # (regex na nazwie EN, wzorzec ruchu)
  (r"stretch|hold$|\bpose\b", "Rozciąganie"), (r"wrist (curl|extension)|finger curl", "Zgięcie/wyprost nadgarstka"), (r"shrug", "Wzruszanie ramion"),
  (r"calf|toe press|donkey", "Wspięcie na palce"), (r"leg curl|hamstring curl|glute.ham", "Zgięcie kolana"), (r"leg extension", "Wyprost kolana"),
  (r"lunge|split squat|step.?up", "Wykrok"), (r"squat|leg press|hack", "Przysiad"),
  (r"deadlift|good morning|hip thrust|bridge|pull.?through|swing|hyperextension|back extension|romanian|stiff", "Zawias biodrowy"),
  (r"tricep|skull|pushdown|kickback|close.?grip.*bench|\bdips?\b", "Wyprost łokcia"), (r"curl", "Zgięcie łokcia"),
  (r"pull.?up|\bchin\b|chin.?up|pulldown|pull.?down|pullover", "Przyciąganie pionowe"), (r"\brow|face pull|reverse fly|rear delt", "Przyciąganie poziome"),
  (r"overhead|military|shoulder press|arnold|push press|upright", "Pchanie pionowe"), (r"lateral raise|front raise|side raise|abduct", "Odwodzenie"),
  (r"fly|crossover|adduct|pec deck", "Przywodzenie"), (r"bench|press|push.?up|chest dip", "Pchanie poziome"),
  (r"twist|woodchop|wood chop|rotation", "Rotacja"), (r"crunch|sit.?up|leg raise|knee raise|v.?up|jackknife|flexion", "Zgięcie tułowia"),
  (r"plank|rollout|fallout|hollow|dead bug|bird dog|bear", "Stabilizacja tułowia"), (r"carry|walk|farmer", "Lokomocja"),
]
def rola(x):
    n = x["name"].lower()
    if x["category"] == "stretching": return "rozciąganie"
    if re.search(r"circle|mobil", n): return "rozgrzewka"
    return "główne" if x.get("mechanic") == "compound" else "pomocnicze"
def stawy(wzorzec, x):
    m = {"Przysiad":"Kolano, Biodro","Wykrok":"Kolano, Biodro","Zawias biodrowy":"Biodro, Plecy — dół","Pchanie poziome":"Bark, Łokieć, Nadgarstek",
         "Pchanie pionowe":"Bark, Łokieć","Przyciąganie pionowe":"Bark, Łokieć","Przyciąganie poziome":"Bark, Łokieć","Zgięcie łokcia":"Łokieć",
         "Wyprost łokcia":"Łokieć","Odwodzenie":"Bark","Przywodzenie":"Bark","Zgięcie/wyprost nadgarstka":"Nadgarstek","Wzruszanie ramion":"Bark",
         "Zgięcie kolana":"Kolano","Wyprost kolana":"Kolano","Rotacja":"Plecy — dół","Zgięcie tułowia":"Plecy — dół"}
    return m.get(wzorzec, "")
def cele(x, rec):
    if x["category"] == "stretching": return "sprawność"
    if x["category"] == "powerlifting": return "siła"
    g = []
    comp = x.get("mechanic") == "compound"
    if comp and rec["sprzet"] in ("Sztanga", "Maszyna", "Hantle", "Wyciąg"): g += ["siła", "sylwetka"]
    elif comp: g += ["sprawność", "kondycja"]
    else: g += ["sylwetka"]
    if comp and rec["wzorzec"] in ("Przysiad","Zawias biodrowy","Wykrok","Przyciąganie pionowe","Pchanie poziome","Pchanie pionowe","Przyciąganie poziome"): g.append("redukcja")
    if rec["wzorzec"] in ("Stabilizacja tułowia","Rotacja","Lokomocja"): g += ["sprawność", "sport"]
    if x["level"] == "expert": g.append("sport")
    return ", ".join(dict.fromkeys(g))

# Decyzje po ręcznym przeglądzie par (zrodlo_id → decyzja, nasze_id, pewność, powód).
# D = duplikat naszego id, W = wariant ćwiczenia id, P = pomiń, N = nowe (mimo podobieństwa nazwy)
_D = lambda i, p="wysoka", w="to samo ćwiczenie pod inną nazwą": ("duplikat", i, p, w)
_W = lambda i, p="średnia", w="wariant (chwyt/ustawienie/sprzęt)": ("wariant", i, p, w)
_P = lambda w: ("pomiń", "", "", w)
_N = lambda w="prostszy/inny szczebel niż najbliższe nasze": ("nowe", "", "", w)
_UP = "wiosłowanie do brody — ryzyko dla barków"
_PL = "sztanga z gumami/powerlifting — specjalistyczne"
MANUAL = {
 "Barbell_Full_Squat":_D(3,"średnia"), "Barbell_Bench_Press_-_Medium_Grip":_D(1), "Barbell_Incline_Bench_Press_-_Medium_Grip":_D(114),
 "Barbell_Walking_Lunge":_W(97), "Bodyweight_Squat":_N("brak przysiadu z masą ciała w katalogu — szczebel drabinki"),
 "Bodyweight_Walking_Lunge":_D(97), "Barbell_Hip_Thrust":_D(104), "Barbell_Glute_Bridge":_W(105),
 "Dumbbell_Bicep_Curl":_D(149), "Seated_Dumbbell_Curl":_W(149), "Alternate_Hammer_Curl":_W(150), "Incline_Hammer_Curls":_W(151),
 "Side_Lateral_Raise":_D(140,"średnia"), "Hack_Squat":_D(91), "Hyperextensions_Back_Extensions":_W(183),
 "Seated_Floor_Hamstring_Stretch":_D(332,"średnia"), "Hamstring_Stretch":_W(332), "Seated_Hamstring":_W(332), "Seated_Hamstring_and_Calf_Stretch":_W(332),
 "Quad_Stretch":_D(331,"średnia"), "Standing_Elevated_Quad_Stretch":_W(331), "Kneeling_Hip_Flexor":_D(337),
 "Triceps_Stretch":_D(328,"średnia"), "Overhead_Triceps":_D(328,"średnia"), "Tricep_Side_Stretch":_W(328),
 "Calf_Stretch_Hands_Against_Wall":_D(334), "Calf_Stretch_Elbows_Against_Wall":_W(334), "Standing_Biceps_Stretch":_D(329,"średnia"),
 "Shoulder_Stretch":_D(327,"średnia"), "Standing_Lateral_Stretch":_D(336,"średnia"),
 "Hip_Circles_prone":_W(314), "Standing_Hip_Circles":_D(314,"średnia"), "Wrist_Circles":_D(316,"średnia"), "Elbow_Circles":_D(316,"średnia"),
 "Pull_Through":_D(108), "Single-Leg_Leg_Extension":_W(99), "Standing_Leg_Curl":_W(193), "Glute_Kickback":_W(194),
 "Machine_Bench_Press":_D(115,"średnia"), "Leverage_Chest_Press":_W(115), "Machine_Shoulder_Military_Press":_D(137), "Leverage_Shoulder_Press":_D(137,"średnia"),
 "Machine_Preacher_Curls":_W(152), "Cable_Preacher_Curl":_W(152), "Zottman_Preacher_Curl":_W(188), "Dip_Machine":_D(176,"średnia"),
 "Triceps_Pushdown_-_Rope_Attachment":_D(154), "Reverse_Grip_Triceps_Pushdown":_W(155), "Cable_Rope_Overhead_Triceps_Extension":_D(156),
 "Triceps_Overhead_Extension_with_Rope":_D(156), "Rope_Straight-Arm_Pulldown":_W(135),
 "Reverse_Flyes":_D(144), "Reverse_Machine_Flyes":_D(143), "Decline_Dumbbell_Bench_Press":_D(172), "Decline_Dumbbell_Flyes":_W(178),
 "Incline_Dumbbell_Flyes_-_With_A_Twist":_W(179), "Incline_Push-Up_Medium":_D(116,"średnia"), "Push-Up_Wide":_W(117), "Incline_Push-Up_Wide":_W(116),
 "Suspended_Push-Up":_N("pompki na TRX — brak w katalogu"), "Suspended_Reverse_Crunch":_N("TRX — brak w katalogu"),
 "Pallof_Press_With_Rotation":_W(162), "Front_Barbell_Squat":_D(191), "Front_Barbell_Squat_To_A_Bench":_W(191),
 "Front_Two-Dumbbell_Raise":_D(146,"średnia"), "Front_Incline_Dumbbell_Raise":_W(146), "Dumbbell_Prone_Incline_Curl":_W(151),
 "Flexor_Incline_Dumbbell_Curls":_W(151), "Alternate_Incline_Dumbbell_Curl":_W(151), "Standing_Concentration_Curl":_W(187),
 "High_Cable_Curls":_W(153), "Lying_Cable_Curl":_W(153), "Overhead_Cable_Curl":_W(153), "Reverse_Cable_Curl":_W(153),
 "Cable_Wrist_Curl":_N("nadgarstki na wyciągu"), "Reverse_Barbell_Preacher_Curls":_W(204),
 "Standing_Biceps_Cable_Curl":_D(153,"średnia"), "Standing_One-Arm_Cable_Curl":_W(153),
 "Cable_Russian_Twists":_W(198), "Cable_Reverse_Crunch":_W(164), "Cable_Seated_Crunch":_W(163), "Cable_Seated_Lateral_Raise":_W(141),
 "Calf_Raise_On_A_Dumbbell":_W(109), "Rocking_Standing_Calf_Raise":_W(109), "Standing_Barbell_Calf_Raise":_W(109), "Standing_Dumbbell_Calf_Raise":_W(109),
 "Clock_Push-Up":_P("kosmetyczny/specjalistyczny wariant pompek"), "Crossover_Reverse_Lunge":_W(96), "Decline_Reverse_Crunch":_W(164),
 "External_Rotation":_W(211), "Kettlebell_Pistol_Squat":_W(225), "Smith_Machine_Pistol_Squat":_P("przysiad na jednej nodze na suwnicy — ryzyko dla kolan"),
 "Smith_Machine_Close-Grip_Bench_Press":_W(173), "Smith_Machine_Incline_Bench_Press":_W(173), "Decline_Smith_Press":_W(173), "Smith_Machine_Decline_Press":_W(173),
 "Split_Squats":_N("przysiad split bez uniesionej nogi — prostszy szczebel niż 94"),
 "Speed_Box_Squat":_P(_PL), "Box_Squat_with_Bands":_P(_PL), "Sumo_Deadlift_with_Bands":_P(_PL), "Reverse_Band_Box_Squat":_P(_PL),
 "Reverse_Band_Sumo_Deadlift":_P(_PL), "Rack_Pull_with_Bands":_P(_PL), "Bench_Press_-_With_Bands":_P(_PL), "Bench_Press_-_Powerlifting":_P("technika powerlifting"),
 "Wide-Grip_Barbell_Bench_Press":_W(1), "Wide-Grip_Decline_Barbell_Bench_Press":_W(171), "Barbell_Guillotine_Bench_Press":_P("wyciskanie do szyi — wysokie ryzyko"),
 "Barbell_Hack_Squat":_P("przysiad ze sztangą za nogami — ryzyko dla kolan i pleców"), "Barbell_Squat_To_A_Bench":_W(89), "Barbell_Seated_Calf_Raise":_W(110),
 "Dumbbell_One-Arm_Upright_Row":_P(_UP), "Upright_Barbell_Row":_P(_UP), "Smith_Machine_Upright_Row":_P(_UP), "Smith_Machine_One-Arm_Upright_Row":_P(_UP),
 "Upright_Row_-_With_Bands":_P(_UP), "Smith_Machine_Behind_the_Back_Shrug":_P("szrugsy za plecami — gorsza technika niż nasze 184/222/223"),
 "Barbell_Shrug_Behind_The_Back":_P("szrugsy za plecami — gorsza technika niż nasze 184/222/223"),
 "Dumbbell_Alternate_Bicep_Curl":_W(149), "Cross_Body_Hammer_Curl":_W(150), "Dumbbell_Bench_Press_with_Neutral_Grip":_W(170),
 "One_Arm_Dumbbell_Bench_Press":_W(170), "Lying_Close-Grip_Barbell_Triceps_Press_To_Chin":_W(157), "Close-Grip_EZ_Bar_Curl":_W(148),
 "Close-Grip_Standing_Barbell_Curl":_W(147), "Standing_Dumbbell_Press":_D(4), "Dumbbell_Shoulder_Press":_D(4,"średnia"), "Barbell_Shoulder_Press":_D(186,"średnia"),
 "Cable_Chest_Press":_W(215), "Standing_Cable_Chest_Press":_W(215), "Seated_Cable_Rows":_D(128), "Underhand_Cable_Pulldowns":_D(125),
 "Close-Grip_Front_Lat_Pulldown":_W(123), "One-Arm_Kettlebell_Row":_W(131), "T-Bar_Row_with_Handle":_W(132), "Lying_T-Bar_Row":_D(132,"średnia"),
 "Reverse_Grip_Bent-Over_Rows":_D(181), "Stiff-Legged_Barbell_Deadlift":_W(100), "Hammer_Grip_Incline_DB_Bench_Press":_W(113),
 "Flat_Bench_Lying_Leg_Raise":_W(200), "Hanging_Leg_Raise":_W(165), "Barbell_Ab_Rollout":_W(166), "Barbell_Side_Bend":_W(227),
 "Single-Arm_Cable_Crossover":_W(120), "Smith_Machine_Leg_Press":_P("suwnica Smitha do wypychania — nietypowe, ryzyko dla kolan"),
 "Narrow_Stance_Leg_Press":_W(92), "One_Leg_Barbell_Squat":_P("przysiad jednonóż ze sztangą — wysokie ryzyko"),
 "Wide_Stance_Barbell_Squat":_W(3), "Smith_Machine_Bent_Over_Row":_P("wiosłowanie na suwnicy Smitha w opadzie — nienaturalny tor"),
 "Seated_Palm-Up_Barbell_Wrist_Curl":_D(202,"średnia"), "Palms-Up_Barbell_Wrist_Curl_Over_A_Bench":_D(202,"średnia"),
 "Seated_Palms-Down_Barbell_Wrist_Curl":_D(203,"średnia"), "Reverse_Plate_Curls":_P("egzotyczne użycie talerza"), "Front_Plate_Raise":_P("talerz — mamy unoszenie hantli w przód (146)"),
 "Front_Raise_And_Pullover":_P("złożone, specjalistyczne"), "Dumbbell_Lying_One-Arm_Rear_Lateral_Raise":_W(144), "Dumbbell_Lying_Rear_Lateral_Raise":_W(144),
 "Dumbbell_Squat_To_A_Bench":_W(89), "Dumbbell_Incline_Row":_W(129), "Band_Assisted_Pull-Up":_W(126), "Wide-Grip_Rear_Pull-Up":_P("podciąganie za kark — ryzyko dla barków"),
 "Scapular_Pull-Up":_N("ruch łopatek w zwisie — szczebel przygotowawczy do podciągania"),
}

WZORZEC_RECZNY = {"Alternate_Heel_Touchers":"Zgięcie tułowia","Bent-Knee_Hip_Raise":"Zgięcie tułowia","Cross_Over_-_With_Bands":"Przywodzenie",
 "Dumbbell_Scaption":"Odwodzenie","Elbow_to_Knee":"Rotacja","Flutter_Kicks":"Zgięcie tułowia","Hip_Extension_with_Bands":"Zawias biodrowy",
 "Hip_Lift_with_Band":"Zawias biodrowy","Kettlebell_Halo":"Mobilizacja","Rack_Pulls":"Zawias biodrowy","Standing_Cable_Lift":"Rotacja"}

# poprawki roli/wzorca po drugiej kontroli (źródło klasyfikuje część ćwiczeń jako stretching)
ROLA_RECZNA = {"Ankle_Circles":"rozgrzewka","Knee_Circles":"rozgrzewka","Inchworm":"rozgrzewka","Worlds_Greatest_Stretch":"rozgrzewka",
 "Dynamic_Back_Stretch":"rozgrzewka","Dynamic_Chest_Stretch":"rozgrzewka","Kettlebell_Halo":"rozgrzewka","Side_Leg_Raises":"pomocnicze","Split_Squats":"główne"}
WZORZEC_RECZNY.update({"Side_Leg_Raises":"Odwodzenie","Split_Squats":"Wykrok","Ankle_Circles":"Mobilizacja","Knee_Circles":"Mobilizacja","Inchworm":"Mobilizacja",
 "Worlds_Greatest_Stretch":"Mobilizacja","Dynamic_Back_Stretch":"Mobilizacja","Dynamic_Chest_Stretch":"Mobilizacja"})

# A2: bezpieczne podstawy pliometrii — tylko poziom średniozaawansowany/zaawansowany, cele sport/kondycja, nigdy początkujący/brak aktywności
# id źródła → (nazwa PL, wzorzec, sprzęt, stawy, uwaga)
PLIO = {
 "Fast_Skipping":("Skip A (szybki bieg z wysokim kolanem)","Lokomocja","Masa własnego ciała","Kolano, Biodro","niski wpływ, nauka rytmu"),
 "Box_Skip":("Skip na niskie podwyższenie","Lokomocja","Masa własnego ciała","Kolano, Biodro","niski podest, kontrola lądowania"),
 "Split_Jump":("Wypad skokowy (zmiana nóg w powietrzu)","Wykrok","Masa własnego ciała","Kolano, Biodro","po opanowaniu wykroku"),
 "Freehand_Jump_Squat":("Przysiad z wyskokiem","Przysiad","Masa własnego ciała","Kolano, Biodro","po opanowaniu przysiadu i lądowania"),
 "Star_Jump":("Skok „gwiazda”","Lokomocja","Masa własnego ciała","Kolano","niski, kondycyjny"),
 "Double_Leg_Butt_Kick":("Skoki z piętami do pośladków","Lokomocja","Masa własnego ciała","Kolano","niski, kondycyjny"),
 "Carioca_Quick_Step":("Kroki bokiem z krzyżowaniem (carioca)","Lokomocja","Masa własnego ciała","Kolano, Biodro","zwinność"),
 "Mountain_Climbers":("Wspinaczka w podporze (mountain climbers)","Lokomocja","Masa własnego ciała","Bark, Nadgarstek","kondycja, podpór — uwaga na nadgarstki"),
 "Overhead_Slam":("Rzut piłką lekarską o ziemię znad głowy","Zgięcie tułowia","Piłka lekarska","Bark, Plecy — dół","wymaga nowej wartości sprzętu"),
 "Medicine_Ball_Chest_Pass":("Podanie piłki lekarskiej z klatki","Pchanie poziome","Piłka lekarska","Bark, Łokieć","wymaga nowej wartości sprzętu"),
 "Medicine_Ball_Scoop_Throw":("Wyrzut piłki lekarskiej z dołu do przodu","Zawias biodrowy","Piłka lekarska","Biodro, Plecy — dół","wymaga nowej wartości sprzętu"),
 "Backward_Medicine_Ball_Throw":("Wyrzut piłki lekarskiej za siebie","Zawias biodrowy","Piłka lekarska","Biodro, Plecy — dół","wymaga nowej wartości sprzętu"),
}
PLIO_DUP = {"Front_Box_Jump":253,"Bench_Jump":253,"Standing_Long_Jump":251,"Lateral_Bound":257,"Single-Leg_Hop_Progression":255,"Single-Leg_Lateral_Hop":254,"Linear_Depth_Jump":252}

# A3: maks. 30 wariantów jako zamienniki (id źródła → powód wyboru); pozostałe warianty = „pomiń (wariant kosmetyczny)”
WARIANTY_ZAMIENNIKI = {
 "Band_Assisted_Pull-Up":"guma zamiast maszyny wspomagającej (126) — zamiennik i szczebel do podciągania",
 "Standing_Leg_Curl":"maszyna zamiast wyciągu (193)", "Seated_Cable_Shoulder_Press":"wyciąg zamiast maszyny (137)",
 "Machine_Preacher_Curls":"maszyna zamiast sztangi/hantli (152)", "Kettlebell_Pistol_Squat":"kettlebell jako przeciwwaga ułatwiająca przysiad jednonóż (225)",
 "Kettlebell_Overhead_Triceps_Extension":"kettlebell zamiast hantla (190)", "Reverse_Cable_Curl":"wyciąg zamiast sztangi (204)",
 "Standing_Dumbbell_Reverse_Curl":"hantle zamiast sztangi (204)", "Cable_Russian_Twists":"wyciąg zamiast masy ciała (198)",
 "Cable_Reverse_Crunch":"wyciąg zamiast ławki (164)", "Cable_Lying_Triceps_Extension":"wyciąg zamiast sztangi EZ (157)",
 "Chair_Squat":"przysiad do krzesła — szczebel dla brak aktywności (90)", "Single_Leg_Glute_Bridge":"mostek jednonóż — kolejny szczebel po 105",
 "Ring_Dips":"kółka gimnastyczne zamiast poręczy (175), zaawansowany", "Smith_Machine_Calf_Raise":"suwnica Smitha zamiast maszyny/hantli (109)",
 "Calf_Press":"maszyna do łydek na suwnicy zamiast stania (109)", "Standing_Barbell_Calf_Raise":"sztanga zamiast maszyny/hantli (109)",
 "Barbell_Seated_Calf_Raise":"sztanga zamiast maszyny (110)", "Barbell_Step_Ups":"sztanga zamiast hantli/masy ciała (98)",
 "Barbell_Walking_Lunge":"sztanga zamiast hantli (97)", "Hyperextensions_Back_Extensions":"ławka rzymska zamiast masy ciała (183)",
 "One-Legged_Cable_Kickback":"wyciąg zamiast hantla (189)", "Standing_Overhead_Barbell_Triceps_Extension":"sztanga zamiast wyciągu (156)",
 "Smith_Machine_Close-Grip_Bench_Press":"suwnica Smitha zamiast sztangi (158)", "One-Arm_Kettlebell_Row":"kettlebell zamiast hantla (131)",
 "Kettlebell_One-Legged_Deadlift":"jednonóż — kolejny szczebel po 103", "Natural_Glute_Ham_Raise":"masa ciała zamiast maszyny (141)",
 "Glute_Kickback":"masa ciała zamiast wyciągu (194)", "Barbell_Ab_Rollout":"sztanga zamiast kółka do brzucha (166)",
}

SPRZET_RECZNY = {"Chair_Squat":"Masa własnego ciała"}
