// Zrzuty ekranów prototypu Solo / Postępy (375 px, jasny i ciemny) do docs/screens/solo/.
// Wymaga: serwera portalu w trybie DEV (strona /solo-preview, bez Clerk, z zamockowanym API) oraz Playwrighta z ~/tools/pw.
//   cd artifacts/client-landing && PORT=22391 BASE_PATH=/client-landing/ pnpm exec vite --host 127.0.0.1 --port 22391
//   node scripts/screens-solo.mjs [adres_bazowy]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(homedir(), "tools/pw/package.json"));
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://127.0.0.1:22391/client-landing";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../docs/screens/solo");
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ["1-solo-start", "solo-start"], ["2-solo-po-starcie", "solo-created"], ["3-dzis", "dzis"], ["4-plan", "plan"],
  ["5-postepy", "postepy"], ["6-postepy-puste", "postepy-puste"], ["7-ty", "ty"], ["8-ty-solo", "ty-solo"],
];
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("optimatren-theme", t); } catch { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  for (const [name, screen] of SCREENS) {
    await page.goto(`${BASE}/solo-preview?screen=${screen}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    // the bottom bar is fixed: give the page its full height so the bar sits at the bottom of the picture
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 375, height: Math.max(812, h) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${name}-${theme}.png`), fullPage: true });
    console.log("ok", name, theme);
  }
  await ctx.close();
}
await browser.close();
