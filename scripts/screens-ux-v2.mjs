// Zrzuty nowego wyglądu portalu (375 px, jasny i ciemny) do docs/screens/ux-v2/.
// Wymaga: serwera portalu w trybie DEV (strona /ux-v2-preview, bez Clerk, z zamockowanym API) oraz Playwrighta z ~/tools/pw.
//   cd artifacts/client-landing && PORT=22391 BASE_PATH=/client-landing/ pnpm exec vite --host 127.0.0.1 --port 22391
//   node scripts/screens-ux-v2.mjs [adres_bazowy]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(homedir(), "tools/pw/package.json"));
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://127.0.0.1:22391/client-landing";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../docs/screens/ux-v2");
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ["1-dzis", "dzis"], ["2-dzis-odpoczynek", "dzis-odpoczynek"], ["3-dzis-nowe-konto", "dzis-nowe-konto"], ["4-dzis-brak-planu", "dzis-brak-planu"],
  ["5-koniec", "koniec"], ["6-koniec-po-bolu", "koniec-bol"], ["7-story", "story"], ["8-postepy", "postepy"], ["9-postepy-nowe-konto", "postepy-nowe"],
  ["10-ty", "ty"], ["11-ty-bez-nicka", "ty-bez-nicka"], ["12-edycja-profilu", "edycja"], ["13-przerwa", "przerwa"], ["14-przerwa-koniec", "przerwa-koniec"], ["15-ty-zloty-byczek", "ty-byczek"],
];
const browser = await chromium.launch();
let bad = 0;
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("optimatren-theme", t); } catch { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { bad++; console.error("pageerror:", e.message); });
  for (const [name, screen] of SCREENS) {
    await page.goto(`${BASE}/ux-v2-preview?screen=${screen}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 375, height: Math.max(812, h) });
    await page.waitForTimeout(200);
    // 375 px: no horizontal scroll; every button / link at least 44 px high
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > 376);
    const small = await page.$$eval("button, a[href]", (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map((e) => `${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30)}:${Math.round(e.getBoundingClientRect().height)}`));
    if (wide) { bad++; console.error(`POZIOMY SCROLL: ${name} ${theme}`); }
    if (small.length) { bad++; console.error(`ZA NISKIE (<44 px): ${name} ${theme}: ${small.join(" | ")}`); }
    await page.screenshot({ path: join(OUT, `${name}-${theme}.png`), fullPage: true });
    console.log("ok", name, theme);
  }
  await ctx.close();
}
await browser.close();
if (bad) { console.error(`Uwagi: ${bad}`); process.exit(1); }
