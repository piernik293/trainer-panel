import { describe, it, expect } from "vitest";
import { lacksJointData, withheldForUnknownJoints } from "../jointData";
import { buildCompatibilityFilter } from "../planDraftDayRecommendationsService";
import { selectWarmup, type CatalogueWarmupItem, type SelectionContext } from "../warmupSelection";

describe("lacksJointData (decision 3a)", () => {
  it("missing level, missing joint list, or an empty list at a level above Niskie = unknown", () => {
    expect(lacksJointData({ jointStress: null, jointStressAreas: ["Bark"] })).toBe(true);
    expect(lacksJointData({ jointStress: "", jointStressAreas: ["Bark"] })).toBe(true);
    expect(lacksJointData({ jointStress: "Średnie", jointStressAreas: null })).toBe(true);
    expect(lacksJointData({ jointStress: "Średnie", jointStressAreas: undefined })).toBe(true);
    expect(lacksJointData({ jointStress: "Średnie", jointStressAreas: [] })).toBe(true);
    expect(lacksJointData({ jointStress: "Wysokie", jointStressAreas: [] })).toBe(true);
  });
  it("known data is fine; \"Niskie\" with no joint of the list is a legitimate answer (breathing, neck stretch)", () => {
    expect(lacksJointData({ jointStress: "Niskie", jointStressAreas: [] })).toBe(false);
    expect(lacksJointData({ jointStress: "Średnie", jointStressAreas: ["Kolano"] })).toBe(false);
  });
  it("withheld only for a client with a reported joint or without consent", () => {
    const unknown = { jointStress: null, jointStressAreas: null };
    expect(withheldForUnknownJoints(unknown, new Set(), false)).toBe(false);
    expect(withheldForUnknownJoints(unknown, new Set(["Bark"]), false)).toBe(true);
    expect(withheldForUnknownJoints(unknown, new Set(), true)).toBe(true);
    expect(withheldForUnknownJoints({ jointStress: "Niskie", jointStressAreas: ["Kolano"] }, new Set(["Bark"]), true)).toBe(false);
  });
});

describe("the shared compatibility filter applies it", () => {
  const base = { id: 1, trainingLocation: ["Siłownia"], equipment: ["Masa własnego ciała"], requiredEquipmentAll: [] as string[] };
  it("unknown joint data never passes for a reported joint or without consent; passes for everyone else", () => {
    const unknown = { ...base, jointStress: null, jointStressAreas: null };
    expect(buildCompatibilityFilter("Siłownia", null, new Set(), new Set(["Bark"]), false)(unknown)).toBe(false);
    expect(buildCompatibilityFilter("Siłownia", null, new Set(), new Set(), true)(unknown)).toBe(false);
    expect(buildCompatibilityFilter("Siłownia", null, new Set(), new Set(), false)(unknown)).toBe(true);
    const known = { ...base, jointStress: "Niskie", jointStressAreas: ["Kolano"] };
    expect(buildCompatibilityFilter("Siłownia", null, new Set(), new Set(["Bark"]), true)(known)).toBe(true);
  });
});

describe("warm-up and cool-down", () => {
  const item = (over: Partial<CatalogueWarmupItem>): CatalogueWarmupItem => ({
    id: 1, name: "Krążenia", role: "rozgrzewka", mainMuscleGroup: "Barki", secondaryMuscleGroups: [], movementPattern: "Mobilizacja", learningDifficulty: 1, suitableForNoActivity: true,
    verificationStatus: "zweryfikowane", jointStressAreas: ["Łokieć"], jointStress: "Niskie", equipment: [], equipmentDetail: [], trainingLocation: [], defaultReps: 10, defaultDurationSeconds: null,
    perSide: false, executionInstructions: "x", ...over,
  } as CatalogueWarmupItem);
  const ctx = (over: Partial<SelectionContext>): SelectionContext => ({ dayGroups: ["Barki"], level: "Średniozaawansowany", painAreas: new Set<string>(), ...over });
  it("an item without joint data is not offered to a client with pain or without consent", () => {
    const unknown = item({ id: 7, jointStress: null, jointStressAreas: null });
    const ids = (c: SelectionContext) => selectWarmup([unknown, item({ id: 8 })], c).map((x) => x.id);
    expect(ids(ctx({}))).toContain(7);
    expect(ids(ctx({ painAreas: new Set(["Kolano"]) }))).not.toContain(7);
    expect(ids(ctx({ conservative: true }))).not.toContain(7);
    expect(ids(ctx({ painAreas: new Set(["Kolano"]) }))).toContain(8);
  });
});
