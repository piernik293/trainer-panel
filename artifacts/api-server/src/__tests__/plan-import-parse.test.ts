import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { makeXlsx } from "./helpers/makeXlsx";
import { readTable, guessMapping, parseRows, parseReps, matchExercise, ImportFileError, MAX_FILE_BYTES, TEMPLATE_CSV } from "../services/planImportParse";

const HEAD = ["Dzień", "Ćwiczenie", "Serie", "Powtórzenia", "Ciężar", "RIR", "Notatka"];
const DATA = [HEAD, ["Dzień 1", "Przysiad ze sztangą", 3, "8-12", "40 kg", 2, "Pięty na podłodze"], ["", "Wyciskanie hantli leżąc", 3, "10", "12", 2, ""], ["Dzień 2", "Martwy ciąg rumuński", 4, "6–8", "", "RIR 3", ""]];

describe("reading files", () => {
  it(".xlsx: strings, numbers, Polish characters", () => {
    const t = readTable(makeXlsx(DATA as (string | number)[][]), "plan.xlsx");
    expect(t.sheet).toBe("Plan"); expect(t.rows[0]).toEqual(HEAD);
    expect(t.rows[1]).toEqual(["Dzień 1", "Przysiad ze sztangą", "3", "8-12", "40 kg", "2", "Pięty na podłodze"]);
  });
  it(".csv: UTF-8 BOM / ; or , / Windows-1250", () => {
    const csv = DATA.map((r) => r.join(";")).join("\r\n");
    expect(readTable(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv)]), "p.csv").rows[0]).toEqual(HEAD);
    expect(readTable(Buffer.from(DATA.map((r) => r.join(",")).join("\n")), "p.csv").rows[1]![1]).toBe("Przysiad ze sztangą");
    const cp = Buffer.from([...("Ćwiczenie;Serie\nŁydki;3")].map((ch) => ({ Ć: 0xc6, Ł: 0xa3 } as Record<string, number>)[ch] ?? ch.charCodeAt(0)));
    expect(readTable(cp, "p.csv").rows).toEqual([["Ćwiczenie", "Serie"], ["Łydki", "3"]]);
  });
  it("template file is readable and maps itself", () => {
    const t = readTable(Buffer.from(TEMPLATE_CSV, "utf8"), "szablon.csv");
    const g = guessMapping(t.rows);
    expect(g.hasHeader).toBe(true); expect(g.mapping).toEqual({ day: 0, exercise: 1, sets: 2, reps: 3, load: 4, rir: 5, note: 6 });
    expect(parseRows(t.rows, g.mapping, true).days.map((d) => d.name)).toEqual(["Dzień 1", "Dzień 2"]);
  });
  it("limits and bad files", () => {
    expect(() => readTable(Buffer.alloc(0), "a.csv")).toThrow(ImportFileError);
    expect(() => readTable(Buffer.alloc(MAX_FILE_BYTES + 1, 65), "a.csv")).toThrow(/za duży/);
    expect(() => readTable(Buffer.from("x"), "a.pdf")).toThrow(/xlsx i \.csv/);
    expect(() => readTable(Buffer.from("PK\u0003\u0004 not a zip at all"), "a.xlsx")).toThrow(ImportFileError);
    expect(() => readTable(Buffer.from("\n\n"), "a.csv")).toThrow(/nie ma żadnych danych/);
    expect(() => readTable(makeXlsx([["a"]]), "plan.csv")).toThrow(); // zip named .csv is not accepted as csv text
  });
  it("a zip bomb is refused (decompressed size cap) instead of eating memory", () => {
    const big = Buffer.alloc(30 * 1024 * 1024, 0x61); const comp = deflateRawSync(big);
    expect(comp.length).toBeLessThan(MAX_FILE_BYTES);
    const name = Buffer.from("xl/workbook.xml");
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(big.length, 22); local.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(big.length, 24); c.writeUInt16LE(name.length, 28);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length + comp.length, 16);
    expect(() => readTable(Buffer.concat([local, name, comp, c, name, end]), "bomb.xlsx")).toThrow(ImportFileError);
  });
});

describe("rows → days", () => {
  it("sheet with day column: blank day continues the previous one; reps ranges, RIR text, empty cells", () => {
    const rows = readTable(makeXlsx(DATA as (string | number)[][]), "p.xlsx").rows;
    const g = guessMapping(rows); const p = parseRows(rows, g.mapping, g.hasHeader);
    expect(p.days.map((d) => [d.name, d.rows.length])).toEqual([["Dzień 1", 2], ["Dzień 2", 1]]);
    expect(p.days[0]!.rows[0]).toMatchObject({ exerciseText: "Przysiad ze sztangą", sets: 3, repsMin: 8, repsMax: 12, loadText: "40 kg", rir: 2, note: "Pięty na podłodze", errors: [] });
    expect(p.days[0]!.rows[1]).toMatchObject({ repsMin: 10, repsMax: 10 });
    expect(p.days[1]!.rows[0]).toMatchObject({ repsMin: 6, repsMax: 8, rir: 3, loadText: "" });
  });
  it("no day column → one day; bad values become row errors, not crashes", () => {
    const rows = [["Ćwiczenie", "Serie", "Powtórzenia", "RIR"], ["Podciąganie", "x", "dużo", "9"], ["Plank", "3", "30s", ""]];
    const g = guessMapping(rows); const p = parseRows(rows, g.mapping, true);
    expect(p.days).toHaveLength(1); expect(p.days[0]!.name).toBe("Dzień 1");
    expect(p.days[0]!.rows[0]!.errors).toHaveLength(3);
    expect(p.days[0]!.rows[1]).toMatchObject({ sets: 3, repsMin: null, repsText: "30s", errors: [expect.stringContaining("Powtórzenia")] });
  });
  it("the exercise column is required", () => { expect(() => parseRows([["a"]], {}, false)).toThrow(/kolumnę z nazwą ćwiczenia/); });
  it("parseReps", () => {
    expect(parseReps("8-12")).toMatchObject({ min: 8, max: 12 }); expect(parseReps("12–8")).toMatchObject({ min: 8, max: 12 });
    expect(parseReps("10")).toMatchObject({ min: 10, max: 10 }); expect(parseReps("AMRAP")).toMatchObject({ min: null, max: null });
  });
});

describe("matching names with the catalogue", () => {
  const cat = [{ id: 1, name: "Przysiad ze sztangą" }, { id: 2, name: "Przysiad ze sztangą z przodu" }, { id: 3, name: "Wyciskanie hantli leżąc" }, { id: 4, name: "Martwy ciąg rumuński ze sztangą" }, { id: 5, name: "Martwy ciąg rumuński z hantlami" }];
  it("exact and inflected names find the right exercise", () => {
    expect(matchExercise("przysiad ze sztangą", cat).best?.exerciseId).toBe(1);
    expect(matchExercise("Wyciskanie hantlami leżąc", cat).best?.exerciseId).toBe(3);
  });
  it("ambiguous or unknown names give NO silent best — only candidates / nothing", () => {
    const amb = matchExercise("Martwy ciąg rumuński", cat);
    expect(amb.best).toBeNull(); expect(amb.candidates.map((c) => c.exerciseId).sort()).toEqual([4, 5]);
    expect(matchExercise("Pływanie kraulem", cat)).toEqual({ best: null, candidates: [] });
    expect(matchExercise("", cat).best).toBeNull();
  });
});
