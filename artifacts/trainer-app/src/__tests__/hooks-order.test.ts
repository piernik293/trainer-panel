/**
 * Reguła hooków (QA beta 2): w komponentach stron z wczesnym `return` (ładowanie, brak danych) żaden hook nie może stać PO nim —
 * inaczej przy zimnym wejściu zmienia się kolejność hooków i strona pada („Rendered more hooks than during the previous render”).
 * Test strukturalny na stronach, gdzie to już raz się zdarzyło (PlanEditor).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function hooksAfterEarlyReturn(file: string, component: string, firstReturn: RegExp): string[] {
  const src = readFileSync(join(__dirname, "../pages", file), "utf8").split("\n");
  const start = src.findIndex((l) => l.includes(`function ${component}(`));
  expect(start, `${component} nie znaleziony`).toBeGreaterThanOrEqual(0);
  const ret = src.findIndex((l, i) => i > start && firstReturn.test(l));
  expect(ret, "pierwszy wczesny return nie znaleziony").toBeGreaterThan(start);
  const bad: string[] = [];
  for (let i = ret; i < src.length; i++) {
    const l = src[i]!;
    if (/^}/.test(l)) break; // koniec komponentu
    // hook na poziomie ciała komponentu (wcięcie 2 spacje), np. `const [a, b] = useState(` albo `useEffect(`
    if (/^  (const [^=]+= )?use[A-Z]\w*\(/.test(l)) bad.push(`${i + 1}: ${l.trim().slice(0, 80)}`);
  }
  return bad;
}

describe("kolejność hooków", () => {
  it("PlanEditor: żaden hook po wczesnym return (ładowanie planu / brak planu)", () => {
    expect(hooksAfterEarlyReturn("PlanEditor.tsx", "PlanEditor", /^  if \(isLoading\) \{/)).toEqual([]);
  });
});
