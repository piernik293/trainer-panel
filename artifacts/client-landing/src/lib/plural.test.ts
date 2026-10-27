import { describe, it, expect } from "vitest";
import { pluralPl } from "./plural";

describe("pluralPl", () => {
  it("minuta / minuty / minut", () => {
    const f = (n: number) => pluralPl(n, "minuta", "minuty", "minut");
    expect([1, 2, 4, 5, 12, 14, 21, 22, 25, 112].map(f)).toEqual(["minuta", "minuty", "minuty", "minut", "minut", "minut", "minut", "minuty", "minut", "minut"]);
  });
});
