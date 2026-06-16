import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { serverRestarts } from "@shared/db";
import { sql, desc, count } from "drizzle-orm";
import { triggerMatchingRun, triggerMatchingForUser } from "../matching-engine";
import { sendSuccess, sendError } from "../lib/api-response";
import { initState } from "../init-state";
import { getCircuitStatus } from "../db-circuit-breaker";

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return sendError(res, 401, "Non autenticato");
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return sendError(res, 403, "Accesso non autorizzato");
  }
  (req as { adminUser?: typeof user }).adminUser = user;
  next();
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
    if (initState.initializing) {
      return res.status(503).json({ status: "initializing", initializing: true, dbCircuit });
    }
    res.json({ status: "ok", initializing: false, dbCircuit });
  });

  app.get("/api/admin/uptime", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("../uptime");
    let crashCount24h = 0;
    try {
      const { appCrashLogs } = await import("@shared/db");
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ count: count() })
        .from(appCrashLogs)
        .where(
          sql`${appCrashLogs.crashType} IN ('crash_system', 'crash_js') AND ${appCrashLogs.reportedAt} >= ${since}`
        );
      crashCount24h = Number(rows[0]?.count ?? 0);
    } catch {
      // no-op: non-critical
    }
    res.json({
      backendStartedAt: SERVER_START_TIME,
      metroStartedAt: uptimeState.metroStartTime,
      metroLastSeenAt: uptimeState.metroLastSeenAt,
      metroOnline: uptimeState.metroOnline,
      frontendStartTime: uptimeState.frontendStartTime,
      serverNow: Date.now(),
      crashCount24h,
    });
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
  app.get("/api/admin/server-metrics", requireAdmin, async (_req, res) => {
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

    res.json({
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
    });
  });

  // Task #2851 — Anteprima ultime righe di log del server (stessa sorgente di system-health).
  app.get("/api/admin/server-logs", requireAdmin, async (req, res) => {
    const requested = parseInt(String(req.query.lines ?? "40"), 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 200) : 40;
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
    res.json({ lines, count: lines.length });
  });

  app.get("/api/admin/restart-history", requireAdmin, async (_req, res) => {
    const [countResult, rows] = await Promise.all([
      db.select({ count: count() }).from(serverRestarts),
      db.select().from(serverRestarts).orderBy(desc(serverRestarts.startedAt)).limit(50),
    ]);
    res.json({
      total: countResult[0]?.count ?? 0,
      restarts: rows.map((r) => ({
        id: r.id,
        startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
        reason: r.reason,
      })),
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
      console.error("[CLIENT-ERROR]", JSON.stringify({
        message: message || "unknown",
        stack: (stack || "").substring(0, 2000),
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
      const result = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE is_fake = false AND status = 'active' AND COALESCE(role, 'user') != 'admin') AS total,
          COUNT(*) FILTER (WHERE is_fake = false AND status = 'active' AND COALESCE(role, 'user') != 'admin' AND last_login_at >= ${fiveMinAgo}) AS online
        FROM users
      `);
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
      const result = await db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE user_type = 'biker') AS bikers,
          COUNT(*) FILTER (WHERE user_type = 'zavorrina') AS zavorrine
        FROM users
        WHERE role != 'admin'
      `);
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
