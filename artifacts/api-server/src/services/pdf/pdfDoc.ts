/**
 * A very small PDF writer (A4, text + rectangles + lines) with embedded TrueType fonts (Type0 / Identity-H) — no dependencies.
 * Text is searchable/copyable (ToUnicode map). Coordinates: points, origin at the TOP-LEFT of the page (y grows downwards) — converted inside.
 */
import { deflateSync } from "node:zlib";
import { parseTtf, type TtfFont } from "./ttf";

export type Rgb = [number, number, number]; // 0..1
export const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const A4 = { w: 595.28, h: 841.89 };

export type FontKey = "regular" | "bold";
interface FontRes { key: FontKey; ttf: TtfFont; name: string; used: Map<number, number> /* gid → unicode */ }

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const color = (c: Rgb) => `${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])}`;
const be16 = (n: number) => n.toString(16).padStart(4, "0");

export class PdfPage {
  readonly ops: string[] = [];
  constructor(private doc: PdfDoc) {}
  private y(top: number) { return A4.h - top; }

  textWidth(s: string, size: number, font: FontKey = "regular"): number { return this.doc.textWidth(s, size, font); }
  wrap(s: string, width: number, size: number, font: FontKey = "regular"): string[] { return this.doc.wrap(s, width, size, font); }

  /** Draws one line of text. (x, top) is the baseline position measured from the top-left corner. */
  text(x: number, top: number, s: string, o: { size?: number; font?: FontKey; color?: Rgb; align?: "left" | "right" | "center" } = {}): void {
    const size = o.size ?? 10, font = o.font ?? "regular";
    const w = this.textWidth(s, size, font);
    const px = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops.push(`BT /${this.doc.fontName(font)} ${fmt(size)} Tf ${color(o.color ?? [0.1, 0.1, 0.1])} rg ${fmt(px)} ${fmt(this.y(top))} Td <${this.doc.encode(s, font)}> Tj ET`);
  }
  rect(x: number, top: number, w: number, h: number, o: { fill?: Rgb; stroke?: Rgb; lineWidth?: number } = {}): void {
    const parts = [`${fmt(x)} ${fmt(this.y(top + h))} ${fmt(w)} ${fmt(h)} re`];
    if (o.fill) parts.unshift(`${color(o.fill)} rg`);
    if (o.stroke) parts.unshift(`${color(o.stroke)} RG ${fmt(o.lineWidth ?? 0.75)} w`);
    parts.push(o.fill && o.stroke ? "B" : o.fill ? "f" : "S");
    this.ops.push(parts.join(" "));
  }
  line(x1: number, top1: number, x2: number, top2: number, o: { color?: Rgb; width?: number } = {}): void {
    this.ops.push(`${color(o.color ?? [0.8, 0.8, 0.8])} RG ${fmt(o.width ?? 0.75)} w ${fmt(x1)} ${fmt(this.y(top1))} m ${fmt(x2)} ${fmt(this.y(top2))} l S`);
  }
}

export class PdfDoc {
  private fonts: Record<FontKey, FontRes>;
  readonly pages: PdfPage[] = [];
  constructor(fonts: { regular: Buffer; bold: Buffer }, private info: { title: string; author?: string; subject?: string }) {
    this.fonts = {
      regular: { key: "regular", ttf: parseTtf(fonts.regular), name: "F1", used: new Map() },
      bold: { key: "bold", ttf: parseTtf(fonts.bold), name: "F2", used: new Map() },
    };
  }
  fontName(k: FontKey) { return this.fonts[k].name; }
  addPage(): PdfPage { const p = new PdfPage(this); this.pages.push(p); return p; }

  private gid(f: FontRes, ch: string): number {
    const cp = ch.codePointAt(0)!;
    let g = f.ttf.glyphOf(cp);
    if (!g) g = f.ttf.glyphOf(cp === 0xa0 ? 0x20 : 0x3f); // no-break space → space; anything else → "?"
    return g;
  }
  textWidth(s: string, size: number, k: FontKey): number {
    const f = this.fonts[k]; let w = 0;
    for (const ch of s) w += f.ttf.advance(this.gid(f, ch));
    return (w / f.ttf.unitsPerEm) * size;
  }
  encode(s: string, k: FontKey): string {
    const f = this.fonts[k]; let out = "";
    for (const ch of s) { const g = this.gid(f, ch); if (!f.used.has(g)) f.used.set(g, ch.codePointAt(0)!); out += be16(g); }
    return out;
  }
  wrap(s: string, width: number, size: number, k: FontKey): string[] {
    const lines: string[] = [];
    for (const para of s.split(/\r?\n/)) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && this.textWidth(next, size, k) > width) { lines.push(cur); cur = word; } else cur = next;
      }
      lines.push(cur);
    }
    return lines;
  }

  build(): Buffer {
    const objs: Buffer[] = []; // object n is objs[n-1]
    const add = (b: Buffer | string) => { objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1")); return objs.length; };
    const stream = (dict: string, data: Buffer) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]);
    const reserve = () => { objs.push(Buffer.alloc(0)); return objs.length; };

    const catalog = reserve(), pagesObj = reserve();
    const fontObjs: Record<FontKey, number> = { regular: 0, bold: 0 };
    for (const k of ["regular", "bold"] as const) {
      const f = this.fonts[k];
      const name = `Manrope${k === "bold" ? "-Bold" : "-Regular"}`;
      const file = add(stream(`/Length1 ${f.ttf.data.length}`, deflateSync(f.ttf.data)));
      const s = 1000 / f.ttf.unitsPerEm;
      const desc = add(`<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [${f.ttf.bbox.map((v) => Math.round(v * s)).join(" ")}] /ItalicAngle 0 /Ascent ${Math.round(f.ttf.ascent * s)} /Descent ${Math.round(f.ttf.descent * s)} /CapHeight ${Math.round(f.ttf.ascent * s * 0.7)} /StemV ${k === "bold" ? 140 : 80} /FontFile2 ${file} 0 R >>`);
      const gids = [...f.used.keys()].sort((a, b) => a - b);
      const widths = gids.map((g) => `${g} [${Math.round(f.ttf.advance(g) * s)}]`).join(" ");
      const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /CIDToGIDMap /Identity /DW 600 /W [${widths}] >>`);
      const bf = gids.map((g) => `<${be16(g)}> <${(f.used.get(g)! > 0xffff ? "" : be16(f.used.get(g)!))}>`).join("\n");
      const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange ${gids.length} beginbfchar\n${bf}\nendbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
      const tu = add(stream("", deflateSync(Buffer.from(cmap, "latin1"))));
      fontObjs[k] = add(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    }
    const pageIds: number[] = [];
    for (const p of this.pages) {
      const content = add(stream("", deflateSync(Buffer.from(p.ops.join("\n"), "latin1"))));
      pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${fontObjs.regular} 0 R /F2 ${fontObjs.bold} 0 R >> >> /Contents ${content} 0 R >>`));
    }
    objs[pagesObj - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");
    objs[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesObj} 0 R /Lang (pl-PL) >>`, "latin1");
    const esc = (s: string) => Buffer.from(s, "utf16le").swap16();
    const strObj = (s: string) => Buffer.concat([Buffer.from("<FEFF", "latin1"), Buffer.from(esc(s).toString("hex"), "latin1"), Buffer.from(">", "latin1")]);
    const infoObj = add(Buffer.concat([Buffer.from("<< /Title ", "latin1"), strObj(this.info.title), Buffer.from(" /Producer ", "latin1"), strObj("Optimatren"), ...(this.info.author ? [Buffer.from(" /Author ", "latin1"), strObj(this.info.author)] : []), Buffer.from(" >>", "latin1")]));

    const head = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
    const parts: Buffer[] = [head]; const offsets: number[] = []; let pos = head.length;
    objs.forEach((o, i) => { offsets.push(pos); const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]); parts.push(b); pos += b.length; });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${o.toString().padStart(10, "0")} 00000 n \n`)].join("");
    parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
    return Buffer.concat(parts);
  }
}
