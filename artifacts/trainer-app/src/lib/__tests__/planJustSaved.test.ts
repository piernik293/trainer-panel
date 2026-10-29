import { describe, it, expect } from "vitest";
import { isJustSaved, planUrlAfterSave } from "../planJustSaved";

describe("przejście po zapisie planu (C2)", () => {
  it("adres po zapisie niesie znacznik, a edytor go rozpoznaje", () => {
    expect(planUrlAfterSave(42)).toBe("/plans/42?po-zapisie=1");
    expect(isJustSaved("?po-zapisie=1")).toBe(true);
    expect(isJustSaved("")).toBe(false);
    expect(isJustSaved("?po-zapisie=0")).toBe(false);
  });
});
