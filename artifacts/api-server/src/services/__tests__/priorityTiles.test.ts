/** Partie priorytetowe jako kafelki (Nogi, Pośladki, Plecy, Klatka, Barki, Ręce, Brzuch): rozwijanie do partii i priorytet w generatorze. */
import { describe, it, expect } from "vitest";
import { priorityGroupsOf, priorityTileOf, toPriorityTiles, PRIORITY_TILES, PRIORITY_TILE_MUSCLES, MUSCLE_GROUPS } from "@workspace/survey-config";
import { getPriorityOrder, matchMuscleGroupToTargetIds, type TargetRecord } from "../planDraftVolumeDecisionService";
import { runExerciseSelectionEngineV0 } from "../ExerciseSelectionEngineV0";

const T = (id: number, name: string, broadCategory: string): TargetRecord => ({ id, name, broadCategory, isActive: true });
const targets = [T(1, "Czworogłowe", "Uda"), T(2, "Dwugłowe", "Uda"), T(3, "Łydki", "Łydki"), T(4, "Biceps", "Biceps"), T(5, "Triceps", "Triceps"), T(6, "Plecy", "Plecy"), T(7, "Barki", "Barki")];

describe("kafelki partii priorytetowych", () => {
  it("jest dokładnie 7 kafelków, każdy partia z katalogu pokryta", () => {
    expect([...PRIORITY_TILES]).toEqual(["Nogi", "Pośladki", "Plecy", "Klatka", "Barki", "Ręce", "Brzuch"]);
    const covered = new Set(PRIORITY_TILES.flatMap((t) => PRIORITY_TILE_MUSCLES[t]));
    for (const m of MUSCLE_GROUPS) expect(covered.has(m)).toBe(true);
  });
  it("Ręce = biceps + triceps, Nogi = uda + łydki; starsze wartości zostają", () => {
    expect(priorityGroupsOf("Ręce")).toEqual(["biceps", "triceps"]);
    expect(priorityGroupsOf("Nogi")).toEqual(["uda", "łydki"]);
    expect(priorityGroupsOf("Pośladki")).toEqual(["pośladki"]);
    expect(priorityGroupsOf("uda")).toEqual(["uda"]);
    expect(priorityGroupsOf("")).toEqual([]);
  });
  it("starsze wartości → kafelki (bez duplikatów, max 3)", () => {
    expect(priorityTileOf("łydki")).toBe("Nogi");
    expect(priorityTileOf("klatka piersiowa")).toBe("Klatka");
    expect(toPriorityTiles(["uda", "łydki", "triceps"])).toEqual(["Nogi", "Ręce"]);
    expect(toPriorityTiles(["barki", "plecy", "biceps", "uda"])).toEqual(["Barki", "Plecy", "Ręce"]);
  });
  it("generator: kafelek zachowuje pozycję priorytetu i obejmuje wszystkie jego partie", () => {
    expect(matchMuscleGroupToTargetIds("Ręce", targets).sort()).toEqual([4, 5]);
    expect(matchMuscleGroupToTargetIds("Nogi", targets).sort()).toEqual([1, 2, 3]);
    const prio = ["Ręce", "Nogi", "Plecy"];
    expect(getPriorityOrder(4, prio, targets)).toBe(1);
    expect(getPriorityOrder(5, prio, targets)).toBe(1);
    expect(getPriorityOrder(2, prio, targets)).toBe(2);
    expect(getPriorityOrder(3, prio, targets)).toBe(2);
    expect(getPriorityOrder(6, prio, targets)).toBe(3);
    expect(getPriorityOrder(7, prio, targets)).toBeNull();
  });
  it("silnik wyboru ćwiczeń dostaje rozwinięte partie (kafelek Ręce → biceps i triceps w tierze)", () => {
    expect(typeof runExerciseSelectionEngineV0).toBe("function");
    expect([...priorityGroupsOf("Ręce"), ...priorityGroupsOf("Nogi")]).toEqual(["biceps", "triceps", "uda", "łydki"]);
  });
});
