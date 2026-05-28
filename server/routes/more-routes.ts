import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { serverRestarts } from "@shared/db";
import { sql, desc, count } from "drizzle-orm";
import { triggerMatchingRun, triggerMatchingForUser } from "../matching-engine";
import { sendSuccess, sendError } from "../lib/api-response";
import { initState } from "../init-state";

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
    if (initState.initializing) {
      return res.status(503).json({ status: "initializing", initializing: true });
    }
    res.json({ status: "ok", initializing: false });
  });

  app.get("/api/admin/uptime", requireAdmin, async (_req, res) => {
    const { SERVER_START_TIME, uptimeState } = await import("../uptime");
    res.json({
      backendStartedAt: SERVER_START_TIME,
      metroStartedAt: uptimeState.metroStartTime,
      metroLastSeenAt: uptimeState.metroLastSeenAt,
      metroOnline: uptimeState.metroOnline,
      frontendStartTime: uptimeState.frontendStartTime,
      serverNow: Date.now(),
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
