// Nowe ekrany (strony podglądu DEV bez Clerk) w prawdziwym WebKit (silnik Safari) i Chromium z profilem Androida: przewijanie poziome, cele < 44 px, błędy strony.
import { webkit, chromium, devices } from "playwright";
const BASE = "http://127.0.0.1:22391/client-landing";
const SCREENS = ["dzis", "dzis-odpoczynek", "dzis-nowe-konto", "dzis-brak-planu", "koniec", "koniec-bol", "story", "postepy", "postepy-nowe", "ty", "ty-bez-nicka", "ty-byczek", "edycja", "przerwa", "przerwa-koniec", "wlasny-plan"];
const OUT = process.env.QA_OUT ?? "/tmp/qaprobe"; let bad = 0;
for (const [label, engine, dev] of [["iphone-webkit", webkit, devices["iPhone 13"]], ["android-chromium", chromium, devices["Pixel 7"]]]) {
  const b = await engine.launch();
  for (const theme of ["light", "dark"]) {
    const ctx = await b.newContext({ ...dev, colorScheme: theme, locale: "pl-PL" });
    await ctx.addInitScript((t) => { try { localStorage.setItem("optimatren-theme", t); } catch {} }, theme);
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 120)));
    for (const s of SCREENS) {
      errs.length = 0;
      await page.goto(`${BASE}/ux-v2-preview?screen=${s}`, { waitUntil: "networkidle" }); await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const W = window.innerWidth; const small = [];
        document.querySelectorAll("button,a[href]").forEach((el) => { const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0 && (b.height < 43.5 || b.width < 43.5) && !/^(Pn|Wt)$/.test(el.textContent ?? "")) small.push(`${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)} ${Math.round(b.width)}x${Math.round(b.height)}`); });
        return { over: document.scrollingElement.scrollWidth - W, small: small.slice(0, 5), n: small.length, len: (document.body.innerText || "").trim().length };
      });
      const flag = r.over > 2 || errs.length || r.len < 20;
      if (flag) { bad++; console.log(`UWAGA ${label}/${theme} ${s}: przewijanie ${r.over}px, tekst ${r.len}, błędy ${errs.join("|")}`); }
      if (r.n) console.log(`  małe cele ${label}/${theme} ${s} (${r.n}): ${r.small.join(", ")}`);
      if (s === "dzis" || s === "koniec" || s === "wlasny-plan") await page.screenshot({ path: `${OUT}/webkit-${label}-${s}-${theme}.png`, fullPage: true });
    }
    await ctx.close();
  }
  await b.close();
}
console.log("koniec, uwagi:", bad);
