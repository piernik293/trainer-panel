import { describe, it, expect } from "vitest";
import { homeTargetUrl, AUTH_REDIRECT_PATH } from "../authHome";

describe("kierowanie po zalogowaniu", () => {
  it("trener → panel, pozostali → portal, zablokowany → zostaje z komunikatem", () => {
    expect(homeTargetUrl({ destination: "panel" })).toBe("/");
    expect(homeTargetUrl({ destination: "panel" }, "/app")).toBe("/app");
    expect(homeTargetUrl({ destination: "portal" })).toBe("/client-landing/plan");
    expect(homeTargetUrl({ destination: "blocked" })).toBeNull();
    expect(AUTH_REDIRECT_PATH).toBe("/auth/redirect");
  });
});
