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

import { trialNotice, TRIAL_ENDED_TEXT } from "../limitsNotice";
describe("komunikat okresu próbnego", () => {
  const t = (state: "active" | "ended" | "none", daysLeft: number, showEnded = false) => ({ trial: { state, daysLeft, showEnded } });
  it("spokojny do 4 dni, wyraźniejszy w ostatnich 3", () => {
    expect(trialNotice(t("active", 10))).toEqual({ text: "Okres próbny: zostało 10 dni", urgent: false });
    expect(trialNotice(t("active", 3))?.urgent).toBe(true);
    expect(trialNotice(t("active", 1))?.text).toBe("Okres próbny: zostało 1 dzień");
  });
  it("po terminie: komunikat o planie Free; ukryty przy beta bez limitów i bez planu Free", () => {
    expect(trialNotice(t("ended", 0, true))?.text).toBe(TRIAL_ENDED_TEXT);
    expect(trialNotice(t("ended", 0, false))).toBeNull();
    expect(trialNotice({ ...t("active", 5), noLimits: true })).toBeNull();
  });
});

describe("Pro gratis dla trenera ze Złotym Byczkiem", () => {
  const trial = (daysLeft: number) => ({ state: "active" as const, daysLeft, showEnded: false });
  it("pokazuje „Pro gratis (Złoty Byczek #N): zostało X dni”, w ostatnich 3 dniach wyraźniej", () => {
    expect(trialNotice({ trial: trial(120), goldenBull: { number: 4 } })).toEqual({ text: "Pro gratis (Złoty Byczek #4): zostało 120 dni", urgent: false });
    expect(trialNotice({ trial: trial(1), goldenBull: { number: 4 } })).toEqual({ text: "Pro gratis (Złoty Byczek #4): zostało 1 dzień", urgent: true });
  });
  it("bez odznaki zostaje zwykły komunikat o okresie próbnym; po końcu okresu nie ma tekstu o Pro gratis", () => {
    expect(trialNotice({ trial: trial(10), goldenBull: null })?.text).toBe("Okres próbny: zostało 10 dni");
    expect(trialNotice({ trial: { state: "ended", daysLeft: 0, showEnded: true }, goldenBull: { number: 4 } })?.text).not.toContain("Pro gratis");
  });
});

