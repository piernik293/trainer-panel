import { describe, it, expect } from "vitest";
import { clientFullName } from "../lib/clientName";

describe("clientFullName", () => {
  it("joins first and last name", () => expect(clientFullName({ firstName: "Anna", lastName: "Nowak" })).toBe("Anna Nowak"));
  it("no trailing space without a surname (regression QA C7: \"Ewa \")", () => {
    expect(clientFullName({ firstName: "Ewa", lastName: "" })).toBe("Ewa");
    expect(clientFullName({ firstName: "Ewa", lastName: null })).toBe("Ewa");
    expect(clientFullName({ firstName: " Ewa ", lastName: "  " })).toBe("Ewa");
  });
  it("no leading space without a first name", () => expect(clientFullName({ firstName: "", lastName: "Nowak" })).toBe("Nowak"));
});
