import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { ZodError } from "zod";
import { pool } from "@workspace/db";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import protectedRouter from "./routes/protected";
import { requireAuth, SESSION_TIMEOUT_MS } from "./lib/auth";
import { logger } from "./lib/logger";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../tc-inventory/dist/public");

const PgSession = connectPgSimple(session);

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    // 2-3 users on shared lab tablets, no external exposure beyond the LAN —
    // a static secret from .env is proportionate; set SESSION_SECRET there.
    secret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: SESSION_TIMEOUT_MS,
      httpOnly: true,
      sameSite: "lax",
    },
  }),
);

// /api/healthz and /api/auth/login must stay reachable without a session.
// Everything else under /api requires an authenticated, active user.
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api", requireAuth, protectedRouter);

// Serve the built tc-inventory frontend from the same origin/port, with a
// SPA fallback so client-side routes (e.g. /samples/1) resolve on refresh.
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// Must be registered last (Express identifies error handlers by arity).
// Without this, any thrown/rejected error — including every route's
// z.parse() on invalid input — fell through to Express's default handler,
// which returns an HTML 500 rather than a JSON error the frontend can read.
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", issues: err.issues });
    return;
  }
  req.log?.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

export default app;
