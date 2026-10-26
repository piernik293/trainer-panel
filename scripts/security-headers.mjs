// Security headers for the front ends (trainer-app, client-landing) — used by the Vite dev/preview servers; the same list goes into the
// production proxy (docs/WDROZENIE-PLAN.md, Caddyfile). The Content-Security-Policy is sent as REPORT-ONLY unless CSP_ENFORCE=1, because it
// must allow Clerk and Google Fonts and a wrong policy would break sign-in; switch to enforcing after a clean run with HTTPS.
// HSTS only with HSTS_ENABLED=1 (HTTPS only).
export function frontendSecurityHeaders(env = process.env) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com",
    "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com ws: wss:",
    "frame-src https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const h = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    [env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]: csp,
  };
  if (env.HSTS_ENABLED === "1") h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return h;
}
