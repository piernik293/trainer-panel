/**
 * Decision 56 (28.10.2026): the portal's texts carry no gender ("Przeszedłeś/Przeszłaś" and "-łeś/-/aś" forms are out; neutral wording or impersonal).
 * This guard reads the sources of the portal and the interview configuration and fails on a gendered past-tense form of "you" or "I".
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [join(__dirname, ".."), join(__dirname, "../../../../lib/survey-config/src")];
// a gendered past-tense form of "you" or "I" ("zrobiłeś", "zrobiłaś", "zrobiłem", "zrobiłam"), or a slash form ("/-aś", "/am")
const PAST = /^\p{L}{3,}(?:łeś|łaś|łem|łam)$/u;
const SLASH = /\p{L}\/-?(?:aś|am)\b/u;
// not a form of "you"/"I": "hasłem" (with a password)
const ALLOWED_WORDS = new Set(["hasłem"]);
const isGendered = (line: string) => SLASH.test(line) || (line.match(/\p{L}+/gu) ?? []).some((w) => PAST.test(w) && !ALLOWED_WORDS.has(w.toLowerCase()));
// the pre-28.10.2026 wording that is still recognised in already stored answers
const LEGACY_LINE = /LEGACY_JUMP_SOME/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" || n === "__fixtures__" ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("portal texts without gender", () => {
  it("no gendered past-tense forms in the sources of the portal and the interview configuration", () => {
    const bad: string[] = [];
    for (const f of ROOTS.flatMap(files)) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (LEGACY_LINE.test(line) || line.trim().startsWith("//") || line.trim().startsWith("*")) return;
        if (isGendered(line)) bad.push(`${f.split("/src/")[1] ?? f}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
