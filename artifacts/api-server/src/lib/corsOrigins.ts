/**
 * Explicit CORS origin allowlist for the API server.
 *
 * CORS is enforced by browsers only.
 * Requests without an Origin header bypass CORS entirely and are NOT trusted —
 * they continue to normal route, authentication, and ownership-check middleware
 * as if CORS had never been evaluated.
 *
 * Configured via four environment variables:
 *
 *   TRAINER_APP_ORIGIN         — production trainer app (required in production)
 *   CLIENT_PORTAL_ORIGIN       — production client portal (required in production)
 *   LOCAL_TRAINER_APP_ORIGIN   — dev/test trainer origin (optional)
 *   LOCAL_CLIENT_PORTAL_ORIGIN — dev/test client portal origin (optional)
 *
 * Each variable must contain exactly one bare origin: scheme://hostname[:port]
 * Paths, query strings, fragments, and userinfo are rejected at startup.
 */

export type CorsOriginCallback = (
  err: Error | null,
  allow?: boolean,
) => void;

/**
 * Builds the Set of allowed origins from environment variables.
 * Throws synchronously on any misconfiguration so the application fails fast
 * at startup rather than silently serving incorrect CORS headers at runtime.
 *
 * @param env - Defaults to `process.env`.  Pass a custom object in tests.
 */
export function buildAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
): Set<string> {
  const isProduction = env["NODE_ENV"] === "production";

  const entries: Array<{ key: string; required: boolean }> = [
    { key: "TRAINER_APP_ORIGIN", required: true },
    { key: "CLIENT_PORTAL_ORIGIN", required: true },
    { key: "LOCAL_TRAINER_APP_ORIGIN", required: false },
    { key: "LOCAL_CLIENT_PORTAL_ORIGIN", required: false },
  ];

  const origins = new Set<string>();

  for (const { key, required } of entries) {
    const raw = env[key];

    if (raw === undefined || raw.trim() === "") {
      if (isProduction && required) {
        throw new Error(
          `CORS startup error: ${key} is required in production but is not set`,
        );
      }
      continue;
    }

    origins.add(parseStrictOrigin(key, raw));
  }

  return origins;
}

/**
 * Returns the cors `origin` callback function for use with the `cors` package.
 *
 * - Allowed exact origin → sets Access-Control-Allow-Origin to that origin.
 * - Disallowed origin    → no Access-Control-Allow-Origin; browser blocks it.
 * - No Origin header     → no CORS headers; request continues to auth middleware.
 *   (CORS is browser-enforced; no-Origin requests are not trusted — protected
 *   routes still require valid authentication and enforce ownership checks.)
 */
export function makeCorsOriginCallback(
  allowedOrigins: Set<string>,
): (origin: string | undefined, cb: CorsOriginCallback) => void {
  return function corsOriginCallback(
    origin: string | undefined,
    cb: CorsOriginCallback,
  ): void {
    // No Origin header — pass through without CORS headers.
    if (origin === undefined) {
      cb(null, false);
      return;
    }

    if (allowedOrigins.has(origin)) {
      cb(null, true);
    } else {
      // Unknown browser origin — do not reflect it back.
      cb(null, false);
    }
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Validates and normalises a single origin value from an environment variable.
 *
 * Accepts:  https://app.example.com  or  https://app.example.com:3000
 * Rejects:  paths, query strings, fragments, userinfo, wildcards.
 */
function parseStrictOrigin(varName: string, raw: string): string {
  // Trim whitespace, then remove exactly one trailing slash.
  const trimmed = raw.trim().replace(/\/$/, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `CORS startup error: ${varName}="${raw}" is not a valid URL`,
    );
  }

  if (parsed.pathname !== "/") {
    throw new Error(
      `CORS startup error: ${varName}="${raw}" must not contain a path (got "${parsed.pathname}")`,
    );
  }
  if (parsed.search !== "") {
    throw new Error(
      `CORS startup error: ${varName}="${raw}" must not contain a query string`,
    );
  }
  if (parsed.hash !== "") {
    throw new Error(
      `CORS startup error: ${varName}="${raw}" must not contain a fragment`,
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(
      `CORS startup error: ${varName}="${raw}" must not contain userinfo`,
    );
  }

  // Return the normalized origin (scheme + host + port only).
  return parsed.origin;
}
