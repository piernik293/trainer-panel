import { chromium } from "playwright";
import { ticketFor, login, BASE } from "./lib.mjs";
import { readFileSync } from "fs";
const ids = JSON.parse(readFileSync(`${process.env.HOME}/tools/pw/qa/accounts.json`));
const [acct, route] = process.argv.slice(2);
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "pl-PL" })).newPage();
page.on("console", async (m) => { if (m.type() === "error") { const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?"))); console.log("ERR:", args.map((x) => String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 400)).join(" || ").slice(0, 1100)); } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e.message).slice(0, 300)));
await login(page, await ticketFor(ids[acct]), "/"); await page.goto(BASE + route, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000);
for (const t of (process.env.TABS ?? "").split(",").filter(Boolean)) { console.log("-- zakładka", t); await page.getByRole("tab", { name: t, exact: true }).click().catch(() => console.log("nie da się kliknąć", t)); await page.waitForTimeout(1500); }
await b.close();
