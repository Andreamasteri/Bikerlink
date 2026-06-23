// Silenzia "[ioredis] Unhandled error event" — ioredis chiama console.error
// via silentEmit quando non trova listener sull'oggetto interno; tutti i
// client Redis hanno già handler espliciti, ma ioredis v5 bypassa talvolta
// il lookup. Il fallback in-memory è sempre attivo, nessun impatto funzionale.
const _origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("[ioredis]")) return;
  _origConsoleError(...args);
};

import fs from "fs";
import express from "express";
import type { Request, Response } from "express";
import { createServer } from "http";
import { createServer as createProbeServer } from "http";
import { initState, initGate } from "./init-state";
import { stopMatchingEngine } from "./matching-engine";
import { pool, isPoolSaturatedSustained } from "./db";
import { stopMetroMonitor, markCleanShutdown } from "./uptime";
import { matchEnrichmentSemaphore, MATCH_ENRICHMENT_GLOBAL_LIMIT } from "./lib/concurrency";
import { setupMiddleware, setupStaticRoutes } from "./middleware";
import { registerAllRoutes } from "./route-mounter";
import { setupErrorHandler } from "./error-handler";
import { initSentry, attachSentryErrorHandler } from "./sentry";
import { runBootSequence } from "./boot-sequence";
import { isOpen as dbCircuitOpen } from "./db-circuit-breaker";
import { applyCrashBackoff } from "./lib/crash-backoff";

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();

// Task #2527 — Sentry deve essere inizializzato il prima possibile (no-op se
// SENTRY_DSN non è impostato). Catena sequenziale: init → registra route →
// attachSentryErrorHandler. La promise `sentryInitPromise` viene awaited prima
// dell'attach così l'error handler è sempre montato se SENTRY_DSN è valido.
const sentryInitPromise = initSentry();

setupMiddleware(app);

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

app.get("/api/metrics", (_req: Request, res: Response) => {
  res.json({
    matchEnrichmentSemaphore: {
      activeCount: matchEnrichmentSemaphore.activeCount,
      pendingCount: matchEnrichmentSemaphore.pendingCount,
      limit: MATCH_ENRICHMENT_GLOBAL_LIMIT,
    },
  });
});

// Task #2789 / #4455 — Gate: 503 su /api/* mentre initState.initializing=true.
// Logica + eccezioni (auth essenziali, /health) estratte in init-state.ts
// (initGate) così il test di regressione può esercitare il gate reale.
// /api/metrics è montato sopra (fuori dal gate).
app.use("/api", initGate);

// DB circuit breaker — fast-fail 503 JSON quando il DB è irraggiungibile.
// Escluse: /api/health, /api/_internal (token-only, no DB gate), /api/metrics.
app.use("/api", (req: Request, res: Response, next) => {
  if (req.path === "/health" || req.path.startsWith("/_internal") || req.path === "/metrics") {
    return next();
  }
  if (dbCircuitOpen()) {
    return res.status(503).json({
      success: false,
      message: "Servizio temporaneamente non disponibile. Riprova tra qualche secondo.",
    });
  }
  // Backpressure pool (incidente 20 giu): se il pool è saturo in modo sostenuto
  // (≥500ms continui, vedi isPoolSaturatedSustained) degrada con un 503 veloce +
  // Retry-After invece di lasciare la richiesta in coda per
  // connectionTimeoutMillis (3s) e poi fallire con 500. Sheddare il carico fa
  // drenare il pool ed evita il pile-up. Il circuit breaker NON si apre più sulla
  // sola saturazione (vedi db-collector), quindi questo è lo shedding dedicato.
  if (isPoolSaturatedSustained()) {
    res.setHeader("Retry-After", "2");
    return res.status(503).json({
      success: false,
      message: "Servizio momentaneamente sovraccarico. Riprova tra qualche secondo.",
    });
  }
  return next();
});

registerAllRoutes(app);
setupStaticRoutes(app);
// Task #2527 — Catena deterministica per gli error handler:
//   init Sentry → attach Sentry handler → setup custom handler.
// Express invoca i middleware nell'ordine di .use(): senza questa catena
// (e senza l'await prima del listen) il custom handler si monterebbe per
// primo e Sentry non vedrebbe mai gli errori.
const errorHandlersReady = sentryInitPromise
  .then(() => attachSentryErrorHandler(app))
  .then(() => setupErrorHandler(app));

const server = createServer(app);

// In produzione la piattaforma Replit (stack=EXPO) attende Metro su porta 8081.
// Avviamo un probe server minimale per soddisfare il check senza avviare Metro.
// In sviluppo la porta 8081 è già occupata da Metro, quindi non la tocchiamo.
if (process.env.NODE_ENV === "production") {
  const probeApp = createProbeServer((_req, probeRes) => {
    probeRes.writeHead(200, { "Content-Type": "text/plain" });
    probeRes.end("ok");
  });
  probeApp.listen(8081, "0.0.0.0", () => {
    console.log("[probe] Port 8081 probe server ready (deploy health check)");
  });
  probeApp.on("error", (err: NodeJS.ErrnoException) => {
    // Non bloccare il boot se 8081 è già in uso (es. Metro in staging)
    if (err.code !== "EADDRINUSE") {
      console.warn("[probe] Port 8081 probe error:", err.message);
    }
  });
}

const activeConnections = new Set<import("net").Socket>();

server.on("connection", (socket) => {
  activeConnections.add(socket);
  socket.once("close", () => activeConnections.delete(socket));
});

function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  initState.initializing = false;

  // Marca lo spegnimento come pulito (sincrono): al boot successivo il riavvio
  // sarà classificato come intenzionale invece che come crash.
  markCleanShutdown();

  stopMatchingEngine();
  stopMetroMonitor();
  import("./jobs/thinkcentre-monitor").then(({ stopThinkCentreMonitor }) => stopThinkCentreMonitor()).catch(() => {});
  import("./jobs/valhalla-monitor").then(({ stopValhallaMonitor }) => stopValhallaMonitor()).catch(() => {});

  activeConnections.forEach((socket) => socket.destroy());
  activeConnections.clear();

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await pool.end();
      console.log("Database pool closed.");
    } catch (err) {
      console.error("Error closing database pool:", err);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ── Crash capture ─────────────────────────────────────────────────────────────
// Scrivi il motivo del crash in modo sincrono su /tmp/server-crash.log.
// fs.appendFileSync sopravvive al crash; il file viene letto al prossimo boot
// da restart-monitor.ts per inserire il segnale in system_signals.
function writeCrashLog(type: string, err: unknown): void {
  try {
    const now = new Date().toISOString();
    const error = err instanceof Error ? err : new Error(String(err));
    const entry = [
      `--- CRASH ${now} ---`,
      `type: ${type}`,
      `message: ${error.message}`,
      `stack: ${error.stack ?? "(no stack)"}`,
      "",
    ].join("\n");
    fs.appendFileSync("/tmp/server-crash.log", entry, "utf8");
  } catch {
    // nulla — siamo già in crash, non possiamo fare altro
  }
}

// Anti crash-loop: prima dell'exit applichiamo un backoff crescente basato sul
// numero di crash recenti (vedi lib/crash-backoff.ts). Un DB managed lento non
// produce più una raffica di restart ravvicinati: il primo crash attende poco,
// una raffica viene progressivamente distanziata fino al cap. Il crash log
// esistente viene scritto comunque, prima del delay.
function crashExit(type: string, err: unknown): void {
  console.error(`[CRASH] ${type}:`, err);
  writeCrashLog(type, err);
  applyCrashBackoff(type);
  process.exit(1);
}

process.on("uncaughtException", (err) => crashExit("uncaughtException", err));

process.on("unhandledRejection", (reason) => crashExit("unhandledRejection", reason));

runBootSequence(server, errorHandlersReady).catch((err) => {
  console.error("[INIT] Uncaught fatal error during startup:", err);
  applyCrashBackoff("boot-fatal");
  process.exit(1);
});
