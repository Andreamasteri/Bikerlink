import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db, withDbRetry } from "../db";
import { serverRestarts } from "@shared/db";
import { sql, desc, count } from "drizzle-orm";
import { triggerMatchingRun, triggerMatchingForUser } from "../matching-engine";
import { sendSuccess, sendError } from "../lib/api-response";
import { initState } from "../init-state";
import { getCircuitStatus } from "../db-circuit-breaker";
import { getHealthState } from "../lib/health-arbiter";
import { getCoordinatorHealthSummary } from "../ai/coordinator/job-gate";
import { isHorusCoordinatorLoopRunning, getHorusCoordinatorLoopStats } from "../ai/coordinator/horus-coordinator-loop";
import { getRedisTunnelStatus } from "../cache/redis-tunnel";
import { getOrFetchAdminCached, deleteAdminCached } from "../lib/admin-auth-cache";

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return sendError(res, 401, "Non autenticato");
  }
  const cacheKey = req.session.userId;
  let user: Awaited<ReturnType<typeof storage.getUser>>;
  try {
    const result = await getOrFetchAdminCached(cacheKey, () => storage.getUser(cacheKey));
    user = result as typeof user;
  } catch {
    return sendError(res, 500, "Errore interno");
  }
  if (!user || user.role !== "admin") {
    deleteAdminCached(cacheKey);
    return sendError(res, 403, "Accesso non autorizzato");
  }
  if (user.status !== "active") {
    deleteAdminCached(cacheKey);
    return sendError(res, 403, "Account non attivo.");
  }
  (req as { adminUser?: typeof user }).adminUser = user;
  next();
}

// Cache in-process breve per le risposte degli endpoint admin letti con polling
// frequente. TTL configurabile per endpoint; evita query/filesystem ripetuti.
const _shortCache = new Map<string, { value: unknown; expiresAt: number }>();

/** Esposto solo per i test — azzera cache e campione precedente. */
export function __resetServerMetricsCacheForTests(): void {
  _shortCache.delete("admin:server-metrics");
  lastServerSample = null;
}
async function withShortCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const cached = _shortCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }
  const value = await fn();
  _shortCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

// Task #2851 — Monitor Efficienza Server: campionamento rete + CPU processo.
// Stato modulo-level per calcolare i delta/rate tra due richieste consecutive.
let lastServerSample: {
  at: number;
  rx: number;
  tx: number;
  cpu: { user: number; system: number };
} | null = null;

function readNetDev(): { rx: number; tx: number } {
  try {
    const fsInner = require("fs") as typeof import("fs");
    const data = fsInner.readFileSync("/proc/net/dev", "utf-8");
    const lines = data.trim().split("\n").slice(2);
    let rx = 0;
    let tx = 0;
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const name = line.slice(0, idx).trim();
      if (name === "lo") continue;
      const cols = line.slice(idx + 1).trim().split(/\s+/).map(Number);
      rx += Number.isFinite(cols[0]) ? cols[0] : 0;
      tx += Number.isFinite(cols[8]) ? cols[8] : 0;
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

export function registerMoreRoutes(app: Express) {
  app.post("/api/matching/trigger", (req, res) => {
    if (!req.session?.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const userId = req.session.userId;
    triggerMatchingForUser(userId);
    const result = triggerMatchingRun();
    sendSuccess(res, result);
  });

  app.get("/api/health", (_req, res) => {
    const dbCircuit = getCircuitStatus();
    const arbiter = getHealthState();
    // Stati distinti, mai 500. Durante il boot il gate critico vince sempre
    // (booting → 503). A regime lo `status` riflette il PEGGIORE tra le slice
    // dell'Health Arbiter (server/lib/health-arbiter.ts):
    //   • booting  → 503 (fasi critiche non finite)
    //   • ready    → 200 (tutte le slice READY)
    //   • degraded → 200 (almeno una slice DEGRADED, nessuna BROKEN)
    //   • broken   → 200 (almeno una slice BROKEN; il backend SERVE ancora, non
    //                va riavviato — vedi scripts/cerbero-lib.sh che lo tratta come vivo)
    // `degradedReasons` aggrega i motivi di TUTTE le slice non-READY.
    if (initState.initializing) {
      return res.status(503).json({
        status: "booting", initializing: true, degraded: false,
        state: arbiter.state, dbCircuit,
      });
    }
    const status =
      arbiter.state === "READY" ? "ready" :
      arbiter.state === "DEGRADED" ? "degraded" : "broken";
    // Task #5 (Quebracho a) — stato del coordinatore, puramente INFORMATIVO: NON
    // influenza `status`/`degraded` (il fallback è deterministico, un coordinatore
    // offline non degrada il backend). Vista sincrona, non lancia mai.
    let coordinator: unknown;
    try {
      const loopStats = getHorusCoordinatorLoopStats();
      coordinator = { ...getCoordinatorHealthSummary(), loopRunning: isHorusCoordinatorLoopRunning(), model: loopStats.persona };
    } catch {
      coordinator = { unavailable: true };
    }
    // Stato del redis-tunnel cloudflared — INFORMATIVO (Sentry #126649029).
    // Non influenza `status`/`degraded`; esposto per il watchdog e l'admin TC.
    // floodActive=true quando il circuit breaker soft è intervenuto (>10 restart/5min).
    let redisTunnel: unknown;
    try {
      const t = getRedisTunnelStatus();
      redisTunnel = {
        enabled: t.enabled,
        running: t.running,
        restarts: t.restarts,
        lastExitCode: t.lastExitCode,
        lastExitReason: t.lastExitReason,
        lastError: t.lastError,
        lastExitAt: t.lastExitAt,
        floodActive: t.floodStartedAt !== null,
      };
    } catch {
      redisTunnel = { unavailable: true };
    }
    return res.status(200).json({
      status,
      initializing: false,
      degraded: arbiter.state !== "READY",
      state: arbiter.state,
      degradedReasons: arbiter.reasons,
      slices: arbiter.slices,
      dbCircuit,
      coordinator,
      redisTunnel,
    });
  });

  app.get("/api/admin/uptime", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("../uptime");
    // Valori live non cacheable (derivati da stato in-memory, sempre freschi).
    const liveSnap = {
      backendStartedAt: SERVER_START_TIME,
      metroStartedAt: uptimeState.metroStartTime,
      metroLastSeenAt: uptimeState.metroLastSeenAt,
      metroOnline: uptimeState.metroOnline,
      frontendStartTime: uptimeState.frontendStartTime,
      serverNow: Date.now(),
    };
    // crashCount24h: 1 query DB, cacheato 10 s per ridurre il carico in polling.
    const crashCount24h = await withShortCache("admin:uptime:crashCount24h", 10_000, async () => {
      try {
        const { appCrashLogs } = await import("@shared/db");
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const rows = await withDbRetry(() => db
          .select({ count: count() })
          .from(appCrashLogs)
          .where(
            sql`${appCrashLogs.crashType} IN ('crash_system', 'crash_js') AND ${appCrashLogs.reportedAt} >= ${since}`
          ));
        return Number(rows[0]?.count ?? 0);
      } catch {
        return 0;
      }
    });
    res.json({ ...liveSnap, crashCount24h });
  });

  app.get("/api/admin/system-health", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("../uptime");
    const now = Date.now();
    const backendUptimeSec = Math.floor((now - SERVER_START_TIME) / 1000);
    const metroUptimeSec = uptimeState.metroOnline && uptimeState.metroStartTime > 0
      ? Math.floor((now - uptimeState.metroStartTime) / 1000)
      : 0;

    const events: { timestamp: string; message: string; type: string }[] = [];
    try {
      const fsInner = await import("fs");
      const pathInner = await import("path");
      const logPath = pathInner.join(process.cwd(), "logs", "uptime-resets.log");
      if (fsInner.existsSync(logPath)) {
        const lines = fsInner.readFileSync(logPath, "utf-8").trim().split("\n");
        for (const line of lines) {
          const spaceIdx = line.indexOf(" ");
          if (spaceIdx === -1) continue;
          const timestamp = line.slice(0, spaceIdx);
          const message = line.slice(spaceIdx + 1);
          let type = "INFO";
          if (message.startsWith("BACKEND UP (cold start)")) type = "COLD_START";
          else if (message.startsWith("BACKEND RESTART")) type = "BACKEND_RESTART";
          else if (message.startsWith("METRO UP")) type = "METRO_UP";
          else if (message.startsWith("METRO DOWN")) type = "METRO_DOWN";
          events.push({ timestamp, message, type });
        }
        events.reverse();
      }
    } catch {
      // no-op: ignore system health event log read failures
    }

    res.json({
      backendStartedAt: SERVER_START_TIME,
      backendUptimeSec,
      metroOnline: uptimeState.metroOnline,
      metroStartedAt: uptimeState.metroStartTime,
      metroUptimeSec,
      events,
    });
  });

  // Task #2851 — Metriche live del server (CPU/RAM/rete/uptime) per la card admin.
  // Nessuna query DB — solo OS syscall + stato modulo-level. Cacheato 10 s per
  // ridurre la frequenza di campionamento in polling rapido dal pannello admin.
  app.get("/api/admin/server-metrics", requireAdmin, async (_req, res) => {
    const payload = await withShortCache("admin:server-metrics", 10_000, async () => {
      const os = await import("os");
      const { SERVER_START_TIME } = await import("../uptime");
      const now = Date.now();

      const [load1, load5, load15] = os.loadavg();
      const cores = os.cpus().length || 1;

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const mem = process.memoryUsage();

      const net = readNetDev();
      const cpu = process.cpuUsage();

      // Calcolo rate rete + percentuale CPU processo tra due campionamenti.
      let rxRate = 0;
      let txRate = 0;
      let processCpuPercent = 0;
      if (lastServerSample && now > lastServerSample.at) {
        const dtSec = (now - lastServerSample.at) / 1000;
        if (dtSec > 0) {
          rxRate = Math.max(0, (net.rx - lastServerSample.rx) / dtSec);
          txRate = Math.max(0, (net.tx - lastServerSample.tx) / dtSec);
          const cpuDeltaMicros =
            cpu.user - lastServerSample.cpu.user + (cpu.system - lastServerSample.cpu.system);
          processCpuPercent = Math.max(0, (cpuDeltaMicros / (dtSec * 1_000_000)) * 100);
        }
      }
      lastServerSample = { at: now, rx: net.rx, tx: net.tx, cpu };

      return {
        cpu: {
          loadAvg1: load1,
          loadAvg5: load5,
          loadAvg15: load15,
          cores,
          loadPerCore: load1 / cores,
          processCpuPercent,
        },
        memory: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          usedPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
          processRss: mem.rss,
          processHeapUsed: mem.heapUsed,
          processHeapTotal: mem.heapTotal,
        },
        network: {
          rxBytes: net.rx,
          txBytes: net.tx,
          rxRate,
          txRate,
        },
        uptimeSec: Math.floor((now - SERVER_START_TIME) / 1000),
        serverNow: now,
      };
    });
    res.json(payload);
  });

  // Task #2851 — Anteprima ultime righe di log del server (stessa sorgente di system-health).
  // Cacheato 10 s: evita readFileSync ripetuti su uptime-resets.log in polling rapido.
  app.get("/api/admin/server-logs", requireAdmin, async (req, res) => {
    const requested = parseInt(String(req.query.lines ?? "40"), 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 200) : 40;
    // Cache key include il limite richiesto così richieste con limit diversi
    // non restituiscono lo stesso payload cacheato.
    const payload = await withShortCache(`admin:server-logs:${limit}`, 10_000, async () => {
      const lines: string[] = [];
      try {
        const fsInner = await import("fs");
        const pathInner = await import("path");
        const logPath = pathInner.join(process.cwd(), "logs", "uptime-resets.log");
        if (fsInner.existsSync(logPath)) {
          const all = fsInner.readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
          lines.push(...all.slice(-limit).reverse());
        }
      } catch (err) {
        console.warn("[admin/server-logs] read failed:", (err as Error).message);
      }
      return { lines, count: lines.length };
    });
    res.json(payload);
  });

  app.get("/api/admin/restart-history", requireAdmin, async (_req, res) => {
    const [countResult, rows] = await Promise.all([
      withDbRetry(() => db.select({ count: count() }).from(serverRestarts)),
      withDbRetry(() => db.select().from(serverRestarts).orderBy(desc(serverRestarts.startedAt)).limit(50)),
    ]);

    // Mappa il valore grezzo di reason in una categoria normalizzata + etichetta
    // leggibile in italiano. I dati storici contengono solo "cold_start" e
    // "restart"; il nuovo valore "crash" distingue i riavvii inattesi.
    const categorize = (reason: string): { category: string; reasonLabel: string; isCrash: boolean } => {
      switch (reason) {
        case "cold_start":
          return { category: "cold_start", reasonLabel: "Primo avvio (cold start)", isCrash: false };
        case "restart":
          return { category: "restart", reasonLabel: "Riavvio voluto", isCrash: false };
        case "crash":
          return { category: "crash", reasonLabel: "Crash / riavvio inatteso", isCrash: true };
        default:
          return { category: "unknown", reasonLabel: reason || "Sconosciuto", isCrash: false };
      }
    };

    res.json({
      total: countResult[0]?.count ?? 0,
      restarts: rows.map((r) => {
        const { category, reasonLabel, isCrash } = categorize(r.reason);
        return {
          id: r.id,
          startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
          reason: r.reason,
          category,
          reasonLabel,
          isCrash,
        };
      }),
    });
  });

  setInterval(async () => {
    try {
      const deleted = await storage.cleanupOldCoordinateHistory();
      if (deleted > 0) {
        console.log(`[CoordinateHistory] Pulizia: rimossi ${deleted} record`);
      }
    } catch (err) {
      console.error("[CoordinateHistory] Cleanup error:", err);
    }
  }, 5 * 60 * 1000);

  app.post("/api/admin/client-error", async (req, res) => {
    try {
      const { clientErrorReportSchema } = await import("@shared/validators");
      const bodyParsed = clientErrorReportSchema.safeParse(req.body ?? {});
      if (!bodyParsed.success) {
        return sendError(res, 400, bodyParsed.error.issues[0]?.message ?? "Payload non valido");
      }
      const { message, stack, componentStack, platform, appVersion } = bodyParsed.data;

      let resolvedStack = stack || "";
      if (resolvedStack && appVersion) {
        try {
          const { symbolicateStack } = await import("../lib/symbolicate");
          resolvedStack = await symbolicateStack(resolvedStack, appVersion);
        } catch { /* fallback allo stack originale */ }
      }

      console.error("[CLIENT-ERROR]", JSON.stringify({
        message: message || "unknown",
        stack: resolvedStack.substring(0, 2000),
        componentStack: (componentStack || "").substring(0, 1000),
        platform: platform || "unknown",
        appVersion: appVersion || "unknown",
        timestamp: new Date().toISOString(),
      }));
      return res.json({ received: true });
    } catch (err) {
      console.error("[CLIENT-ERROR] Failed to process error report:", err);
      res.status(200).json({ received: true });
    }
  });

  app.get("/api/stats/public", async (_req, res) => {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await withDbRetry(() => db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE is_fake = false AND status = 'active' AND COALESCE(role, 'user') != 'admin') AS total,
          COUNT(*) FILTER (WHERE is_fake = false AND status = 'active' AND COALESCE(role, 'user') != 'admin' AND last_login_at >= ${fiveMinAgo}) AS online
        FROM users
      `));
      const row = result.rows[0] as { total: string; online: string } | undefined;
      res.json({
        total: parseInt(row?.total ?? "0", 10),
        online: parseInt(row?.online ?? "0", 10),
      });
    } catch (err) {
      console.error("[stats/public] error:", err);
      res.status(500).json({ total: 0, online: 0 });
    }
  });

  app.get("/api/stats/global", async (_req, res) => {
    try {
      const result = await withDbRetry(() => db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE user_type = 'biker') AS bikers,
          COUNT(*) FILTER (WHERE user_type = 'zavorrina') AS zavorrine
        FROM users
        WHERE role != 'admin'
      `));
      const row = result.rows[0] as { total: string; bikers: string; zavorrine: string } | undefined;
      res.json({
        total: parseInt(row?.total ?? "0", 10),
        bikers: parseInt(row?.bikers ?? "0", 10),
        zavorrine: parseInt(row?.zavorrine ?? "0", 10),
      });
    } catch (err) {
      console.error("[stats/global] error:", err);
      res.json({ total: 5000, bikers: 3200, zavorrine: 1800 });
    }
  });

  app.post("/api/newsletter/subscribe", async (req, res) => {
    try {
      const { email, notifyRides } = req.body || {};
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return sendError(res, 400, "Email non valida");
      }
      const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
      const existing = await db.execute(sql`
        SELECT id FROM newsletter_subscribers WHERE email = ${normalizedEmail} LIMIT 1
      `);
      if (existing.rows.length > 0) {
        return sendError(res, 409, "Già iscritto");
      }
      await db.execute(sql`
        INSERT INTO newsletter_subscribers (email, notify_rides)
        VALUES (${normalizedEmail}, ${notifyRides !== false})
      `);
      return sendSuccess(res);
    } catch (err) {
      console.error("[newsletter/subscribe] error:", err);
      return sendError(res, 500, "Errore interno");
    }
  });

  app.get("/roadmap.json", (_req, res) => {
    const { existsSync } = require("fs") as typeof import("fs");
    const { join } = require("path") as typeof import("path");
    const filePath = join(process.cwd(), "server", "public", "roadmap.json");
    if (existsSync(filePath)) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.sendFile(filePath);
    } else {
      res.json([]);
    }
  });
}
