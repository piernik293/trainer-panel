/**
 * Hard exclusion of exercises by reported joint (interview text or pain report, last 30 days).
 * Pure part: reading the sources, the 30-day window, the compatibility filter.
 */
import { describe, it, expect } from "vitest";
import { blockedJointsFrom, hitsBlockedJoint, PAIN_LOOKBACK_DAYS } from "../services/jointExclusion";
import { buildCompatibilityFilter } from "../services/planDraftDayRecommendationsService";

const JOINTS = ["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek"] as const;
const TEXT: Record<(typeof JOINTS)[number], string> = {
  Kolano: "boli mnie kolano po biegu",
  Biodro: "problem ze stawem biodrowym",
  "Plecy — dół": "ból w odcinku lędźwiowym",
  Bark: "barki, uraz rotatora",
  Łokieć: "łokieć tenisisty",
  Nadgarstek: "ból nadgarstka",
};
const day = 86_400_000;
const now = new Date("2026-10-24T12:00:00Z");

describe("blockedJointsFrom — sources", () => {
  it.each(JOINTS)("%s from the interview text", (j) => {
    expect(blockedJointsFrom(TEXT[j], [], now)).toEqual(new Set([j]));
  });
  it.each(JOINTS)("%s from a pain report", (j) => {
    expect(blockedJointsFrom(null, [{ area: j, createdAt: new Date(now.getTime() - 2 * day) }], now)).toEqual(new Set([j]));
  });
  it("30-day window: 29 days counts, 31 days does not", () => {
    expect(PAIN_LOOKBACK_DAYS).toBe(30);
    expect(blockedJointsFrom(null, [{ area: "Bark", createdAt: new Date(now.getTime() - 29 * day) }], now).has("Bark")).toBe(true);
    expect(blockedJointsFrom(null, [{ area: "Bark", createdAt: new Date(now.getTime() - 31 * day) }], now).size).toBe(0);
  });
  it("'Inne' and an empty interview block nothing; sources add up", () => {
    expect(blockedJointsFrom("", [{ area: "Inne", createdAt: now }], now).size).toBe(0);
    expect(blockedJointsFrom(TEXT.Kolano, [{ area: "Bark", createdAt: now }], now)).toEqual(new Set(["Kolano", "Bark"]));
  });
});

describe("buildCompatibilityFilter — joint exclusion", () => {
  const base = { trainingLocation: ["Siłownia"], equipment: ["Masa własnego ciała"], requiredEquipmentAll: [] as string[], jointStress: "Niskie" };
  it.each(JOINTS)("%s: tagged exercise rejected, other joint / confirmed-none accepted, unknown rejected (decision 3a)", (j) => {
    const f = buildCompatibilityFilter("Siłownia", null, new Set(), new Set([j]));
    expect(f({ id: 1, ...base, jointStressAreas: [j] })).toBe(false);
    expect(f({ id: 2, ...base, jointStressAreas: ["Kolano", j].sort() })).toBe(false);
    const other = JOINTS.find((x) => x !== j)!;
    expect(f({ id: 3, ...base, jointStressAreas: [other] })).toBe(true);
    expect(f({ id: 4, ...base, jointStressAreas: [] })).toBe(true); // "Niskie" with no joint of the list = confirmed none
    expect(f({ id: 5, ...base, jointStressAreas: null })).toBe(false); // decision 3a: no joint data is never offered to a client with a reported joint
    expect(f({ id: 6, ...base, jointStress: null, jointStressAreas: [other] })).toBe(false); // level missing
    expect(f({ id: 7, ...base, jointStress: "Średnie", jointStressAreas: [] })).toBe(false); // load above "Niskie" but no joint named
  });
  it("no reported joints → filter unchanged", () => {
    const f = buildCompatibilityFilter("Siłownia", null, new Set());
    expect(f({ id: 1, ...base, jointStressAreas: ["Bark"] })).toBe(true);
    expect(hitsBlockedJoint(["Bark"], new Set())).toBe(false);
  });
});
