// Wysyła jeden krótki mail tekstowy do właściciela (SMTP z .env). Użycie: node scripts/watchdog-mail.mjs "<temat>" "<treść>"
// Kod wyjścia 0 = wysłano, 2 = brak konfiguracji poczty, 1 = błąd wysyłki. Sekretów nie wypisuje.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const [subject, text] = process.argv.slice(2);
const to = process.env.OWNER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass } = process.env;
if (!to || !host || !user || !pass) { console.error("brak konfiguracji poczty (OWNER_NOTIFY_EMAIL/SMTP_*)"); process.exit(2); }
const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "api-server", "package.json"));
const nodemailer = require("nodemailer");
const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
try {
  const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 15000, socketTimeout: 20000 });
  if (process.env.WATCHDOG_MAIL_VERIFY_ONLY === "1") { await t.verify(); console.log("poczta: połączenie i logowanie OK (nic nie wysłano)"); process.exit(0); }
  await t.sendMail({ from: process.env.SMTP_FROM || user, to, subject, text });
  console.log("mail wysłany");
} catch (e) { console.error("błąd wysyłki:", e instanceof Error ? e.message.replace(/pass(word)?=\S+/gi, "") : "nieznany"); process.exit(1); }
