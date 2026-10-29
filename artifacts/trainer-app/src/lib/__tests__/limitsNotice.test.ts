import { describe, it, expect } from "vitest";
import { showLimitsNotice, LIMITS_NOTICE_TEXT } from "../limitsNotice";

describe("uprzedzenie o limitach (D2)", () => {
  it("tylko dla planu Free, bez flagi „beta bez limitów”, dopóki nie zostało zamknięte", () => {
    expect(showLimitsNotice({ plan: { code: "FREE" } }, false)).toBe(true);
    expect(showLimitsNotice({ plan: { code: "FREE" } }, true)).toBe(false);
    expect(showLimitsNotice({ plan: { code: "FREE" }, noLimits: true }, false)).toBe(false);
    expect(showLimitsNotice({ plan: { code: "PRO" } }, false)).toBe(false);
    expect(showLimitsNotice(undefined, false)).toBe(false);
  });
  it("tekst jest krótki i bez form zależnych od płci", () => {
    expect(LIMITS_NOTICE_TEXT.length).toBeLessThan(160);
    expect(LIMITS_NOTICE_TEXT).not.toMatch(/(łeś|łaś)\b/);
  });
});
