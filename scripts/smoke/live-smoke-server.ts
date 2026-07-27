#!/usr/bin/env tsx
/**
 * Minimal local-only server for live smoke tests against an existing database.
 *
 * Safety properties:
 * - binds only to 127.0.0.1;
 * - never runs migrations, seeders, schedulers or background jobs;
 * - requires an explicit acknowledgement;
 * - verifies the required schema with read-only queries before listening;
 * - permits only controlled smoke+...@bikerlink.test registrations;
 * - never creates the session table.
 */
import http from "node:http";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import authRoutes from "../../server/routes/auth";
import chatRoutes from "../../server/routes/chat";
import otaPublicRouter from "../../server/routes/ota-public";
import { enforceOrigin } from "../../server/middleware";
import { pool } from "../../server/db";

const HOST = "127.0.0.1";
const PORT = Number(process.env.SMOKE_SERVER_PORT ?? 5099);
const REQUIRED_TABLES = [
  "users",
  "user_profiles",
  "match_preferences",
  "session",
] as const;

function assertConfiguration(): void {
  if (process.env.LIVE_SMOKE_ACK !== "I_UNDERSTAND_SMOKE_WRITES") {
    throw new Error(
      "LIVE_SMOKE_ACK mancante: il server smoke crea e rimuove un solo account smoke controllato",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL mancante");
  }
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET mancante");
  }
  if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
    throw new Error("SMOKE_SERVER_PORT non valido");
  }
}

async function assertExistingSchema(): Promise<void> {
  const result = await pool.query<{ table_name: string; regclass: string | null }>(
    `
      SELECT table_name, to_regclass('public.' || table_name)::text AS regclass
      FROM unnest($1::text[]) AS table_name
    `,
    [REQUIRED_TABLES],
  );
  const missing = result.rows
    .filter((row) => row.regclass === null)
    .map((row) => row.table_name);
  if (missing.length > 0) {
    throw new Error(`schema non pronto; tabelle mancanti: ${missing.join(", ")}`);
  }
}

async function main(): Promise<void> {
  assertConfiguration();
  await assertExistingSchema();

  const app = express();
  app.set("trust proxy", false);
  app.locals.controlledSmokeRegistration = true;
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false }));

  const sessionPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    keepAlive: true,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    max: 2,
  });
  const PgStore = connectPgSimple(session);
  const sessionStore = new PgStore({
    pool: sessionPool,
    tableName: "session",
    createTableIfMissing: false,
    ttl: 365 * 24 * 60 * 60,
    disableTouch: true,
  });
  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: false,
    },
  }));

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));
  app.use("/api/auth", enforceOrigin, authRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/ota", otaPublicRouter);

  const server = http.createServer(app);
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[live-smoke-server] arresto controllato (${signal})`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.allSettled([sessionPool.end(), pool.end()]);
  };

  process.once("SIGINT", () => void shutdown("SIGINT").then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown("SIGTERM").then(() => process.exit(0)));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => resolve());
  });
  console.log(
    `[live-smoke-server] READY http://${HOST}:${PORT} — migrazioni/seed/scheduler disabilitati`,
  );
}

main().catch(async (error: unknown) => {
  console.error(
    `[live-smoke-server] FATAL: ${error instanceof Error ? error.message : String(error)}`,
  );
  await pool.end().catch(() => {});
  process.exit(1);
});
