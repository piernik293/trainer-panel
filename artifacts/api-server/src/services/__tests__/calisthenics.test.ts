import { describe, it, expect } from "vitest";
import {
  calisthenicsActive, calisthenicsDays, calisthenicsLadderRows, calisthenicsLevelAllows, calisthenicsPlyoRule, capCalisthenicsDay,
  isCalisthenicsExercise, stationsFor, calisthenicsEquipmentText, CALISTHENICS_LADDERS, NO_PULL_STATION_NOTE,
} from "../calisthenics";

describe("flag", () => {
  it("the style counts only with the flag on AND the style asked for", () => {
    expect(calisthenicsActive("calisthenics", {})).toBe(false);
    expect(calisthenicsActive("calisthenics", { CALISTHENICS_ENABLED: "0" })).toBe(false);
    expect(calisthenicsActive("standard", { CALISTHENICS_ENABLED: "1" })).toBe(false);
    expect(calisthenicsActive(undefined, { CALISTHENICS_ENABLED: "1" })).toBe(false);
    expect(calisthenicsActive("calisthenics", { CALISTHENICS_ENABLED: "1" })).toBe(true);
  });
});

describe("equipment whitelist", () => {
  it("body weight, bar, parallel bars, rings, bands are fine; anything else is out", () => {
    expect(isCalisthenicsExercise({ equipment: ["Masa własnego ciała"] })).toBe(true);
    expect(isCalisthenicsExercise({ equipment: ["Drążek"] })).toBe(true); // alias of "Drążek do podciągania"
    expect(isCalisthenicsExercise({ equipment: ["Drążek", "Poręcze"] })).toBe(true);
    expect(isCalisthenicsExercise({ equipment: ["Kółka gimnastyczne"] })).toBe(true);
    expect(isCalisthenicsExercise({ equipment: ["Gumy oporowe"] })).toBe(true);
    expect(isCalisthenicsExercise({ equipment: [] })).toBe(true);
    expect(isCalisthenicsExercise({ equipment: ["Sztanga i talerze"] })).toBe(false);
    expect(isCalisthenicsExercise({ equipment: ["Hantle"] })).toBe(false);
    expect(isCalisthenicsExercise({ equipment: ["Maszyna"] })).toBe(false);
    expect(isCalisthenicsExercise({ equipment: ["Drążek", "Hantle"] })).toBe(false); // every implement must be on the list
  });
  it("body weight among several options is done with body weight; a required extra implement still counts", () => {
    expect(isCalisthenicsExercise({ equipment: ["Hantle", "Sztanga i talerze", "Masa własnego ciała"] })).toBe(true); // "Wykrok w tył"
    expect(isCalisthenicsExercise({ equipment: ["Masa własnego ciała"], requiredEquipmentAll: ["Sztanga i talerze"] })).toBe(false);
  });
});

describe("beginner safety of the style", () => {
  it("BA and P: verified and trainer-approved only; Ś and Z are not restricted by this rule", () => {
    for (const lvl of ["Brak aktywności fizycznej", "Początkujący"]) {
      expect(calisthenicsLevelAllows({ verificationStatus: "zweryfikowane", reviewedByTrainer: true }, lvl)).toBe(true);
      expect(calisthenicsLevelAllows({ verificationStatus: "do_weryfikacji", reviewedByTrainer: true }, lvl)).toBe(false);
      expect(calisthenicsLevelAllows({ verificationStatus: "zweryfikowane", reviewedByTrainer: false }, lvl)).toBe(false);
      expect(calisthenicsLevelAllows({ verificationStatus: null, reviewedByTrainer: true }, lvl)).toBe(false);
    }
    expect(calisthenicsLevelAllows({ verificationStatus: "do_weryfikacji", reviewedByTrainer: false }, "Średniozaawansowany")).toBe(true);
  });
});

describe("stations and days", () => {
  const all = { bar: true, parallelBars: true, rings: false, bands: true };
  it("stations come from the equipment of the place", () => {
    expect(stationsFor("Dom", "Drążek do podciągania, Gumy oporowe")).toEqual({ bar: true, parallelBars: false, rings: false, bands: true });
    expect(stationsFor("Dom", "Brak sprzętu")).toEqual({ bar: false, parallelBars: false, rings: false, bands: false });
    expect(stationsFor("Siłownia plenerowa", "Drążek do podciągania").bands).toBe(true); // outdoor gym: bands are portable
    expect(stationsFor("Siłownia", null).bar).toBe(true); // the gym has a bar
  });
  it("2–5 days: A bar, B parallel bars / push-ups, C legs and core", () => {
    expect(calisthenicsDays(3, all).days.map((d) => d.dayType)).toEqual(["pull", "push", "legs"]);
    expect(calisthenicsDays(2, all).days.map((d) => d.dayType)).toEqual(["upper", "legs"]);
    expect(calisthenicsDays(4, all).days.map((d) => d.dayType)).toEqual(["pull", "push", "legs", "upper"]);
    expect(calisthenicsDays(5, all).days.map((d) => d.dayType)).toEqual(["pull", "push", "legs", "upper", "full_body"]);
    expect(calisthenicsDays(3, all).days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
    expect(calisthenicsDays(3, all).warnings).toEqual([]);
  });
  it("without a pulling station a pull day becomes a push day, with a warning; more than 5 days is clamped", () => {
    const none = { bar: false, parallelBars: true, rings: false, bands: false };
    const r = calisthenicsDays(3, none);
    expect(r.days.map((d) => d.dayType)).toEqual(["push", "push", "legs"]);
    expect(r.warnings).toEqual([NO_PULL_STATION_NOTE]);
    expect(calisthenicsDays(6, all).days).toHaveLength(5);
    expect(calisthenicsDays(6, all).warnings.length).toBe(1);
  });
});

describe("ladders", () => {
  it("only exercises that exist get a step; missing names are skipped, never invented", () => {
    const rows = calisthenicsLadderRows(new Map([["Pompki klasyczne", 117], ["Pompki na kolanach", 118]]));
    expect(rows.map((r) => r.exerciseId).sort()).toEqual([117, 118]);
    expect(rows.every((r) => r.pattern === "Kalistenika: pompki")).toBe(true);
    expect(calisthenicsLadderRows(new Map())).toEqual([]);
  });
  it("no step above the one it belongs to; pull-ups and dips start no lower than P, never at BA", () => {
    for (const l of CALISTHENICS_LADDERS.filter((x) => /podciąganie|dipy/.test(x.pattern))) for (const [, level] of l.steps) expect(level).not.toBe("Brak aktywności fizycznej");
    const all = CALISTHENICS_LADDERS.find((l) => l.pattern.endsWith("podciąganie"))!;
    expect(all.steps.find(([n]) => n === "Podciąganie na drążku")![1]).toBe("Zaawansowany");
  });
});

describe("jumps on the leg day", () => {
  const rule = (level: string, jump: string | null, goal = "Cel sportowy", sessionType = "legs") => calisthenicsPlyoRule({ sessionType, goal, effectiveLevel: level, jumpExperience: jump });
  it("only the leg day has jumps; always 2", () => {
    expect(rule("Zaawansowany", "Tak — robię regularnie", "Cel sportowy", "pull").allowed).toBe(false);
    expect(rule("Zaawansowany", "Tak — robię regularnie", "Cel sportowy", "push").allowed).toBe(false);
    expect(rule("Zaawansowany", "Tak — robię regularnie").count).toBe(2);
    expect(rule("Średniozaawansowany", "Trochę — robiłem/am okazjonalnie", "Cel sportowy", "lower").count).toBe(2);
  });
  it("BA none; P only the landing drill with low intensity; the lower of level and experience decides; high only Z with \"Tak\"", () => {
    expect(rule("Brak aktywności fizycznej", "Tak — robię regularnie").allowed).toBe(false);
    expect(rule("Początkujący", "Tak — robię regularnie")).toMatchObject({ allowed: true, landing: true, intensities: ["niska"] });
    expect(rule("Zaawansowany", "Nie — dopiero zaczynam")).toMatchObject({ landing: true, intensities: ["niska"] });
    expect(rule("Średniozaawansowany", "Tak — robię regularnie").intensities).toEqual(["niska", "średnia"]);
    expect(rule("Zaawansowany", "Trochę — robiłem/am okazjonalnie").intensities).toEqual(["niska", "średnia"]);
    expect(rule("Zaawansowany", "Tak — robię regularnie").intensities).toEqual(["niska", "średnia", "wysoka"]);
  });
  it("no question about jumps outside the sport goal counts as \"Nie\"", () => {
    expect(rule("Zaawansowany", "Tak — robię regularnie", "Budowa sylwetki")).toMatchObject({ landing: true, intensities: ["niska"] });
    expect(rule("Zaawansowany", null, "Zwiększenie siły")).toMatchObject({ landing: true, intensities: ["niska"] });
  });
});

describe("day size", () => {
  const ex = (name: string, group: string) => ({ name, mainMuscleGroup: group });
  it("about 5: drops the last non-core exercises and keeps one closing core exercise", () => {
    const day = [ex("a", "Plecy"), ex("b", "Plecy"), ex("c", "Barki"), ex("d", "Biceps"), ex("e", "Triceps"), ex("f", "Barki"), ex("core", "Brzuch")];
    expect(capCalisthenicsDay(day).map((e) => e.name)).toEqual(["a", "b", "c", "d", "core"]);
  });
  it("days of 5 or fewer stay as they are", () => {
    const day = [ex("a", "Plecy"), ex("b", "Plecy"), ex("c", "Barki"), ex("d", "Brzuch")];
    expect(capCalisthenicsDay(day)).toEqual(day);
  });
  it("without a core exercise it is a plain cut to 5", () => {
    const day = ["a", "b", "c", "d", "e", "f"].map((n) => ex(n, "Plecy"));
    expect(capCalisthenicsDay(day)).toHaveLength(5);
  });
});

describe("bench / chair / park bench (decision 54.2)", () => {
  it("a bench exercise is allowed in the style", () => {
    expect(isCalisthenicsExercise({ equipment: ["Ławka"] })).toBe(true);
    expect(isCalisthenicsExercise({ equipment: ["Ławka", "Hantle"] })).toBe(false); // every implement must still be on the list
  });
  it("at home and in the outdoor gym the bench counts as available; at the gym nothing changes", () => {
    expect(calisthenicsEquipmentText("Dom", "Brak sprzętu")).toBe("Ławeczka treningowa");
    expect(calisthenicsEquipmentText("Dom", "Gumy oporowe")).toBe("Gumy oporowe, Ławeczka treningowa");
    expect(calisthenicsEquipmentText("Siłownia plenerowa", "Drążek do podciągania")).toBe("Drążek do podciągania, Ławeczka treningowa");
    expect(calisthenicsEquipmentText("Dom", "Ławeczka treningowa, Hantle")).toBe("Ławeczka treningowa, Hantle");
    expect(calisthenicsEquipmentText("Siłownia", "Hantle")).toBe("Hantle");
    expect(calisthenicsEquipmentText("Siłownia", null)).toBeNull();
  });
});

describe("ladders after the catalogue review (28.10.2026)", () => {
  it("every step name is unique; new exercises sit at the owner's levels; nothing on the bar, rings or parallel bars is at the BA level", () => {
    const names = CALISTHENICS_LADDERS.flatMap((l) => l.steps.map(([n]) => n));
    expect(new Set(names).size).toBe(names.length);
    const level = (n: string) => CALISTHENICS_LADDERS.flatMap((l) => l.steps).find(([x]) => x === n)![1];
    expect(level("Zwis na drążku")).toBe("Początkujący");
    for (const n of ["Negatywy podciągnięcia", "Negatywy dipów", "Dipy z gumą", "Wiosłowanie australijskie — nogi proste", "Unoszenie prostych nóg w zwisie"]) expect(level(n), n).toBe("Średniozaawansowany");
    for (const n of ["Podciąganie łucznik (archer)", "Pompki łucznik (archer)", "Dipy z obciążeniem", "Toes to bar", "Pistol z podparciem", "Wiosłowanie australijskie — nogi wyżej lub na kółkach"]) expect(level(n), n).toBe("Zaawansowany");
    for (const l of CALISTHENICS_LADDERS.filter((x) => /podciąganie|dipy|brzuch w zwisie/.test(x.pattern))) for (const [, lv] of l.steps) expect(lv).not.toBe("Brak aktywności fizycznej");
  });
});
