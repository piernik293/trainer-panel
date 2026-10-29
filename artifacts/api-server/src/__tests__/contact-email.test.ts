import { describe, it, expect } from "vitest";
import { contactEmail } from "../routes/health";

describe("adres kontaktowy z konfiguracji", () => {
  it("poprawny adres przechodzi, szablon TU_ADRES i puste = brak", () => {
    expect(contactEmail({ CONTACT_EMAIL: " kontakt@example.com " })).toBe("kontakt@example.com");
    expect(contactEmail({ CONTACT_EMAIL: "TU_ADRES" })).toBeNull();
    expect(contactEmail({})).toBeNull();
  });
});
