// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LEGAL_DOCUMENTS, LEGAL_PLACEHOLDER, HEALTH_CONSENT_VERSION, legalDocument } from "@workspace/survey-config";
import { LegalLinks } from "./LegalLinks";
import LegalPage from "../pages/legal";

describe("legal documents (skeletons)", () => {
  it("three documents; every section is marked as a placeholder for the lawyer; no legal wording invented", () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.slug)).toEqual(["polityka-prywatnosci", "regulamin", "zgoda-zdrowie"]);
    for (const d of LEGAL_DOCUMENTS) for (const s of d.sections) expect(s.text.startsWith(LEGAL_PLACEHOLDER)).toBe(true);
    expect(legalDocument("zgoda-zdrowie")?.version).toBe(HEALTH_CONSENT_VERSION);
    expect(legalDocument("nie-ma")).toBeUndefined();
  });
  it("footer links to all three documents", () => {
    const { container } = render(<LegalLinks />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBe(3);
    for (const d of LEGAL_DOCUMENTS) expect(hrefs.some((h) => h?.endsWith(`/legal/${d.slug}`))).toBe(true);
  });
  it("the page shows the 'DO UZUPEŁNIENIA PRZEZ PRAWNIKA' notice", async () => {
    const { Router, Route } = await import("wouter");
    const { memoryLocation } = await import("wouter/memory-location");
    const { hook } = memoryLocation({ path: "/legal/regulamin" });
    const { getByTestId, container } = render(<Router hook={hook}><Route path="/legal/:slug" component={LegalPage} /></Router>);
    expect(getByTestId("legal-draft-note").textContent).toContain("DO UZUPEŁNIENIA PRZEZ PRAWNIKA");
    expect(container.textContent).toContain("Regulamin");
  });
});

describe("document page navigation (QA C5)", () => {
  it("links between documents are at least 44 px high; the open document is marked as the current page", async () => {
    const { Router, Route } = await import("wouter");
    const { memoryLocation } = await import("wouter/memory-location");
    const { hook } = memoryLocation({ path: "/legal/regulamin" });
    const { container } = render(<Router hook={hook}><Route path="/legal/:slug" component={LegalPage} /></Router>);
    const links = [...container.querySelectorAll('nav[aria-label="Dokumenty"] a')];
    expect(links.length).toBe(3);
    for (const a of links) expect(a.className).toContain("min-h-11");
    const current = links.filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.length).toBe(1);
    expect(current[0]!.getAttribute("href")).toMatch(/regulamin$/);
  });
});
