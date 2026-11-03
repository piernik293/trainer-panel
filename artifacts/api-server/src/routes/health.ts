import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Adres kontaktowy z konfiguracji (CONTACT_EMAIL w .env); wartość bez „@” (np. szablon TU_ADRES) = nieustawiony. */
export const contactEmail = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const v = (env["CONTACT_EMAIL"] ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
};
router.get("/contact", (_req, res) => { res.json({ email: contactEmail() }); });

/** „Zobacz, jak to działa (bez konta)”: tryb podglądu bez zapisu, za flagą GUEST_DEMO_ENABLED (domyślnie wyłączona). */
export const guestDemoEnabled = (env: NodeJS.ProcessEnv = process.env) => env["GUEST_DEMO_ENABLED"] === "1";
router.get("/guest-demo/status", (_req, res) => { res.json({ enabled: guestDemoEnabled() }); });
/** Metody intensyfikacji (docs/METODY.md): kafelki w wywiadzie i dobór w generatorze, za flagą METHODS_V2_ENABLED (domyślnie wyłączona). */
router.get("/methods/status", (_req, res) => { res.json({ enabled: process.env["METHODS_V2_ENABLED"] === "1" }); });

export default router;
