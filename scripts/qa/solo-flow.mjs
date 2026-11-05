// Ścieżka nowego konta Solo na nowym wyglądzie: rejestracja (imię) → własny plan → „Dziś” → start (byczek) → serie ze stoperem → offline w trakcie → koniec → story → „Gotowe”.
// Użycie: node solo-flow.mjs <chromium375|iphone|android|desktop> <light|dark>   (stos QA: scripts/qa-stack.sh; zrzuty do $QA_OUT)
import { chromium, webkit, devices } from "playwright";
import { ensureUser, ticketFor, login, inspect, hooks, note, BASE } from "./lib.mjs";
const [kind = "chromium375", theme = "light"] = process.argv.slice(2);
const dark = theme === "dark";
const spec = {
  chromium375: { engine: chromium, ctx: { viewport: { width: 375, height: 812 }, hasTouch: true }, tag: "375" },
  iphone: { engine: webkit, ctx: { ...devices["iPhone 13"] }, tag: "iphone" },
  android: { engine: chromium, ctx: { ...devices["Pixel 7"] }, tag: "android" },
  desktop: { engine: chromium, ctx: { viewport: { width: 1440, height: 900 } }, tag: "1440" },
}[kind];
const group = `solo-${spec.tag}`;
const browser = await spec.engine.launch();
const ctx = await browser.newContext({ ...spec.ctx, locale: "pl-PL", colorScheme: theme, acceptDownloads: true });
await ctx.addInitScript((t) => { try { localStorage.setItem("optimatren-theme", t); } catch {} }, theme);
const page = await ctx.newPage(); const errors = []; hooks(page, group, errors);
const user = await ensureUser(`qaSolo${kind}${theme}${Date.now() % 100000}`);
const START = "/client-landing/plan";
const log = (...a) => console.log(`[${group}/${theme}]`, ...a);
const shot = async (name, wait = 900) => {
  const res = await inspect(page, { screen: `${group} ${name}`, tag: spec.tag, theme, shotName: `solo-${name}`, wait });
  if (res.r.overflowX > 2) {
    const off = await page.evaluate(() => { const W = window.innerWidth; const out = []; document.querySelectorAll("body *").forEach((el) => { const b = el.getBoundingClientRect(); if (b.width > 0 && b.right > W + 1) out.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}].${String(el.className).slice(0, 50)} right=${Math.round(b.right)}`); }); return out.slice(0, 6); });
    log(`PRZEWIJANIE ${name}:`, res.r.overflowX, "px;", off.join(" | "));
  }
  return res;
};
const fail = (msg) => { note(`${group} ${name_}`, msg, "krytyczny"); log("BŁĄD:", msg); };
let name_ = "start";
async function must(locator, what, timeout = 15000) { try { await locator.first().waitFor({ state: "visible", timeout }); return true; } catch { note(`${group} ${name_} [${spec.tag}/${theme}]`, `Nie widać: ${what}`, "krytyczny"); log("NIE WIDAĆ:", what); return false; } }

try {
  await login(page, await ticketFor(user), "/");   // logowanie na stronie panelu (jedno logowanie dla wszystkich), potem portal
  await page.goto(BASE + START, { waitUntil: "domcontentloaded" });
  name_ = "rejestracja-imie";
  if (await must(page.getByLabel("Jak masz na imię?"), "pole imienia (Solo, start)", 30000)) {
    await shot("01-start");
    await page.getByLabel("Jak masz na imię?").fill("Ola");
    await page.getByRole("button", { name: "Zaczynamy" }).click();
    await page.waitForTimeout(1500);
    await shot("02-po-starcie");
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  name_ = "dzis-bez-planu";
  if (await must(page.getByTestId("own-plan-entry"), "„Mam własny plan” na karcie Solo")) {
    await shot("03-dzis-bez-planu");
    await page.getByTestId("own-plan-entry").click();
    name_ = "edytor";
    await must(page.getByRole("dialog", { name: "Mój własny plan" }), "edytor własnego planu");
    await shot("04-edytor-pusty");
    await page.getByRole("button", { name: "Dodaj ćwiczenie" }).first().click();
    await page.getByLabel("Szukaj ćwiczenia").fill("przysiad");
    await must(page.getByTestId("hit"), "wyniki wyszukiwarki");
    await shot("05-wyszukiwarka");
    await page.getByTestId("hit").first().click();
    await page.getByLabel(/^Serie:/).first().fill("2");
    await page.getByLabel("Nazwa dnia 1").fill("Dzień A");
    await shot("06-edytor-z-cwiczeniem");
    await page.getByRole("button", { name: "Zapisz plan" }).click();
    await page.waitForTimeout(2500);
  }
  name_ = "dzis-z-planem";
  if (await must(page.getByTestId("home-training"), "karta „Trening na dziś”", 30000)) {
    await shot("07-dzis-z-planem", 1200);
    name_ = "start-treningu";
    await page.getByRole("button", { name: /Zacznij trening/ }).click();
    if (await page.getByTestId("start-overlay").isVisible().catch(() => false)) { await page.waitForTimeout(400); await shot("08-start-byczek", 100); }
    await must(page.getByRole("button", { name: "Zapisz serię" }), "ekran serii (po animacji startu)", 8000);
    name_ = "seria";
    await shot("09-ekran-serii");
    // offline w trakcie treningu: zapis serii bez sieci
    await ctx.setOffline(true);
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Zapisz serię" }).click();
    name_ = "przerwa-offline";
    await must(page.getByTestId("rest-timer"), "stoper przerwy po zapisie serii (offline)");
    await shot("10-przerwa", 500);
    await page.getByRole("button", { name: "Pomiń przerwę" }).click();
    name_ = "offline-banner";
    const banner = await page.getByTestId("offline-banner").isVisible().catch(() => false);
    if (!banner) note(`${group} offline-banner [${spec.tag}/${theme}]`, "Brak banera „Brak internetu” po utracie sieci w trakcie treningu", "ważny");
    await shot("11-offline-w-treningu", 300);
    await ctx.setOffline(false);
    await page.waitForTimeout(2500);
    if (await page.getByTestId("offline-banner").isVisible().catch(() => false)) note(`${group} offline-banner [${spec.tag}/${theme}]`, "Baner offline nie znika po powrocie sieci", "ważny");
    name_ = "seria-2";
    await page.getByRole("button", { name: "Zapisz serię" }).click();
    await page.waitForTimeout(500);
    const toSummary = page.getByRole("button", { name: "Przejdź do podsumowania" });
    if (await page.getByTestId("rest-timer").isVisible().catch(() => false)) await page.getByRole("button", { name: "Pomiń przerwę" }).click();
    if (await must(toSummary, "„Przejdź do podsumowania” po ostatniej serii", 8000)) await toSummary.click();
    name_ = "koniec";
    if (await must(page.getByTestId("finish-v2"), "ekran końca treningu")) {
      await shot("12-koniec", 1000);
      await page.getByRole("radio", { name: "W sam raz" }).click();
      name_ = "story";
      const dl = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
      await page.getByRole("button", { name: /Udostępnij na story/ }).click();
      const d = await dl;
      if (d) { const suggested = d.suggestedFilename(); log("story pobrane:", suggested); if (!/\.png$/i.test(suggested)) note(`${group} story`, `Zły plik story: ${suggested}`, "ważny"); }
      else log("story: brak pobrania (Web Share lub blokada) — sprawdź ręcznie");
      await page.waitForTimeout(600);
      await shot("13-po-story", 300);
      await page.getByRole("button", { name: "Gotowe" }).click();
      name_ = "dzis-po-treningu";
      await must(page.getByTestId("home-v2"), "„Dziś” po treningu", 20000);
      await shot("14-dzis-po-treningu", 2500);
    }
    name_ = "postepy-ty";
    await page.getByRole("button", { name: "Postępy" }).click(); await page.waitForTimeout(1500); await shot("15-postepy");
    await page.getByRole("button", { name: "Ty" }).click(); await page.waitForTimeout(1500); await shot("16-ty");
  }
} catch (e) { note(`${group} ${name_}`, `Wyjątek skryptu: ${String(e.message).split("\n")[0].slice(0, 160)}`, "krytyczny"); log("WYJĄTEK:", String(e.message).split("\n")[0]); }
const errs = [...new Set(errors)]; if (errs.length) { log("błędy konsoli/sieci:", errs.slice(0, 6).join(" | ")); note(`${group} (cała ścieżka)`, `Błędy konsoli/sieci: ${errs.slice(0, 5).join(" | ")}`, "ważny"); }
await browser.close();
log("koniec");
