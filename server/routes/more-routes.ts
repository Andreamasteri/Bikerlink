import type { Express, Request, Response, NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { storage } from "../storage";
import { db } from "../db";
import { serverRestarts } from "@shared/db";
import { PRIVACY_POLICY_IT } from "@shared/privacy-policy-it";
import { sql, desc, count } from "drizzle-orm";
import { triggerMatchingRun, triggerMatchingForUser } from "../matching-engine";
import { sendSuccess, sendError } from "../lib/api-response";
import { initState } from "../init-state";

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).session as { userId?: string };
  if (!session?.userId) {
    return sendError(res, 401, "Non autenticato");
  }
  const user = await storage.getUser(session.userId);
  if (!user || user.role !== "admin") {
    return sendError(res, 403, "Accesso non autorizzato");
  }
  (req as any).adminUser = user;
  next();
}

export function registerMoreRoutes(app: Express) {
  const MANUAL_PATH = path.resolve(process.cwd(), "server/public/bikerlink-manual.pdf");
  const MANUAL_DIR = path.dirname(MANUAL_PATH);
  const EULA_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-eula.pdf");
  const PRIVACY_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-privacy-policy.pdf");

  const COMPETITOR_PDF_PATH = path.resolve(process.cwd(), "server/public/assets/competitor-analysis.pdf");
  const COMPETITOR_PNG_PATH = path.resolve(process.cwd(), "server/public/assets/competitor-analysis.png");
  const MATCHING_PDF_PATH = path.resolve(process.cwd(), "server/public/matching-system.pdf");

  app.get("/matching-system.pdf", (_req, res) => {
    if (!fs.existsSync(MATCHING_PDF_PATH)) {
      return sendError(res, 404, "File non disponibile");
    }
    res.setHeader("Content-Disposition", 'inline; filename="BikerLink-MatchingSystem.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    fs.createReadStream(MATCHING_PDF_PATH).pipe(res);
  });

  app.get("/assets/competitor-analysis.pdf", (_req, res) => {
    if (!fs.existsSync(COMPETITOR_PDF_PATH)) {
      return sendError(res, 404, "File non disponibile");
    }
    res.setHeader("Content-Disposition", 'inline; filename="competitor-analysis.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    fs.createReadStream(COMPETITOR_PDF_PATH).pipe(res);
  });

  app.get("/assets/competitor-analysis.png", (_req, res) => {
    if (!fs.existsSync(COMPETITOR_PNG_PATH)) {
      return sendError(res, 404, "File non disponibile");
    }
    res.setHeader("Content-Type", "image/png");
    fs.createReadStream(COMPETITOR_PNG_PATH).pipe(res);
  });

  app.get("/api/manual/download", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return sendError(res, 404, "Manuale non disponibile");
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-Manual.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(MANUAL_PATH);
    stream.on("error", (err) => {
      console.error("Manual stream error:", err);
      if (!res.headersSent) {
        sendError(res, 500, "Errore lettura file");
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });

  app.get("/api/manual/info", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return res.json({ available: false });
    }
    const stats = fs.statSync(MANUAL_PATH);
    res.json({
      available: true,
      fileName: "BikerLink-Manual.pdf",
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString(),
    });
  });

  const manualUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-manual.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.post("/api/admin/manual/upload", async (req, res) => {
    if (!req.session.userId) return sendError(res, 401, "Non autenticato");
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return sendError(res, 403, "Accesso non autorizzato");

    manualUpload.single("file")(req, res, (err: any) => {
      if (err) return sendError(res, 400, err.message || "Errore upload");
      if (!req.file) return sendError(res, 400, "Nessun file caricato");
      const stats = fs.statSync(MANUAL_PATH);
      res.json({
        message: "Manuale aggiornato con successo",
        fileName: "BikerLink-Manual.pdf",
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    });
  });

  const eulaUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-eula.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  const privacyUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-privacy-policy.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.get("/api/eula/download", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) {
      return sendError(res, 404, "EULA non disponibile");
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-EULA.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(EULA_PDF_PATH);
    stream.on("error", (err) => {
      console.error("EULA stream error:", err);
      if (!res.headersSent) sendError(res, 500, "Errore lettura file");
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/eula/info", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(EULA_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.post("/api/admin/eula/upload", async (req, res) => {
    if (!req.session.userId) return sendError(res, 401, "Non autenticato");
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return sendError(res, 403, "Accesso non autorizzato");

    eulaUpload.single("file")(req, res, (err: any) => {
      if (err) return sendError(res, 400, err.message || "Errore upload");
      if (!req.file) return sendError(res, 400, "Nessun file caricato");
      const stats = fs.statSync(EULA_PDF_PATH);
      sendSuccess(res, { fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() }, "EULA aggiornato con successo");
    });
  });

  app.get("/api/privacy-policy/download", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) {
      return sendError(res, 404, "Privacy Policy non disponibile");
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-PrivacyPolicy.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(PRIVACY_PDF_PATH);
    stream.on("error", (err) => {
      console.error("Privacy Policy stream error:", err);
      if (!res.headersSent) sendError(res, 500, "Errore lettura file");
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/privacy-policy/info", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(PRIVACY_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.get("/api/privacy-policy/exists", (_req, res) => {
    res.json({ exists: fs.existsSync(PRIVACY_PDF_PATH) });
  });

  const PRIVACY_EXPORT_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-privacy-policy-export.pdf");

  app.get("/api/privacy-policy/export", async (_req, res) => {
    try {
       
      const PDFDocument = require("pdfkit") as any;
      const publicDir = path.dirname(PRIVACY_EXPORT_PDF_PATH);
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const writeStream = fs.createWriteStream(PRIVACY_EXPORT_PDF_PATH);
        doc.pipe(writeStream);

        const lines = PRIVACY_POLICY_IT.split("\n");
        const titleLine = lines[0];
        const dateLine = lines[2];
        const bodyText = lines.slice(4).join("\n");

        doc.fontSize(16).font("Helvetica-Bold").text(titleLine, { align: "center" });
        doc.moveDown(0.4);
        doc.fontSize(10).font("Helvetica").text(dateLine, { align: "center" });
        doc.moveDown(1.2);
        doc.fontSize(10).font("Helvetica").text(bodyText, { align: "left", lineGap: 3 });

        doc.end();
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-PrivacyPolicy-Export.pdf"');
      res.setHeader("Content-Type", "application/pdf");
      const stream = fs.createReadStream(PRIVACY_EXPORT_PDF_PATH);
      stream.on("error", (err) => {
        console.error("Privacy export stream error:", err);
        if (!res.headersSent) sendError(res, 500, "Errore lettura file");
        else res.end();
      });
      stream.pipe(res);
    } catch (err) {
      console.error("Privacy Policy PDF export error:", err);
      if (!res.headersSent) sendError(res, 500, "Errore generazione PDF");
    }
  });

  app.post("/api/admin/privacy-policy/upload", async (req, res) => {
    if (!req.session.userId) return sendError(res, 401, "Non autenticato");
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return sendError(res, 403, "Accesso non autorizzato");

    privacyUpload.single("file")(req, res, (err: any) => {
      if (err) return sendError(res, 400, err.message || "Errore upload");
      if (!req.file) return sendError(res, 400, "Nessun file caricato");
      const stats = fs.statSync(PRIVACY_PDF_PATH);
      sendSuccess(res, { fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() }, "Privacy Policy aggiornata con successo");
    });
  });

  app.get("/api/user/export-data", async (req, res) => {
    if (!req.session.userId) return sendError(res, 401, "Non autenticato");
    const user = await storage.getUser(req.session.userId);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const userId = user.id;

    const [photos, gpsRoutes, sentMessagesResult, contestResult] = await Promise.all([
      storage.getUserPhotos(userId),
      storage.getRoutes(userId),
      db.execute(sql`
        SELECT m.id AS message_id, m.conversation_id, m.message_type, m.content,
               m.image_url, m.latitude, m.longitude, m.created_at
        FROM messages m
        WHERE m.sender_id = ${userId}
        ORDER BY m.created_at DESC
      `),
      db.execute(sql`
        SELECT id, photo_url, caption, week_number, year, votes_count, is_approved, created_at
        FROM photo_contest_entries
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone ?? null,
        userType: user.userType,
        sex: user.sex ?? null,
        birthYear: user.birthYear ?? null,
        country: user.country ?? null,
        region: user.region ?? null,
        role: user.role,
        status: user.status,
        eulaAccepted: user.eulaAccepted,
        privacyAccepted: user.privacyAccepted,
        consentAcceptedAt: user.consentAcceptedAt ?? null,
        createdAt: user.createdAt ?? null,
      },
      photos: photos.map((p) => ({
        id: p.id,
        photoUrl: p.photoUrl,
        sortOrder: p.sortOrder,
        isApproved: p.isApproved,
        uploadedAt: p.createdAt,
      })),
      gpsRoutes: gpsRoutes.map((r) => ({
        id: r.id,
        title: r.title ?? null,
        status: r.status,
        totalDistanceKm: r.totalDistanceKm ?? 0,
        durationSeconds: r.durationSeconds ?? 0,
        startedAt: r.startedAt,
        stoppedAt: r.stoppedAt ?? null,
        createdAt: r.createdAt,
      })),
      sentMessages: sentMessagesResult.rows.map((m) => ({
        id: m.message_id,
        conversationId: m.conversation_id,
        messageType: m.message_type,
        content: m.content ?? null,
        imageUrl: m.image_url ?? null,
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
        sentAt: m.created_at,
      })),
      contestEntries: contestResult.rows.map((e) => ({
        id: e.id,
        photoUrl: e.photo_url ?? null,
        caption: e.caption ?? null,
        weekNumber: e.week_number,
        year: e.year,
        votesReceived: e.votes_count,
        isApproved: e.is_approved,
        submittedAt: e.created_at,
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `BikerLink-UserData-${user.nickname}-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(json);
  });

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
    const filePath = path.join(process.cwd(), "server", "public", "roadmap.json");
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.sendFile(filePath);
    } else {
      res.json([]);
    }
  });
}
