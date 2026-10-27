/**
 * Security headers for the API (JSON only, so a strict policy is safe).
 *  - X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cross-Origin-Resource-Policy: always;
 *  - Content-Security-Policy "default-src 'none'; frame-ancestors 'none'" (an API never needs to load anything);
 *  - Strict-Transport-Security: ONLY when HSTS_ENABLED=1 (turn it on once the app is served over HTTPS — on plain HTTP it is ignored by
 *    browsers but would stay cached after a later move back, so it is off by default).
 * The front-end headers (Vite dev/preview and the production proxy) come from scripts/security-headers.mjs and docs/WDROZENIE-PLAN.md.
 */
import type { Request, Response, NextFunction } from "express";

export function securityHeaders(env: NodeJS.ProcessEnv = process.env) {
  const hsts = env.HSTS_ENABLED === "1";
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (hsts) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  };
}
