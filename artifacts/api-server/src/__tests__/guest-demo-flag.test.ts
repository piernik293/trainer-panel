import { describe, it, expect } from "vitest";
import { guestDemoEnabled } from "../routes/health";

describe("flaga GUEST_DEMO_ENABLED", () => {
  it("domyślnie wyłączona; tylko „1” włącza", () => {
    expect(guestDemoEnabled({})).toBe(false);
    expect(guestDemoEnabled({ GUEST_DEMO_ENABLED: "0" })).toBe(false);
    expect(guestDemoEnabled({ GUEST_DEMO_ENABLED: "true" })).toBe(false);
    expect(guestDemoEnabled({ GUEST_DEMO_ENABLED: "1" })).toBe(true);
  });
});
