import { describe, it, expect } from "vitest";
import { HEALTH_CONSENT_HINT, HEALTH_CONSENT_LABEL } from "../healthConsentText";

describe("zgoda w wywiadzie trenera", () => {
  it("teksty są krótkie i bez języka medycznego", () => {
    expect(HEALTH_CONSENT_LABEL).toBe("Podopieczny wyraził zgodę na przetwarzanie danych o zdrowiu");
    expect(HEALTH_CONSENT_HINT).toContain("najostrożniejszych");
    expect(`${HEALTH_CONSENT_LABEL} ${HEALTH_CONSENT_HINT}`).not.toMatch(/diagnoz|leczeni|chorob/i);
  });
});
