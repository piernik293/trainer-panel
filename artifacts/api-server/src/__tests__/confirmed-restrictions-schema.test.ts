/**
 * Confirmed restrictions — Zod schema unit tests (Task #95)
 *
 * Verifies that GetClientSurveyResponse and UpsertClientSurveyResponse
 * include `confirmedRestrictions` in their parse output instead of
 * silently stripping it (Zod's default strip behaviour for unknown fields).
 */

import { describe, it, expect } from "vitest";
import {
  GetClientSurveyResponse,
  UpsertClientSurveyResponse,
} from "@workspace/api-zod";

const BASE = {
  id: 1,
  clientId: 10,
  advancedMethodsToAvoid: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const RESTRICTIONS = JSON.stringify([
  { bodyPart: "Kolano lewe", note: "ból przy przysiadach" },
]);

describe("GetClientSurveyResponse", () => {
  it("passes confirmedRestrictions through when present", () => {
    const result = GetClientSurveyResponse.parse({
      ...BASE,
      confirmedRestrictions: RESTRICTIONS,
    });
    expect(result.confirmedRestrictions).toBe(RESTRICTIONS);
  });

  it("returns null when confirmedRestrictions is null", () => {
    const result = GetClientSurveyResponse.parse({
      ...BASE,
      confirmedRestrictions: null,
    });
    expect(result.confirmedRestrictions).toBeNull();
  });

  it("returns null/undefined when confirmedRestrictions is absent", () => {
    const result = GetClientSurveyResponse.parse({ ...BASE });
    expect(result.confirmedRestrictions == null).toBe(true);
  });
});

describe("UpsertClientSurveyResponse", () => {
  it("passes confirmedRestrictions through when present", () => {
    const result = UpsertClientSurveyResponse.parse({
      ...BASE,
      confirmedRestrictions: RESTRICTIONS,
    });
    expect(result.confirmedRestrictions).toBe(RESTRICTIONS);
  });

  it("returns null when confirmedRestrictions is null", () => {
    const result = UpsertClientSurveyResponse.parse({
      ...BASE,
      confirmedRestrictions: null,
    });
    expect(result.confirmedRestrictions).toBeNull();
  });
});
