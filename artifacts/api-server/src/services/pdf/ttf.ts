/** Minimal TrueType reader for PDF embedding: unicode → glyph id (cmap format 4), advance widths, vertical metrics. No dependencies. */
export interface TtfFont {
  data: Buffer;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
  numGlyphs: number;
  glyphOf(cp: number): number; // 0 when the font has no glyph
  advance(gid: number): number; // in font units
}

export function parseTtf(data: Buffer): TtfFont {
  const n = data.readUInt16BE(4);
  const tbl = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < n; i++) {
    const o = 12 + 16 * i;
    tbl.set(data.toString("latin1", o, o + 4), { off: data.readUInt32BE(o + 8), len: data.readUInt32BE(o + 12) });
  }
  const need = (t: string) => { const e = tbl.get(t); if (!e) throw new Error(`TTF: brak tabeli ${t}`); return e.off; };
  const head = need("head"), hhea = need("hhea"), maxp = need("maxp"), hmtx = need("hmtx"), cmapOff = need("cmap");
  const unitsPerEm = data.readUInt16BE(head + 18);
  const bbox: [number, number, number, number] = [data.readInt16BE(head + 36), data.readInt16BE(head + 38), data.readInt16BE(head + 40), data.readInt16BE(head + 42)];
  const ascent = data.readInt16BE(hhea + 4), descent = data.readInt16BE(hhea + 6), numHM = data.readUInt16BE(hhea + 34);
  const numGlyphs = data.readUInt16BE(maxp + 4);
  const map = new Map<number, number>();
  const sub = data.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < sub; i++) {
    const pid = data.readUInt16BE(cmapOff + 4 + 8 * i), eid = data.readUInt16BE(cmapOff + 6 + 8 * i), so = data.readUInt32BE(cmapOff + 8 + 8 * i);
    const base = cmapOff + so;
    if (!((pid === 3 && eid === 1) || pid === 0) || data.readUInt16BE(base) !== 4) continue;
    const segx2 = data.readUInt16BE(base + 6), sc = segx2 / 2;
    const endO = base + 14, startO = base + 16 + segx2, deltaO = startO + segx2, rangeO = deltaO + segx2;
    for (let s = 0; s < sc; s++) {
      const end = data.readUInt16BE(endO + 2 * s), start = data.readUInt16BE(startO + 2 * s), delta = data.readInt16BE(deltaO + 2 * s), ro = data.readUInt16BE(rangeO + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number;
        if (ro === 0) g = (c + delta) & 0xffff;
        else { const p = rangeO + 2 * s + ro + 2 * (c - start); g = data.readUInt16BE(p); if (g) g = (g + delta) & 0xffff; }
        if (g) map.set(c, g);
      }
    }
  }
  return {
    data, unitsPerEm, ascent, descent, bbox, numGlyphs,
    glyphOf: (cp) => map.get(cp) ?? 0,
    advance: (gid) => data.readUInt16BE(hmtx + 4 * Math.min(gid, numHM - 1)),
  };
}
