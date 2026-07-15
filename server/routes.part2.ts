import type { Express, Request, Response } from "express";
import { db } from "./db";
import { userFavorites } from "@shared/db";
import { eq, and } from "drizzle-orm";
import { storage } from "./storage";
import path from "node:path";
import crypto from "node:crypto";
import { handleMusicMatch, handleMusicMatchReject } from "./routes/music-match";

export function registerPart2Routes(app: Express) {
  app.get("/api/favorites", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const rows = await db
        .select({ favoriteUserId: userFavorites.favoriteUserId })
        .from(userFavorites)
        .where(eq(userFavorites.userId, req.session.userId));
      return res.json(rows.map((r) => r.favoriteUserId));
    } catch (error) {
      console.error("Get favorites error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.post("/api/favorites/:userId", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    try {
      const currentUserId = req.session.userId;
      const targetUserId = req.params.userId as string;
      if (currentUserId === targetUserId) {
        return res.status(400).json({ message: "Non puoi aggiungere te stesso ai preferiti" });
      }
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Utente non trovato" });
      }
      const existing = await db
        .select({ id: userFavorites.id })
        .from(userFavorites)
        .where(and(eq(userFavorites.userId, currentUserId), eq(userFavorites.favoriteUserId, targetUserId)));
      if (existing.length > 0) {
        await db.delete(userFavorites).where(and(eq(userFavorites.userId, currentUserId), eq(userFavorites.favoriteUserId, targetUserId)));
        return res.json({ favorited: false });
      } else {
        await db.insert(userFavorites).values({ userId: currentUserId, favoriteUserId: targetUserId });
        return res.json({ favorited: true });
      }
    } catch (error) {
      console.error("Toggle favorite error:", error);
      return res.status(500).json({ message: "Errore interno del server" });
    }
  });

  app.get("/api/settings/music-provider", (_req: Request, res: Response) => {
    return res.json({ provider: "lastfm" });
  });

  app.get("/api/match/music", (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    return handleMusicMatch(req, res);
  });

  app.post("/api/match/music/:targetUserId/reject", (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Non autenticato" });
    return handleMusicMatchReject(req, res);
  });

  app.get("/admin/visitatori", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as { userId?: string })?.userId;
      if (!userId) {
        res.status(401).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>401</h1><p>Sessione admin richiesta.</p></body></html>');
      }
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        res.status(403).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send('<html><body style="background:#000;color:#888;font-family:sans-serif;padding:40px;text-align:center"><h1>403</h1><p>Accesso riservato agli admin.</p></body></html>');
      }
      const templatePath = path.resolve(process.cwd(), "server", "templates", "admin-visitatori.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(templatePath);
    } catch (err) {
      console.error("[admin/visitatori] error:", err);
      return res.status(500).send("Errore interno");
    }
  });

  app.get(["/privacy-policy", "/privacy"], (_req, res) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get(["/terms", "/tos"], (_req, res) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "terms.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/delete-account", (_req, res) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "delete-account.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });

  app.get("/apple-review", (req, res) => {
    const pageToken = process.env.APPLE_REVIEW_PAGE_TOKEN;
    const provided = typeof req.query.token === "string" ? req.query.token : "";
    const MIN_TOKEN_LEN = 24;
    let valid = false;
    if (pageToken && pageToken.length >= MIN_TOKEN_LEN && provided.length > 0) {
      try {
        const a = Buffer.from(pageToken);
        const b = Buffer.from(provided.padEnd(pageToken.length, "\0").substring(0, pageToken.length));
        valid = a.length === b.length && crypto.timingSafeEqual(a, b) && provided === pageToken;
      } catch (err) {
        console.warn("[routes] Apple review token timing safe equal failed:", err);
        valid = false;
      }
    }
    if (!valid) {
      return res.status(404).send("Non trovato");
    }
    const templatePath = path.resolve(process.cwd(), "server", "templates", "apple-review.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(templatePath);
  });
}
