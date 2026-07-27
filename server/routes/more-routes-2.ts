import type { Express } from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { storage } from "../storage";
import { db } from "../db";
import { PRIVACY_POLICY_IT } from "@shared/privacy-policy-it";
import { sql } from "drizzle-orm";
import { sendSuccess, sendError } from "../lib/api-response";

export function registerMoreRoutes2(app: Express) {
  const MANUAL_PATH = path.resolve(process.cwd(), "server/public/bikerlink-manual.pdf");
  const MANUAL_DIR = path.dirname(MANUAL_PATH);
  const EULA_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-eula.pdf");
  const PRIVACY_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-privacy-policy.pdf");

  const COMPETITOR_PDF_PATH = path.resolve(process.cwd(), "server/public/assets/competitor-analysis.pdf");
  const COMPETITOR_PNG_PATH = path.resolve(process.cwd(), "server/public/assets/competitor-analysis.png");

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

  app.get("/api/manual/view", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return sendError(res, 404, "Manuale non disponibile");
    }
    res.setHeader("Content-Disposition", 'inline; filename="BikerLink-Manual.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(MANUAL_PATH);
    stream.on("error", (err) => {
      console.error("Manual view stream error:", err);
      if (!res.headersSent) sendError(res, 500, "Errore lettura file");
      else res.end();
    });
    stream.pipe(res);
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

    manualUpload.single("file")(req, res, err => {
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

  app.get("/api/eula/view", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) {
      return sendError(res, 404, "EULA non disponibile");
    }
    res.setHeader("Content-Disposition", 'inline; filename="BikerLink-EULA.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(EULA_PDF_PATH);
    stream.on("error", (err) => {
      console.error("EULA view stream error:", err);
      if (!res.headersSent) sendError(res, 500, "Errore lettura file");
      else res.end();
    });
    stream.pipe(res);
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

    eulaUpload.single("file")(req, res, err => {
      if (err) return sendError(res, 400, err.message || "Errore upload");
      if (!req.file) return sendError(res, 400, "Nessun file caricato");
      const stats = fs.statSync(EULA_PDF_PATH);
      sendSuccess(res, { fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() }, "EULA aggiornato con successo");
    });
  });

  app.get("/api/privacy-policy/view", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) {
      return sendError(res, 404, "Privacy Policy non disponibile");
    }
    res.setHeader("Content-Disposition", 'inline; filename="BikerLink-PrivacyPolicy.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(PRIVACY_PDF_PATH);
    stream.on("error", (err) => {
      console.error("Privacy Policy view stream error:", err);
      if (!res.headersSent) sendError(res, 500, "Errore lettura file");
      else res.end();
    });
    stream.pipe(res);
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

  interface PDFDocumentInstance {
    pipe(dest: NodeJS.WritableStream): void;
    fontSize(size: number): PDFDocumentInstance;
    font(name: string): PDFDocumentInstance;
    text(text: string, options?: Record<string, unknown>): PDFDocumentInstance;
    moveDown(lines?: number): PDFDocumentInstance;
    end(): void;
  }
  interface PDFDocumentConstructor {
    new (options?: Record<string, unknown>): PDFDocumentInstance;
  }

  app.get("/api/privacy-policy/export", async (_req, res) => {
    try {
      const PDFDocument = require("pdfkit") as PDFDocumentConstructor;
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

    privacyUpload.single("file")(req, res, err => {
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
}
