import { describe, it, expect } from "vitest";
import { applyView, type Roles } from "./TrainerApplyCard";

const base: Roles = { isTrainer: false, isClient: true, application: null };
describe("sekcja „Prowadzę podopiecznych”", () => {
  it("formularz, oczekujący, odrzucony z czekaniem, przełącznik dla trenera", () => {
    expect(applyView(null)).toBe("none");
    expect(applyView(base)).toBe("form");
    expect(applyView({ ...base, application: { status: "pending", canApply: false, applyAgainFrom: null } })).toBe("pending");
    expect(applyView({ ...base, application: { status: "rejected", canApply: false, applyAgainFrom: "2026-11-10T00:00:00Z" } })).toBe("rejected_wait");
    expect(applyView({ ...base, application: { status: "rejected", canApply: true, applyAgainFrom: null } })).toBe("form");
    expect(applyView({ ...base, isTrainer: true })).toBe("switch");
  });
});
