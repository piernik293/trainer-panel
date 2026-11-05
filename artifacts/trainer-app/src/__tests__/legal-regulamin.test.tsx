// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
vi.mock("wouter", () => ({ useParams: () => ({ slug: "regulamin" }), Link: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
import Legal from "@/pages/Legal";
afterEach(cleanup);
describe("strona Regulaminu w panelu", () => {
  it("pasek „Wersja testowa”, 18 paragrafów, znaczniki [ ] zachowane", () => {
    render(<Legal />);
    expect(screen.getByTestId("legal-draft-note").textContent).toContain("Wersja testowa — dokument w trakcie weryfikacji prawnej");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(18);
    expect(document.body.textContent).toContain("[ADRES KONTAKTOWY]");
  });
});
