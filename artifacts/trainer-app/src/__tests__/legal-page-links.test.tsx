// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import LegalPage from "../pages/Legal";

describe("document page navigation (QA C5)", () => {
  it("links between documents are at least 44 px high; the open document is marked as the current page", () => {
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
