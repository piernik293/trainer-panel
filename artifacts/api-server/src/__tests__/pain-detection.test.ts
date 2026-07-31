/**
 * Pain and limitation keyword detection — focused tests (spec items 16–22)
 *
 * Tests 16–22 correspond directly to the spec's "Pain detection" section.
 * All tests drive the detectPainKeywords() function directly (pure unit tests —
 * no database or HTTP layer needed).
 */

import { describe, it, expect } from "vitest";
import { detectPainKeywords } from "../services/safetyAndCardioRules";

// ─── 16. "Boli mnie kolano" creates a warning ─────────────────────────────────

describe("(16) 'Boli mnie kolano' → pain warning detected", () => {
  it("detects 'boli' with standard Polish text", () => {
    expect(detectPainKeywords("Boli mnie kolano")).toBe(true);
  });

  it("detects 'boli' case-insensitively", () => {
    expect(detectPainKeywords("BOLI MNIE KOLANO")).toBe(true);
  });

  it("detects 'boli' inside a longer sentence", () => {
    expect(detectPainKeywords("Ostatnio boli mnie prawe kolano przy schodzeniu ze schodów")).toBe(true);
  });
});

// ─── 17. "Bolą mnie plecy" creates a warning ─────────────────────────────────

describe("(17) 'Bolą mnie plecy' → pain warning detected", () => {
  it("detects 'bolą' (ą → a after normalization)", () => {
    expect(detectPainKeywords("Bolą mnie plecy")).toBe(true);
  });

  it("detects 'bolą' in mixed-case text", () => {
    expect(detectPainKeywords("bolą mnie plecy od dłuższego czasu")).toBe(true);
  });
});

// ─── 18. "Strzela mi w barku" creates a warning ──────────────────────────────

describe("(18) 'Strzela mi w barku' → pain warning detected", () => {
  it("detects 'strzela'", () => {
    expect(detectPainKeywords("Strzela mi w barku")).toBe(true);
  });

  it("detects 'strzelanie'", () => {
    expect(detectPainKeywords("Mam strzelanie w barku przy unoszeniu ramion")).toBe(true);
  });

  it("detects 'strzyka'", () => {
    expect(detectPainKeywords("Strzyka mnie w kolanie")).toBe(true);
  });
});

// ─── 19. "Kłuje mnie w kolanie" creates a warning ────────────────────────────

describe("(19) 'Kłuje mnie w kolanie' → pain warning detected", () => {
  it("detects 'kłuje' (ł → l, ę → e after normalization)", () => {
    expect(detectPainKeywords("Kłuje mnie w kolanie")).toBe(true);
  });

  it("detects 'kłucie'", () => {
    expect(detectPainKeywords("Czuję kłucie po wewnętrznej stronie kolana")).toBe(true);
  });
});

// ─── 20. "Nic mnie nie boli" does NOT create a confirmed pain warning ─────────

describe("(20) 'Nic mnie nie boli' → no pain warning", () => {
  it("suppresses 'boli' when preceded by 'nic' and 'nie'", () => {
    expect(detectPainKeywords("Nic mnie nie boli")).toBe(false);
  });

  it("suppresses 'nie boli mnie'", () => {
    expect(detectPainKeywords("Nie boli mnie nic")).toBe(false);
  });

  it("suppresses 'brak bólu'", () => {
    expect(detectPainKeywords("Brak bólu")).toBe(false);
  });

  it("suppresses 'bez bólu'", () => {
    expect(detectPainKeywords("Bez bólu")).toBe(false);
  });
});

// ─── 21. "Nie mam problemów z kolanami" does NOT create a confirmed pain warning

describe("(21) 'Nie mam problemów z kolanami' → no pain warning", () => {
  it("suppresses 'problemów' when preceded by 'nie'", () => {
    expect(detectPainKeywords("Nie mam problemów z kolanami")).toBe(false);
  });

  it("suppresses 'nie mam problemów z plecami'", () => {
    expect(detectPainKeywords("Nie mam problemów z plecami ani z kolanami")).toBe(false);
  });

  it("still flags 'mam problem z' (without negation)", () => {
    expect(detectPainKeywords("Mam problem z prawym kolanem")).toBe(true);
  });
});

// ─── 22. Original client text remains visible ─────────────────────────────────

describe("(22) Original client text is preserved — detectPainKeywords is read-only", () => {
  it("does not modify the input string", () => {
    const original = "Boli mnie kolano od dwóch tygodni.";
    const copy = `${original}`;
    detectPainKeywords(original);
    // The function must not mutate its input
    expect(original).toBe(copy);
  });

  it("returns false for null input without throwing", () => {
    expect(() => detectPainKeywords(null)).not.toThrow();
    expect(detectPainKeywords(null)).toBe(false);
  });

  it("returns false for empty-string input", () => {
    expect(detectPainKeywords("")).toBe(false);
    expect(detectPainKeywords("   ")).toBe(false);
  });
});

// ─── Additional keyword coverage (spec-listed terms) ─────────────────────────

describe("Additional spec keywords", () => {
  const cases: [string, string][] = [
    ["uraz", "Mam uraz lewego barku"],
    ["kontuzja", "Jestem po kontuzji kolana"],
    ["zwichnięcie", "Miałem zwichnięcie kostki rok temu"],
    ["obrzęk", "Widoczny obrzęk okolicy kolana"],
    ["puchnie", "Puchnie mi kostka po treningu"],
    ["drętwieje", "Drętwieje mi ręka podczas ćwiczeń"],
    ["drętwienie", "Czuję drętwienie w dłoni"],
    ["mrowienie", "Mrowienie wzdłuż nogi"],
    ["niestabilność", "Niestabilność w kolanie"],
    ["przeskakuje", "Coś przeskakuje w barku"],
    ["chrupie", "Kolano chrupie przy schodach"],
    ["ograniczenie ruchu", "Mam ograniczenie ruchu w biodrze"],
    ["bolesny", "Ruch jest bolesny"],
  ];

  for (const [keyword, sentence] of cases) {
    it(`detects '${keyword}' keyword`, () => {
      expect(detectPainKeywords(sentence)).toBe(true);
    });
  }
});
