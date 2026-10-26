import { describe, it, expect } from "vitest";
import { buildSavePayload, defaultChoice, rowWarnings, type AnalyzedDay, type AnalyzedRow, type Choice } from "../planImportUi";

const row = (line: number, over: Partial<AnalyzedRow> = {}): AnalyzedRow => ({
  line, exerciseText: `Ćwiczenie ${line}`, sets: 3, repsMin: 8, repsMax: 12, repsText: "8-12", loadText: "40 kg", rir: 2, note: "", errors: [],
  match: { exerciseId: line * 10, name: `Katalog ${line}`, score: 1 }, candidates: [], jointWarning: null, equipmentProblem: null, ...over,
});
const days = (rows: AnalyzedRow[]): AnalyzedDay[] => [{ name: "Dzień 1", rows }];

describe("plan import — choices and payload", () => {
  it("default: the best match; no match → own exercise with the file's name; a row with errors → skipped", () => {
    expect(defaultChoice(row(1))).toEqual({ kind: "exercise", exerciseId: 10 });
    expect(defaultChoice(row(2, { match: null }))).toEqual({ kind: "custom", name: "Ćwiczenie 2" });
    expect(defaultChoice(row(3, { errors: ["Serie: liczba całkowita 1–20."] }))).toEqual({ kind: "skip" });
  });
  it("payload: chosen exercises, own exercises, skipped rows left out, empty days dropped", () => {
    const d = days([row(1), row(2, { match: null }), row(3)]);
    const choices: Record<number, Choice> = { 3: { kind: "skip" } };
    const p = buildSavePayload("Mój plan", "plan", d, choices, false);
    expect(p.days).toHaveLength(1);
    expect(p.days[0]!.exercises.map((e) => [e.exerciseId, (e as { customName?: string }).customName])).toEqual([[10, undefined], [null, "Ćwiczenie 2"]]);
    expect(p.days[0]!.exercises[0]).toMatchObject({ sets: 3, repsMin: 8, repsMax: 12, loadText: "40 kg", rir: 2 });
    expect(buildSavePayload("x", "template", days([row(1)]), { 1: { kind: "skip" } }, false).days).toEqual([]);
    expect(p.acknowledgeJointWarning).toBe(false); expect(p.target).toBe("plan");
  });
  it("missing sets default to 3; the trainer's switch to another candidate is used", () => {
    const p = buildSavePayload("x", "plan", days([row(1, { sets: null })]), { 1: { kind: "exercise", exerciseId: 77 } }, true);
    expect(p.days[0]!.exercises[0]).toMatchObject({ exerciseId: 77, sets: 3 }); expect(p.acknowledgeJointWarning).toBe(true);
  });
  it("warnings count only for the best-match choice; equipment problems block saving", () => {
    const d = days([row(1, { jointWarning: "Klient zgłosił ból: bark." }), row(2, { equipmentProblem: "Wymaga sztangi." })]);
    expect(rowWarnings(d, {}).joint.map((r) => r.line)).toEqual([1]);
    expect(rowWarnings(d, {}).equipment.map((r) => r.line)).toEqual([2]);
    expect(rowWarnings(d, { 2: { kind: "skip" } }).equipment).toEqual([]);
    expect(rowWarnings(d, { 2: { kind: "exercise", exerciseId: 999 } }).equipment).toEqual([]);
  });
});
