import { describe, it, expect } from "vitest";
import { toCreateClientPayload } from "../clientPayload";

describe("toCreateClientPayload", () => {
  it("pomija puste pola (klient bez e-maila i telefonu)", () => {
    expect(toCreateClientPayload({ firstName: "Jan", lastName: "Kowalski", email: "", phone: "", notes: "" }))
      .toEqual({ firstName: "Jan", lastName: "Kowalski", email: undefined, phone: undefined, notes: undefined });
  });
  it("przycina spacje i zachowuje wpisane dane", () => {
    expect(toCreateClientPayload({ firstName: " Jan ", lastName: "Kowalski", email: " jan@example.com ", phone: "600", notes: "x" }))
      .toEqual({ firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", phone: "600", notes: "x" });
  });
});
