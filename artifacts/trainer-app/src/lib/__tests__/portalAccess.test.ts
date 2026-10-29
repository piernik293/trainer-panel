import { describe, it, expect } from "vitest";
import { portalInviteUrl, portalMailto } from "../portalAccess";

describe("dostęp do aplikacji po aktywacji planu", () => {
  it("buduje link z adresu strony", () => {
    expect(portalInviteUrl("https://x.pl/", "abc")).toBe("https://x.pl/client-landing/invite/abc");
  });
  it("mailto tylko gdy klient ma e-mail; link i imię w treści", () => {
    expect(portalMailto(null, "Marta", "u")).toBeNull();
    const m = portalMailto("marta@example.com", "Marta", "https://x.pl/client-landing/invite/abc")!;
    expect(m.startsWith("mailto:marta%40example.com?subject=")).toBe(true);
    expect(decodeURIComponent(m)).toContain("https://x.pl/client-landing/invite/abc");
    expect(decodeURIComponent(m)).toContain("Cześć Marta");
  });
});
