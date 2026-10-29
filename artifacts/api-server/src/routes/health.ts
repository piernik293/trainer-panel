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

export default router;
