/** Extracts the text of a PDF produced by services/pdf/pdfDoc (Type0 fonts + ToUnicode) — for tests only. */
import { inflateSync } from "node:zlib";

export function pdfStreams(pdf: Buffer): string[] {
  const s = pdf.toString("latin1"); const out: string[] = [];
  for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const start = m.index! + "stream\n".length;
    try { out.push(inflateSync(pdf.subarray(start, start + m[1]!.length)).toString("latin1")); } catch { /* not flate */ }
  }
  return out;
}

export function pdfText(pdf: Buffer): string {
  const streams = pdfStreams(pdf);
  const maps = streams.filter((x) => x.includes("beginbfchar")).map((x) => new Map([...x.matchAll(/<([0-9a-f]{4})>\s+<([0-9a-f]{4})>/gi)].map((m) => [m[1]!.toLowerCase(), String.fromCharCode(parseInt(m[2]!, 16))])));
  const fontMap: Record<string, Map<string, string>> = { F1: maps[0]!, F2: maps[1]! };
  let text = "";
  for (const c of streams.filter((x) => x.includes(" Tj"))) {
    for (const m of c.matchAll(/\/(F[12]) [\d.]+ Tf[^<]*<([0-9a-f]*)> Tj/gi)) {
      const mp = fontMap[m[1]!]!; const hex = m[2]!;
      for (let i = 0; i < hex.length; i += 4) text += mp.get(hex.slice(i, i + 4).toLowerCase()) ?? "�";
      text += "\n";
    }
  }
  return text;
}

/** Verifies the cross-reference table: every offset points at "N 0 obj", startxref points at "xref". */
export function checkXref(pdf: Buffer): string[] {
  const errs: string[] = []; const s = pdf.toString("latin1");
  if (!s.startsWith("%PDF-1.")) errs.push("brak nagłówka");
  if (!s.trimEnd().endsWith("%%EOF")) errs.push("brak %%EOF");
  const sx = Number(/startxref\n(\d+)\n/.exec(s)?.[1]);
  if (s.slice(sx, sx + 4) !== "xref") errs.push("startxref nie wskazuje xref");
  const entries = [...s.slice(sx).matchAll(/(\d{10}) (\d{5}) n /g)];
  entries.forEach((e, i) => { if (s.slice(Number(e[1]), Number(e[1]) + `${i + 1} 0 obj`.length) !== `${i + 1} 0 obj`) errs.push(`obiekt ${i + 1}: zły offset`); });
  const size = Number(/\/Size (\d+)/.exec(s)?.[1]); if (size !== entries.length + 1) errs.push("rozmiar xref");
  return errs;
}
