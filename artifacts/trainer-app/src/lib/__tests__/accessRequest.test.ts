import { describe, it, expect } from "vitest";
import { accessView } from "../accessRequest";

describe("ekran konta bez dostępu trenera", () => {
  it("bez wniosku: formularz; po wysłaniu i przy oczekującym: „wysłany”; odrzucony z czekaniem: komunikat", () => {
    expect(accessView(null, false)).toBe("form");
    expect(accessView({ application: null }, false)).toBe("form");
    expect(accessView({ application: null }, true)).toBe("sent");
    expect(accessView({ application: { status: "pending", canApply: false, applyAgainFrom: null } }, false)).toBe("sent");
    expect(accessView({ application: { status: "rejected", canApply: false, applyAgainFrom: "2026-11-20T00:00:00Z" } }, false)).toBe("rejected_wait");
    expect(accessView({ application: { status: "rejected", canApply: true, applyAgainFrom: null } }, false)).toBe("form");
  });
});
