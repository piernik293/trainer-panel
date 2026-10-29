/**
 * Descriptions for the client (top 100 exercises + top 20 warm-ups + top 20 cool-downs, migration 0061): short, plain Polish, no English words, no jargon,
 * no gendered forms; one common mistake; 2–3 tips. The migration keeps a backup of the old texts and is one-shot.
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { db, pool, exercisesTable } from "@workspace/db";

const SQL = readFileSync(join(__dirname, "../../../../lib/db/migrations/0061_opisy_top100.sql"), "utf8");
const ROW = /\(\$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$, (?:\$t\$(.*?)\$t\$|NULL), \$t\$(.*?)\$t\$, \$t\$(.*?)\$t\$\)/gs;
const rows = [...SQL.matchAll(ROW)].map((m) => ({ slug: m[1]!, desc: m[2]!, how: m[3] ?? null, tips: m[4]!, mist: m[5]! }));
const sents = (t: string) => t.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const EN = /\b(core|range of motion|ROM|tempo|reps|sets?|bar|rack|press|pull|push|swing|squat|deadlift|row|cable|lockout|spotter|hip|glute|lats|warm-?up|cool-?down|brace|grip|kettlebell|dumbbell|band)\b/i;
const JARGON = /excentry|koncentry|izometry|\bROM\b|zakres ruchu|stabilizacj|aktywacj|mobilizacj|izolacj|\bRIR\b|\bRPE\b|latissimus|naramienn|czworogłow|kulszowo/i;
const NOUNS = new Set(["tyłem", "krzesłem", "ciałem", "stołem", "kołem", "hasłem", "łokciem"]);
const gendered = (t: string) => (t.match(/\p{L}+/gu) ?? []).some((w) => /(łeś|łaś|łem|łam|łbyś|łabyś|łbym|łabym)$/i.test(w) && w.length > 5 && !NOUNS.has(w.toLowerCase()));

afterAll(async () => { await pool.end(); });

describe("migration 0061: texts for the client", () => {
  it("140 entries, every slug once", () => {
    expect(rows).toHaveLength(140);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(140);
  });
  it("description: 1–2 short sentences; tips: 2–3; one mistake; instruction up to 4 sentences", () => {
    for (const r of rows) {
      expect(sents(r.desc).length, `${r.slug} opis`).toBeGreaterThanOrEqual(1); expect(sents(r.desc).length, `${r.slug} opis`).toBeLessThanOrEqual(2); expect(r.desc.length, `${r.slug} opis`).toBeLessThanOrEqual(200);
      expect(sents(r.tips).length, `${r.slug} wskazówki`).toBeGreaterThanOrEqual(2); expect(sents(r.tips).length, `${r.slug} wskazówki`).toBeLessThanOrEqual(3);
      expect(sents(r.mist).length, `${r.slug} błąd`).toBe(1);
      if (r.how) expect(sents(r.how).length, `${r.slug} instrukcja`).toBeLessThanOrEqual(4);
    }
  });
  it("no English words, no jargon, no forms that depend on gender, no foreign-alphabet characters", () => {
    for (const r of rows) for (const [f, t] of [["opis", r.desc], ["instrukcja", r.how ?? ""], ["wskazówki", r.tips], ["błąd", r.mist]] as const) {
      expect(EN.test(t), `${r.slug} ${f}: angielskie słowo`).toBe(false);
      expect(JARGON.test(t), `${r.slug} ${f}: żargon`).toBe(false);
      expect(gendered(t), `${r.slug} ${f}: forma zależna od płci`).toBe(false);
      expect(/[Ѐ-ӿ]/.test(t), `${r.slug} ${f}: znak spoza alfabetu łacińskiego`).toBe(false);
    }
  });
  it("one-shot with a backup; nothing destructive; names are not changed", () => {
    expect(SQL).toContain("catalogue_text_backup"); expect(SQL).toContain("NOT IN (SELECT exercise_id FROM catalogue_text_backup WHERE migration = '0061')");
    expect(SQL).not.toMatch(/^\s*(DELETE|TRUNCATE)\b|\b(DROP|RENAME)\b/im);
    expect(SQL).not.toMatch(/SET[^;]*\bname\s*=/i);
  });
  it("in the test database the texts are in place (for the exercises that exist there)", async () => {
    const db_rows = await db.select().from(exercisesTable).where(inArray(exercisesTable.slug, rows.map((r) => r.slug)));
    expect(db_rows.length).toBeGreaterThan(40);
    for (const d of db_rows) { const r = rows.find((x) => x.slug === d.slug)!; expect(d.description, d.slug).toBe(r.desc); expect(d.coachingTips, d.slug).toBe(r.tips); expect(d.commonMistakes, d.slug).toBe(r.mist); }
  });
});
