// Pliki marki z jednego źródła (logo A „Rogate O”): SVG (public/brand) i ikony PNG (favicon, apple-touch, PWA 192/512/maskable) obu aplikacji.
// Zmiana logo na wariant B lub C = podmiana ICON_PATHS niżej (i lib/design-tokens/src/brand/Logo.tsx), potem: node scripts/brand-assets.mjs
// Wymaga Playwrighta z ~/tools/pw (renderuje SVG do PNG).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(homedir(), "tools/pw/package.json"));
const { chromium } = require("playwright");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCENT = "#C2410C";
const ICON_PATHS = (c) => `<path d="M22 34 C 14 22, 14 12, 22 6 C 22 16, 28 24, 36 28" fill="${c}"/><path d="M78 34 C 86 22, 86 12, 78 6 C 78 16, 72 24, 64 28" fill="${c}"/><circle cx="50" cy="58" r="30" fill="none" stroke="${c}" stroke-width="13"/>`;
const iconSvg = (c, size = 100) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Optimatren">${ICON_PATHS(c)}</svg>`;
const wordSvg = (c, text) => `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="100" viewBox="0 0 420 100" role="img" aria-label="Optimatren"><g>${ICON_PATHS(c)}</g><text x="112" y="72" font-family="Manrope, 'Segoe UI', Arial, sans-serif" font-weight="800" font-size="62" letter-spacing="-0.6" fill="${text}">optimatren</text></svg>`;
/** Kwadrat ikony: kolor akcentu, białe „Rogate O” wyśrodkowane (ikona zajmuje `fill` wysokości; maskable: strefa bezpieczna 80%). */
const tile = (size, { fill, radius }) => {
  const s = (size * fill) / 100; // rozmiar ikony w px
  const off = (size - s) / 2;
  const bg = radius > 0 ? `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${ACCENT}"/>` : `<rect width="${size}" height="${size}" fill="${ACCENT}"/>`;
  // ikona zajmuje y 6..88 (środek 47) — przesuwamy tak, by jej środek wizualny leżał w środku kafelka
  const dy = ((50 - 47) * s) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g transform="translate(${off} ${off + dy}) scale(${s / 100})">${ICON_PATHS("#FFFFFF")}</g></svg>`;
};

const ICONS = [
  ["favicon-32.png", 32, { fill: 74, radius: 0.2 }], ["favicon-512.png", 512, { fill: 66, radius: 0.2 }], ["apple-touch-icon.png", 180, { fill: 64, radius: 0 }],
  ["icon-192.png", 192, { fill: 66, radius: 0.2 }], ["icon-512.png", 512, { fill: 66, radius: 0.2 }], ["icon-maskable-512.png", 512, { fill: 52, radius: 0 }],
];
const APPS = { "client-landing": ICONS, "trainer-app": ICONS.filter(([n]) => ["favicon-32.png", "favicon-512.png", "apple-touch-icon.png"].includes(n)) };

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
for (const [app, icons] of Object.entries(APPS)) {
  const pub = join(ROOT, "artifacts", app, "public");
  mkdirSync(join(pub, "brand"), { recursive: true });
  writeFileSync(join(pub, "brand/logo.svg"), wordSvg(ACCENT, "#1C1917"));
  writeFileSync(join(pub, "brand/logo-white.svg"), wordSvg("#FFFFFF", "#FFFFFF"));
  writeFileSync(join(pub, "brand/logo-icon.svg"), iconSvg(ACCENT));
  writeFileSync(join(pub, "brand/logo-icon-white.svg"), iconSvg("#FFFFFF"));
  for (const [name, size, opt] of icons) await png(tile(size, opt), size, join(pub, name));
  console.log("ok", app, icons.map(([n]) => n).join(", "));
}
await browser.close();
