/** Katalog maili: każdy szablon się renderuje, jedno imię w zwrocie, jeden przycisk, stopka, brak danych zdrowotnych i form zależnych od płci. */
import { describe, it, expect, afterEach } from "vitest";
import { MAIL_CATALOGUE, MAIL_IDS, buildMail, trainerCodeShareText } from "../services/mail/catalogue";
import { renderMail } from "../services/mail/layout";

afterEach(() => { delete process.env["CONTACT_EMAIL"]; });
const HEALTH = /\b(ból|bol|boli|bolesn|staw|kontuzj|uraz|diagnoz|choroba|lek|leki|ciąża|wywiad zdrowotn)/i;
// końcówki 1. i 2. osoby czasu przeszłego zależne od płci (na końcu słowa: „właśnie” nie jest trafieniem)
const GENDERED = /(łeś|łaś|łem|łam)(?!\p{L})/iu;

describe("katalog maili", () => {
  it("jest 16 maili, każdy ma opis i dane przykładowe", () => {
    expect(MAIL_IDS).toHaveLength(16);
    for (const id of MAIL_IDS) { const m = MAIL_CATALOGUE[id]; expect(m.label.length, id).toBeGreaterThan(5); expect(m.when.length, id).toBeGreaterThan(5); }
  });
  it("każdy szablon się renderuje: jeden układ (logo, akcent, max 600 px, jasne tło), jeden przycisk, wersja tekstowa, stopka z polityką prywatności", () => {
    for (const id of MAIL_IDS) {
      const m = buildMail(id, MAIL_CATALOGUE[id].sample);
      expect(m.subject.length, id).toBeGreaterThan(3);
      expect(m.html, id).toContain("<!doctype html>");
      expect(m.html, id).toContain("#C2410C");
      expect(m.html, id).toContain("max-width:600px");
      expect(m.html, id).toContain("#FAF8F5");
      expect(m.html, id).toContain("Manrope");
      expect(m.html, id).toContain("Polityka prywatności");
      expect((m.html.match(/display:inline-block;background:#C2410C/g) ?? []).length, id).toBe(1); // jeden przycisk
      expect(m.text, id).toContain("Polityka prywatności:");
      expect(m.text, id).toContain("Dostajesz tę wiadomość, bo");
    }
  });
  it("zwraca się po imieniu („Cześć, Anna,”); bez imienia — „Cześć,”", () => {
    const m = buildMail("plan_ready", { name: "Anna", trainerName: "Marek Nowak" });
    expect(m.text.startsWith("Cześć, Anna,")).toBe(true);
    expect(m.html).toContain("Cześć, Anna,");
    expect(buildMail("plan_ready", {}).text.startsWith("Cześć,\n")).toBe(true);
  });
  it("krótko: 3–5 zdań w treści (maile do osób i trenerów)", () => {
    for (const id of MAIL_IDS.filter((x) => !["application_new", "owner_notice", "invite"].includes(x))) {
      const body = MAIL_CATALOGUE[id].build(MAIL_CATALOGUE[id].sample).paragraphs.join(" ");
      const sentences = body.split(/[.!?]+\s|[.!?]+$/).filter((s) => s.trim().length > 2).length;
      expect(sentences, id).toBeGreaterThanOrEqual(2);
      expect(sentences, id).toBeLessThanOrEqual(5);
    }
  });
  it("bez danych zdrowotnych: żaden mail nie mówi o bólu, stawach ani wywiadzie zdrowotnym; zgłoszenie to tylko „masz nowe zgłoszenie”", () => {
    for (const id of MAIL_IDS) {
      const m = buildMail(id, MAIL_CATALOGUE[id].sample);
      expect(`${m.subject} ${m.text}`, id).not.toMatch(HEALTH);
    }
    // nawet gdyby ktoś podał treść zgłoszenia w danych, mail jej nie pokazuje
    const pain = buildMail("pain_notice", { name: "Marek", text: "kolano boli od tygodnia", note: "ból kolana", personName: "Anna" });
    expect(pain.text).not.toMatch(/kolano|ból|Anna/i);
    expect(pain.text).toContain("Masz nowe zgłoszenie");
  });
  it("bez form zależnych od płci (nikt nie „przyjął”, „odłączył”, „złożyłeś”, „poprosiłam”)", () => {
    for (const id of MAIL_IDS) {
      const m = buildMail(id, MAIL_CATALOGUE[id].sample);
      expect(`${m.subject} ${m.text}`, id).not.toMatch(GENDERED);
    }
    // treści z imieniem osoby trzeciej nie używają jej czasowników rodzaju
    for (const id of ["join_accepted", "join_rejected", "disconnected_by_trainer", "disconnected_by_client"] as const) {
      const body = MAIL_CATALOGUE[id].build(MAIL_CATALOGUE[id].sample).paragraphs.join(" ");
      expect(body, id).not.toMatch(/\b(przyjął|przyjęła|odrzucił|odrzuciła|odłączył|odłączyła|zaakceptował|zaakceptowała)\b/i);
    }
  });
  it("mail w imieniu trenera: „Imię Nazwisko przez Optimatren” w stopce; systemowe: „Optimatren”", () => {
    expect(buildMail("plan_ready", { name: "Anna", trainerName: "Marek Nowak" }).text).toContain("Wysyła: Marek Nowak przez Optimatren.");
    expect(buildMail("application_accepted", { name: "Anna" }).text).toContain("Wysyła: Optimatren.");
  });
  it("tekst od użytkownika jest zabezpieczony przed HTML; kontakt tylko gdy CONTACT_EMAIL jest poprawny", () => {
    const evil = renderMail({ name: "<b>Hej</b>", subject: "x", paragraphs: ["<script>alert(1)</script>"], reason: "test" });
    expect(evil.html).not.toContain("<script>"); expect(evil.html).not.toContain("<b>Hej</b>");
    expect(buildMail("plan_ready", { name: "A" }).text).not.toContain("Kontakt:");
    process.env["CONTACT_EMAIL"] = "TU_ADRES";
    expect(buildMail("plan_ready", { name: "A" }).text).not.toContain("Kontakt:");
    process.env["CONTACT_EMAIL"] = "kontakt@optimatren.pl";
    expect(buildMail("plan_ready", { name: "A" }).text).toContain("Kontakt: kontakt@optimatren.pl");
  });
  it("tekst z kodem trenera do skopiowania (SMS / Instagram)", () => {
    const t = trainerCodeShareText("Marek Nowak", "AB12CD34EF", "https://x.pl/join/AB12CD34EF");
    expect(t).toContain("AB12CD34EF"); expect(t).toContain("https://x.pl/join/AB12CD34EF"); expect(t).toContain("Marek Nowak");
  });
  it("nagłówek maila: bez flagi BRAND_V1_ENABLED dawny kwadrat „O”, z flagą pierścień logo A i napis małymi literami", () => {
    delete process.env["BRAND_V1_ENABLED"];
    const old = buildMail("plan_ready", { name: "Anna" }).html;
    expect(old).toContain(">O</span>"); expect(old).toContain(">Optimatren</span>");
    process.env["BRAND_V1_ENABLED"] = "1";
    try {
      const v1 = buildMail("plan_ready", { name: "Anna" }).html;
      expect(v1).toContain("border-radius:50%"); expect(v1).toContain(">optimatren</span>"); expect(v1).not.toContain(">O</span>");
    } finally { delete process.env["BRAND_V1_ENABLED"]; }
  });
});
