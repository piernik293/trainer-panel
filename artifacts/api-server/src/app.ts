import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middlewares/securityHeaders";
import { rateLimit, LIMITS } from "./middlewares/rateLimit";
import { buildAllowedOrigins, makeCorsOriginCallback } from "./lib/corsOrigins";

// In production, Clerk publishable key must be present. Fail at startup
// rather than silently serving unprotected routes.
if (process.env.NODE_ENV === "production" && !process.env.CLERK_PUBLISHABLE_KEY) {
  throw new Error("CLERK_PUBLISHABLE_KEY is required in production");
}

// Build the explicit CORS allowlist at startup.
// Throws in production when TRAINER_APP_ORIGIN or CLIENT_PORTAL_ORIGIN is absent.
const _allowedOrigins = buildAllowedOrigins();

const app: Express = express();

// Behind a reverse proxy (Caddy) req.ip must be the real client address: TRUST_PROXY=loopback (or a number of hops).
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(v) ? Number(v) : v);
}
app.disable("x-powered-by");
app.use(securityHeaders());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy — must be before body parsers (streams raw bytes).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: makeCorsOriginCallback(_allowedOrigins) }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Resolves the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Rate limits (docs/WDROZENIE-PLAN.md): token guessing on public links, the post-sign-in profile call, the generator.
app.use("/api/public", rateLimit(LIMITS.publicToken));
app.use("/api/client-invitations", rateLimit(LIMITS.publicToken));
app.use("/api/trainer/profile", rateLimit(LIMITS.trainerProfile));
app.use("/api/clients/:clientId/plan-draft", rateLimit(LIMITS.generator));
app.use("/api/plans/draft-input", rateLimit(LIMITS.generator));

app.use("/api", router);

// ─── Central error handler ────────────────────────────────────────────────────
// Any uncaught route error (Express 5 propagates async rejections here) is
// logged in full (name, message, stack, route, request id) but the client only
// ever receives a safe Polish message plus a correlation reference. Stack
// traces and internal exception text are never sent — in any environment.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const reference = String((req as Request & { id?: unknown }).id ?? "");
  const log = (req as Request & { log?: typeof logger }).log ?? logger;
  // Log name/message/stack + correlation data only — never the raw err object:
  // body-parser errors carry the request body, which may contain survey PII.
  log.error(
    {
      errName: err instanceof Error ? err.name : typeof err,
      errMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      route: `${req.method} ${req.originalUrl?.split("?")[0]}`,
      reference,
    },
    err instanceof Error ? `${err.name}: ${err.message}` : "Unhandled non-Error thrown",
  );

  if (res.headersSent) return;
  // Respect 4xx statuses set by middleware (e.g. body-parser 400 on malformed
  // JSON) — still with a safe Polish message, never the internal text.
  const rawStatus = (err as { status?: unknown; statusCode?: unknown }).status ??
    (err as { statusCode?: unknown }).statusCode;
  const status = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;
  res.status(status).json({
    error:
      status === 400
        ? "Nieprawidłowe dane żądania. Popraw dane i spróbuj ponownie."
        : "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę.",
    ...(reference ? { reference } : {}),
  });
});

export default app;
