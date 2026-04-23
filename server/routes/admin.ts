import { Router, type Request, type Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { uploadBuffer } from "../objectStorage";
import { storage } from "../storage";
import { db } from "../db";
import { motoClubs, motoClubRequests, motoClubMembers, motoClubInvites, zavarrinaWishlists, zavarrinaWishlistMotos, conversations, conversationParticipants, messages, feedbackTickets, moderatorLogs, users, userProfiles, userMotorcycles, bikerZavarrinaMatches, bikerBikerMatches, serverRestarts, appSettings, userMusicTracks, userLastfmSessions, userPlaylistSnapshots } from "@shared/schema";
import { createClubInvitesForMoto } from "./motoclubs";
import { eq, and, ne, desc, sql, count, notExists, inArray, lte, isNull, or, ilike } from "drizzle-orm";
import { sendEmail } from "../email";
import { MOTORCYCLES, pickRandomN, getMotoYear } from "../mass-seed-data";
import { getLastMatchingCycleMeta, runBikerBikerMatching, runWishlistMatching, runMatchingForUser } from "../matching-engine";
import { isProtectedUser } from "../constants";
import { SERVER_START_TIME, uptimeState } from "../uptime";
import { getDriveClient } from "../lib/drive-client";
import { DRIVE_FOLDER_TRADUZIONI_ID } from "../backup-service";

const router = Router();

interface OtaErrorEntry {
  error: string;
  failCount: number;
  updateId: string;
  runtimeVersion: string;
  timestamp: string;
}
const otaErrors: OtaErrorEntry[] = [];
const OTA_ERRORS_MAX = 50;

interface StartupBeaconEntry {
  step: string;
  ts: number;
  isoTime: string;
  recovered: boolean;
  platform?: string;
  data?: Record<string, unknown>;
  receivedAt: string;
}
const startupBeacons: StartupBeaconEntry[] = [];
const BEACONS_MAX = 50;

const DRIVE_FOLDER_CACHE_TTL_MS = 10 * 60 * 1000;
const DRIVE_FOLDER_CACHE_MAX = 500;

interface DriveFolderCacheEntry {
  name: string;
  parents: string[] | undefined;
  expiresAt: number;
}

const driveFolderNameCache = new Map<string, DriveFolderCacheEntry>();

function evictExpiredDriveFolderCache(): void {
  const now = Date.now();
  for (const [key, entry] of driveFolderNameCache) {
    if (entry.expiresAt <= now) {
      driveFolderNameCache.delete(key);
    }
  }
  while (driveFolderNameCache.size > DRIVE_FOLDER_CACHE_MAX) {
    const firstKey = driveFolderNameCache.keys().next().value;
    if (firstKey !== undefined) driveFolderNameCache.delete(firstKey as string);
  }
}

async function getDriveFolderMeta(
  folderId: string
): Promise<{ name: string; parents: string[] | undefined } | null> {
  const now = Date.now();
  const cached = driveFolderNameCache.get(folderId);
  if (cached && cached.expiresAt > now) {
    return { name: cached.name, parents: cached.parents };
  }
  try {
    const drive = getDriveClient();
    const resp = await drive.files.get({
      fileId: folderId,
      fields: "name,parents",
    });
    const data = resp.data;
    if (!data.name) return null;
    const parents = (data.parents as string[] | undefined) ?? undefined;
    evictExpiredDriveFolderCache();
    driveFolderNameCache.set(folderId, {
      name: data.name,
      parents,
      expiresAt: now + DRIVE_FOLDER_CACHE_TTL_MS,
    });
    return { name: data.name, parents };
  } catch {
    return null;
  }
}

interface ClubAssignStats {
  assigned: number;
  skipped: number;
  failed: number;
}

async function assignFakeUserToClubs(userId: string): Promise<ClubAssignStats> {
  const stats: ClubAssignStats = { assigned: 0, skipped: 0, failed: 0 };
  try {
    const approvedClubs = await db.select({ id: motoClubs.id }).from(motoClubs).where(eq(motoClubs.isApproved, true));
    if (approvedClubs.length === 0) return stats;
    const pickCount = Math.min(1 + Math.floor(Math.random() * 3), approvedClubs.length);
    const shuffled = approvedClubs.sort(() => Math.random() - 0.5).slice(0, pickCount);
    for (const club of shuffled) {
      try {
        const result = await db.insert(motoClubMembers).values({
          clubId: club.id,
          userId,
          role: "member",
          status: "active",
        }).onConflictDoNothing().returning({ id: motoClubMembers.id });
        if (result.length > 0) {
          stats.assigned++;
        } else {
          stats.skipped++;
        }
      } catch (err) {
        console.error("[assignFakeUserToClubs] insert error:", err);
        stats.failed++;
      }
    }
  } catch (err) {
    console.error("[assignFakeUserToClubs] error:", err);
    stats.failed++;
  }
  return stats;
}

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  storage.getUser(req.session.userId).then((user) => {
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }
    (req as any).currentUser = user;
    next();
  }).catch(() => {
    return res.status(500).json({ message: "Errore autenticazione admin" });
  });
}

router.post("/ota-error", (req: Request, res: Response) => {
  try {
    const { error, failCount, updateId, runtimeVersion } = req.body as {
      error?: string;
      failCount?: number;
      updateId?: string;
      runtimeVersion?: string;
    };
    if (!error) return res.status(400).json({ message: "error is required" });
    const entry: OtaErrorEntry = {
      error: String(error).substring(0, 500),
      failCount: typeof failCount === "number" ? failCount : 0,
      updateId: String(updateId ?? "unknown").substring(0, 64),
      runtimeVersion: String(runtimeVersion ?? "unknown").substring(0, 16),
      timestamp: new Date().toISOString(),
    };
    otaErrors.push(entry);
    if (otaErrors.length > OTA_ERRORS_MAX) otaErrors.splice(0, otaErrors.length - OTA_ERRORS_MAX);
    console.warn(`[OTA-ERROR] rv=${entry.runtimeVersion} uid=${entry.updateId} fail#${entry.failCount}: ${entry.error}`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/client-error", (req: Request, res: Response) => {
  try {
    const { message, stack, componentStack, platform, appVersion, isFatal } = req.body || {};
    console.error("[CLIENT-ERROR]", JSON.stringify({
      message: message || "unknown",
      stack: (stack || "").substring(0, 2000),
      componentStack: (componentStack || "").substring(0, 1000),
      platform: platform || "unknown",
      appVersion: appVersion || "unknown",
      isFatal: !!isFatal,
      timestamp: new Date().toISOString(),
    }));
    return res.json({ received: true });
  } catch {
    return res.status(200).json({ received: true });
  }
});

router.post("/startup-beacon", (req: Request, res: Response) => {
  try {
    const { step, ts, recovered, platform, ...rest } = req.body as {
      step?: string;
      ts?: number;
      recovered?: boolean;
      platform?: string;
      [key: string]: unknown;
    };
    if (!step) return res.status(400).json({ message: "step is required" });
    const tsNum = typeof ts === "number" ? ts : Date.now();
    const entry: StartupBeaconEntry = {
      step: String(step).substring(0, 100),
      ts: tsNum,
      isoTime: new Date(tsNum).toISOString(),
      recovered: !!recovered,
      platform: platform ? String(platform).substring(0, 16) : undefined,
      data: Object.keys(rest).length > 0 ? rest as Record<string, unknown> : undefined,
      receivedAt: new Date().toISOString(),
    };
    startupBeacons.push(entry);
    if (startupBeacons.length > BEACONS_MAX) startupBeacons.splice(0, startupBeacons.length - BEACONS_MAX);
    console.log(`[BEACON]${entry.recovered ? " RECOVERED" : ""} step=${entry.step} platform=${entry.platform ?? "?"} t=${entry.isoTime}${entry.data ? " data=" + JSON.stringify(entry.data) : ""}`);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.use(requireAdmin);

router.get("/startup-beacon", (_req: Request, res: Response) => {
  return res.json({
    count: startupBeacons.length,
    beacons: [...startupBeacons].reverse(),
  });
});

router.post("/verify-password", async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password mancante" });
    }
    const user = (req as any).currentUser;
    const fullUser = await storage.getUser(user.id);
    if (!fullUser || !fullUser.password) {
      return res.status(403).json({ message: "Utente non trovato" });
    }
    const valid = await bcrypt.compare(password, fullUser.password);
    if (!valid) {
      return res.status(401).json({ message: "Password non corretta" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Errore verifica password" });
  }
});

router.get("/users", async (_req: Request, res: Response) => {
  try {
    const users = await storage.getAllUsers();
    const [sessionsRows, tracksRows] = await Promise.all([
      db.select({ userId: userLastfmSessions.userId }).from(userLastfmSessions),
      db.selectDistinct({ userId: userMusicTracks.userId }).from(userMusicTracks),
    ]);
    const lastfmUserIds = new Set([
      ...sessionsRows.map((r) => r.userId),
      ...tracksRows.map((r) => r.userId),
    ]);
    const safeUsers = users.map(({ password, ...u }) => ({
      ...u,
      hasLastfmData: lastfmUserIds.has(u.id),
    }));
    return res.json(safeUsers);
  } catch (error) {
    console.error("Admin get users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/status", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!["active", "suspended", "blocked"].includes(status)) {
      return res.status(400).json({ message: "Stato non valido" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    const user = await storage.updateUser(id, { status });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `set_status_${status}`,
      targetType: "user",
      targetId: id,
      details: `Status cambiato a ${status}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/role", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) {
      return res.status(400).json({ message: "Ruolo non valido" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    const user = await storage.updateUser(id, { role });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `set_role_${role}`,
      targetType: "user",
      targetId: id,
      details: `Ruolo cambiato a ${role}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user role error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/email", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { email } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Email non valida" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    const user = await storage.updateUser(id, { email });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_email",
      targetType: "user",
      targetId: id,
      details: `Email aggiornata a ${email}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user email error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/password", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: "La password deve avere almeno 6 caratteri" });
    }
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Utente non trovato" });
    if (isProtectedUser(targetUser.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await storage.updateUser(id, { password: hashedPassword });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "reset_password",
      targetType: "user",
      targetId: id,
      details: "Password resettata dall'admin",
    });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/primal", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { isPrimal } = req.body;
    const user = await storage.updateUser(id, { isPrimal: !!isPrimal });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: isPrimal ? "assign_primal" : "remove_primal",
      targetType: "user",
      targetId: id,
      details: `Primal ${isPrimal ? "assegnato" : "rimosso"} a ${user.nickname}`,
    });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin toggle primal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.role === "admin" || user.role === "moderator") {
      return res.status(403).json({ message: "Impossibile eliminare un utente di sistema" });
    }
    if (isProtectedUser(user.nickname)) {
      return res.status(403).json({ message: "Utente di sistema non modificabile" });
    }
    await storage.deleteUser(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_user",
      targetType: "user",
      targetId: id,
      details: `Utente eliminato: ${user.nickname}`,
    });
    return res.json({ message: "Utente eliminato con successo" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/users/:id/lastfm", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    const [tracks, sessions, snapshots] = await Promise.all([
      db.delete(userMusicTracks).where(eq(userMusicTracks.userId, id)),
      db.delete(userLastfmSessions).where(eq(userLastfmSessions.userId, id)),
      db.delete(userPlaylistSnapshots).where(eq(userPlaylistSnapshots.userId, id)),
    ]);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "clear_lastfm",
      targetType: "user",
      targetId: id,
      details: `Dati Last.fm cancellati per ${user.nickname}: ${tracks.rowCount ?? 0} tracce, ${sessions.rowCount ?? 0} sessioni, ${snapshots.rowCount ?? 0} snapshot`,
    });
    return res.json({
      message: "Dati Last.fm cancellati",
      deleted: {
        tracks: tracks.rowCount ?? 0,
        sessions: sessions.rowCount ?? 0,
        snapshots: snapshots.rowCount ?? 0,
      },
    });
  } catch (error) {
    console.error("Admin clear lastfm error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/workshops", async (_req: Request, res: Response) => {
  try {
    const workshopsList = await storage.getWorkshops();
    return res.json(workshopsList);
  } catch (error) {
    console.error("Admin get workshops error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/workshops", async (req: Request, res: Response) => {
  try {
    const workshop = await storage.createWorkshop(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_workshop",
      targetType: "workshop",
      targetId: workshop.id,
      details: `Officina creata: ${workshop.name}`,
    });
    return res.status(201).json(workshop);
  } catch (error) {
    console.error("Admin create workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/workshops/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const workshop = await storage.updateWorkshop(id, req.body);
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_workshop",
      targetType: "workshop",
      targetId: id,
      details: `Officina aggiornata: ${workshop.name}`,
    });
    return res.json(workshop);
  } catch (error) {
    console.error("Admin update workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/workshops/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const workshop = await storage.updateWorkshop(id, { isApproved: true });
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "approve_workshop",
      targetType: "workshop",
      targetId: id,
      details: `Officina approvata: ${workshop.name}`,
    });
    return res.json(workshop);
  } catch (error) {
    console.error("Admin approve workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/workshops/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await storage.deleteWorkshop(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_workshop",
      targetType: "workshop",
      targetId: id,
    });
    return res.json({ message: "Officina eliminata" });
  } catch (error) {
    console.error("Admin delete workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/easter-eggs", async (_req: Request, res: Response) => {
  try {
    const eggs = await storage.getEasterEggs();
    return res.json(eggs);
  } catch (error) {
    console.error("Admin get easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/easter-eggs", async (req: Request, res: Response) => {
  try {
    const egg = await storage.createEasterEgg(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_easter_egg",
      targetType: "easter_egg",
      targetId: egg.id,
      details: `Easter egg creato: ${egg.name}`,
    });
    return res.status(201).json(egg);
  } catch (error) {
    console.error("Admin create easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/easter-eggs/batch", async (req: Request, res: Response) => {
  try {
    const count = parseInt(req.body.count) || 10;
    const radius = parseInt(req.body.radius) || 30;
    const points = parseInt(req.body.points) || 10;
    const existing = await storage.getEasterEggs();
    const startNum = existing.length + 1;
    const created = [];
    for (let i = 0; i < count; i++) {
      const lat = 36 + Math.random() * 11;
      const lng = 6.5 + Math.random() * 12;
      const egg = await storage.createEasterEgg({
        name: `Easter Egg #${startNum + i}`,
        latitude: parseFloat(lat.toFixed(6)),
        longitude: parseFloat(lng.toFixed(6)),
        radius,
        points,
        isActive: true,
      });
      created.push(egg);
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "batch_create_easter_eggs",
      targetType: "easter_egg",
      targetId: "",
      details: `${count} Easter Egg creati in batch`,
    });
    return res.status(201).json(created);
  } catch (error) {
    console.error("Admin batch create easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/easter-eggs/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const egg = await storage.updateEasterEgg(id, req.body);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_easter_egg",
      targetType: "easter_egg",
      targetId: id,
      details: `Easter egg aggiornato: ${egg.name}`,
    });
    return res.json(egg);
  } catch (error) {
    console.error("Admin update easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/easter-eggs/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await storage.deleteEasterEgg(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_easter_egg",
      targetType: "easter_egg",
      targetId: id,
    });
    return res.json({ message: "Easter egg eliminato" });
  } catch (error) {
    console.error("Admin delete easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/easter-eggs/:id/stats", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const egg = await storage.getEasterEgg(id);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    const { db } = await import("../db");
    const { collectedEasterEggs } = await import("../../shared/schema");
    const { eq, count } = await import("drizzle-orm");
    const [result] = await db.select({ count: count() }).from(collectedEasterEggs).where(eq(collectedEasterEggs.easterEggId, id));
    return res.json({ eggId: id, collectionsCount: result?.count || 0 });
  } catch (error) {
    console.error("Admin get easter egg stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/easter-eggs-stats", async (_req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const { collectedEasterEggs } = await import("../../shared/schema");
    const { count, sql } = await import("drizzle-orm");
    const rows = await db.select({
      easterEggId: collectedEasterEggs.easterEggId,
      collectionsCount: count(),
    }).from(collectedEasterEggs).groupBy(collectedEasterEggs.easterEggId);
    const statsMap: Record<string, number> = {};
    rows.forEach((r) => { statsMap[r.easterEggId] = Number(r.collectionsCount); });
    return res.json(statsMap);
  } catch (error) {
    console.error("Admin get easter egg stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/campaigns", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get campaigns error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/campaigns", async (req: Request, res: Response) => {
  try {
    const campaign = await storage.createAdCampaign(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_campaign",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Campagna creata: ${campaign.name}`,
    });
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const campaign = await storage.updateAdCampaign(id, req.body);
    if (!campaign) {
      return res.status(404).json({ message: "Campagna non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_campaign",
      targetType: "campaign",
      targetId: id,
      details: `Campagna aggiornata: ${campaign.name}`,
    });
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await storage.deleteCampaign(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_campaign",
      targetType: "campaign",
      targetId: id,
    });
    return res.json({ message: "Campagna eliminata" });
  } catch (error) {
    console.error("Admin delete campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/reports", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const reportsList = await storage.getReports(status);
    return res.json(reportsList);
  } catch (error) {
    console.error("Admin get reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/reports/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!["resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Stato non valido" });
    }
    const report = await storage.updateReport(id, {
      status,
      resolvedBy: req.session.userId!,
      resolvedAt: new Date(),
    });
    if (!report) {
      return res.status(404).json({ message: "Segnalazione non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `resolve_report_${status}`,
      targetType: "report",
      targetId: id,
      details: `Segnalazione ${status}`,
    });
    return res.json(report);
  } catch (error) {
    console.error("Admin resolve report error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { pool } = await import("../db");
    const totalUsersResult = await pool.query("SELECT count(*)::int as count FROM users WHERE is_fake = false");
    const totalUsers = totalUsersResult.rows[0]?.count ?? 0;

    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const [onlineUsersNow, activeUsersWeek, workshopContacts, campaigns, pendingReports] = await Promise.all([
      storage.countActiveUsers(fifteenMinutesAgo),
      storage.countActiveUsers(sevenDaysAgo),
      storage.getWorkshopContactsByPeriod(thirtyDaysAgo, now),
      storage.getAllCampaigns(),
      storage.getReports("pending"),
    ]);

    const totalAdClicks = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);

    return res.json({
      totalUsers,
      onlineUsersNow,
      activeUsersWeek,
      workshopContactsMonth: workshopContacts.length,
      totalAdClicks,
      activeCampaigns: campaigns.filter((c) => c.isActive).length,
      pendingReports: pendingReports.length,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/export-csv", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [workshopContacts, campaigns] = await Promise.all([
      storage.getWorkshopContactsByPeriod(thirtyDaysAgo, now),
      storage.getAllCampaigns(),
    ]);

    let csv = "Tipo,ID,Nome,Contatti/Click,Impressioni,Periodo\n";

    for (const campaign of campaigns) {
      csv += `Campagna,${campaign.id},"${campaign.name}",${campaign.impressions},${campaign.impressions},Ultimo mese\n`;
    }

    const contactsByWorkshop: Record<string, number> = {};
    for (const contact of workshopContacts) {
      contactsByWorkshop[contact.workshopId] = (contactsByWorkshop[contact.workshopId] || 0) + 1;
    }

    for (const [workshopId, count] of Object.entries(contactsByWorkshop)) {
      csv += `Officina,${workshopId},,${count},,Ultimo mese\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=syneco-report.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Admin export CSV error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/users-list", async (_req: Request, res: Response) => {
  try {
    const { pool } = await import("../db");
    const result = await pool.query(
      "SELECT id, nickname, user_type as \"userType\", sex, region, created_at as \"createdAt\" FROM users WHERE is_fake = false ORDER BY created_at DESC"
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics users-list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/active-users", async (req: Request, res: Response) => {
  try {
    const period = parseInt(req.query.period as string) || 30;
    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
    const { pool } = await import("../db");
    const result = await pool.query(
      "SELECT id, nickname, user_type as \"userType\", last_login_at as \"lastLoginAt\" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= $1 ORDER BY last_login_at DESC",
      [since]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics active-users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/online-now", async (_req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const { pool } = await import("../db");
    const result = await pool.query(
      "SELECT id, nickname, user_type as \"userType\", last_login_at as \"lastLoginAt\" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= $1 ORDER BY last_login_at DESC",
      [fifteenMinutesAgo]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics online-now error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/ad-clicks", async (_req: Request, res: Response) => {
  try {
    const { pool } = await import("../db");
    const result = await pool.query(
      `SELECT ac.id, ac.user_id as "userId", u.nickname, u.user_type as "userType", 
              camp.name as "adTitle", ac.created_at as "clickedAt"
       FROM ad_clicks ac
       LEFT JOIN users u ON ac.user_id = u.id
       LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
       ORDER BY ac.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics ad-clicks error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/pending-reports", async (_req: Request, res: Response) => {
  try {
    const { pool } = await import("../db");
    const result = await pool.query(
      `SELECT ft.id, ft.ticket_type as "type", ft.subject as "title", ft.message as "description",
              u.nickname as "submittedBy", ft.created_at as "createdAt"
       FROM feedback_tickets ft
       LEFT JOIN users u ON ft.user_id = u.id
       WHERE ft.status = 'open'
       ORDER BY ft.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics pending-reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await storage.getAllAppSettings();
    return res.json(settings);
  } catch (error) {
    console.error("Admin get settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/settings/email-config", async (_req: Request, res: Response) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const gmailUser = userSetting?.value || "";
    let masked = "";
    if (gmailUser) {
      const [local, domain] = gmailUser.split("@");
      if (local && domain) {
        masked = local.substring(0, 3) + "***@" + domain;
      } else {
        masked = gmailUser.substring(0, 3) + "***";
      }
    }
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const configured = !!(gmailUser && passSetting?.value);
    return res.json({ configured, maskedEmail: masked });
  } catch (error) {
    console.error("Get email config error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/email-config", async (req: Request, res: Response) => {
  try {
    const { gmailUser, gmailAppPassword, adminPassword } = req.body;
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }

    const admin = (req as any).currentUser;
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const validPassword = await bcrypt.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non corretta" });
    }

    if (gmailUser) {
      await storage.upsertAppSetting("gmail_user", gmailUser);
    }
    if (gmailAppPassword) {
      await storage.upsertAppSetting("gmail_app_password", gmailAppPassword);
    }

    return res.json({ message: "Configurazione email aggiornata" });
  } catch (error) {
    console.error("Update email config error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/migrate/verify-real-users", async (_req: Request, res: Response) => {
  try {
    const allUsers = await storage.getAllUsers();
    const realUsers = allUsers.filter((u: any) => !u.isFake && !u.emailVerified);
    for (const user of realUsers) {
      await storage.markUserEmailVerified(user.id);
    }
    return res.json({ message: `${realUsers.length} utenti reali marcati come verificati` });
  } catch (error) {
    console.error("Migrate verify real users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/disable-feature", async (req: Request, res: Response) => {
  try {
    const { key } = req.body as { key: string };
    const allowedKeys = ["ads_enabled", "syneco_branding_visible"];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ message: "Chiave non valida" });
    }

    const result = await storage.upsertAppSetting(key, "false");
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "setting",
      targetId: key,
      details: `${key} = false (disabilitato senza password)`,
    });

    return res.json(result);
  } catch (error) {
    console.error("Admin disable-feature error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/toggle-protected", async (req: Request, res: Response) => {
  try {
    const { key, value, adminPassword } = req.body;
    const allowedKeys = ["email_verification_enabled", "ads_enabled", "syneco_branding_visible", "donation_enabled", "donation_text", "gps_required", "marketplace_enabled", "fake_users_enabled", "ghost_mode_enabled", "phone_field_enabled", "user_available_on_login", "floating_widget_enabled"];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ message: "Chiave non valida" });
    }
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }

    const admin = await storage.getUser(req.session.userId!);
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const validPassword = await bcrypt.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non valida" });
    }

    const result = await storage.upsertAppSetting(key, value);
    await storage.createModeratorLog({
      moderatorId: admin.id,
      action: "update_setting",
      targetType: "setting",
      targetId: key,
      details: `${key} = ${value}`,
    } as any);

    return res.json(result);
  } catch (error) {
    console.error("Admin toggle-protected error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/motoclub_include_zav", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    const newEnabled = value !== "false";

    const current = await storage.getAppSetting("motoclub_include_zav");
    const wasEnabled = current?.value !== "false";

    const setting = await storage.upsertAppSetting("motoclub_include_zav", value);

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "motoclub_include_zav",
      details: `motoclub_include_zav = ${value}`,
    });

    if (wasEnabled && !newEnabled) {
      const zavarrinaUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.userType, "zavorrina"));
      const zavIds = zavarrinaUsers.map((u) => u.id);
      if (zavIds.length > 0) {
        await db.delete(motoClubInvites).where(inArray(motoClubInvites.userId, zavIds));
        await db.delete(motoClubMembers).where(inArray(motoClubMembers.userId, zavIds));
      }
    } else if (!wasEnabled && newEnabled) {
      const wishlists = await db
        .select({ userId: zavarrinaWishlists.userId, id: zavarrinaWishlists.id })
        .from(zavarrinaWishlists);
      for (const wl of wishlists) {
        const motos = await db
          .select()
          .from(zavarrinaWishlistMotos)
          .where(eq(zavarrinaWishlistMotos.wishlistId, wl.id));
        for (const moto of motos) {
          if (moto.brand) {
            await createClubInvitesForMoto(wl.userId, moto.brand, moto.model || "").catch(() => {});
          }
        }
      }
    }

    return res.json(setting);
  } catch (error) {
    console.error("Admin motoclub_include_zav error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/show_search_preference", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("show_search_preference", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "show_search_preference",
      details: `show_search_preference = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin show_search_preference error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/maps_enabled", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("maps_enabled", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "maps_enabled",
      details: `maps_enabled = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin maps_enabled error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/maps_provider", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    const allowed = ["carto_light", "carto_dark", "esri_gray"];
    if (!allowed.includes(value)) {
      return res.status(400).json({ message: "Provider non valido" });
    }
    const setting = await storage.upsertAppSetting("maps_provider", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "maps_provider",
      details: `maps_provider = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin maps_provider error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/music_provider", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "lastfm") {
      return res.status(400).json({ message: "Provider non valido: usare 'lastfm'" });
    }
    const setting = await storage.upsertAppSetting("music_provider", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "music_provider",
      details: `music_provider = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin music_provider error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/maps_user_choice_enabled", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("maps_user_choice_enabled", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "maps_user_choice_enabled",
      details: `maps_user_choice_enabled = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin maps_user_choice_enabled error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/theme_user_switching_enabled", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("theme_user_switching_enabled", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "theme_user_switching_enabled",
      details: `theme_user_switching_enabled = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin theme_user_switching_enabled error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/theme_default", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    const valid = ["attuale", "asfalto", "velocita", "rotta"];
    if (!valid.includes(value)) {
      return res.status(400).json({ message: "Tema non valido" });
    }
    const setting = await storage.upsertAppSetting("theme_default", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "theme_default",
      details: `theme_default = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin theme_default error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/settings/matching_countries", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("matching_countries");
    let countries: string[] = [];
    try { countries = setting?.value ? (JSON.parse(setting.value) || []) : []; } catch { countries = []; }
    return res.json({ countries });
  } catch (error) {
    console.error("Admin get matching_countries error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/matching_countries", async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    let parsed: unknown;
    try { parsed = value ? JSON.parse(value) : []; } catch { return res.status(400).json({ message: "Formato JSON non valido" }); }
    if (!Array.isArray(parsed) || !parsed.every((c: unknown) => typeof c === "string" && /^[A-Z]{2}$/i.test(c))) {
      return res.status(400).json({ message: "Deve essere un array di codici paese ISO a 2 lettere" });
    }
    const countries: string[] = parsed.map((c: string) => c.toUpperCase());
    const setting = await storage.upsertAppSetting("matching_countries", JSON.stringify(countries));
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "matching_countries",
      details: `Paesi matching aggiornati: ${countries.join(", ") || "nessuno (tutti)"}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin update matching_countries error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/settings/coordinates_max_age_seconds", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("coordinates_max_age_seconds");
    const value = setting?.value ? parseInt(setting.value, 10) : 300;
    return res.json({ value: isNaN(value) ? 300 : value });
  } catch (error) {
    console.error("Admin get coordinates_max_age_seconds error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/coordinates_max_age_seconds", async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const numVal = parseInt(value, 10);
    if (isNaN(numVal) || numVal < 10) {
      return res.status(400).json({ message: "Valore deve essere >= 10 secondi" });
    }
    const setting = await storage.upsertAppSetting("coordinates_max_age_seconds", String(numVal));
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "coordinates_max_age_seconds",
      details: `Età max coordinate aggiornata: ${numVal} sec`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin update coordinates_max_age_seconds error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/:key", async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const { value, valueJson } = req.body;
    const setting = await storage.upsertAppSetting(key, value, valueJson);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: key,
      details: `Impostazione aggiornata: ${key}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin update setting error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

const adsDir = path.join(process.cwd(), "uploads", "ads");
const inviteCodesDir = path.join(process.cwd(), "uploads", "invitation-codes");
if (!fs.existsSync(inviteCodesDir)) fs.mkdirSync(inviteCodesDir, { recursive: true });
if (!fs.existsSync(adsDir)) {
  fs.mkdirSync(adsDir, { recursive: true });
}

const inviteCodeImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, inviteCodesDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const inviteCodeUpload = multer({
  storage: inviteCodeImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini JPEG o PNG"));
    }
  },
});

async function uploadAdImageToObjectStorage(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
  const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
  const filename = uniqueSuffix + path.extname(originalname);
  const objectPath = `public/ads/${filename}`;
  console.log(`[uploadAdImageToObjectStorage] Uploading "${originalname}" → ${objectPath} (${buffer.length} bytes, ${mimetype})`);
  await uploadBuffer(objectPath, buffer, mimetype);
  console.log(`[uploadAdImageToObjectStorage] Upload OK → /api/ads/images/${filename}`);
  return `/api/ads/images/${filename}`;
}

const adUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini JPEG, PNG, WebP o GIF"));
    }
  },
});

router.get("/advertisements", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get advertisements error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/advertisements", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Nome campagna obbligatorio" });
    }
    const imageUrl = req.file ? await uploadAdImageToObjectStorage(req.file.buffer, req.file.originalname, req.file.mimetype) : (req.body.imageUrl || null);
    const campaign = await storage.createAdCampaign({
      name,
      sponsor: sponsor || "Syneco Lubrificanti",
      imageUrl,
      linkUrl: linkUrl || null,
      displayMode: "banner",
      description: description || null,
      targetUserType: targetUserType || "biker",
      rotationDuration: rotationDuration ? parseInt(rotationDuration) : 10,
      rotationMode: rotationMode || "sequential",
      sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      placement: placement || "all",
    });
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_advertisement",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Pubblicità creata: ${campaign.name} (${targetUserType || "biker"})`,
    });
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/advertisements/:id", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const updates: any = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.sponsor !== undefined) updates.sponsor = req.body.sponsor;
    if (req.body.linkUrl !== undefined) updates.linkUrl = req.body.linkUrl;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive === true || req.body.isActive === "true";
    if (req.body.targetUserType !== undefined) updates.targetUserType = req.body.targetUserType;
    if (req.body.rotationDuration !== undefined) updates.rotationDuration = parseInt(req.body.rotationDuration);
    if (req.body.rotationMode !== undefined) updates.rotationMode = req.body.rotationMode;
    if (req.body.sortOrder !== undefined) updates.sortOrder = parseInt(req.body.sortOrder);
    if (req.body.startDate !== undefined) updates.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.endDate !== undefined) updates.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (req.body.placement !== undefined) updates.placement = req.body.placement;
    if (req.file) {
      updates.imageUrl = await uploadAdImageToObjectStorage(req.file.buffer, req.file.originalname, req.file.mimetype);
      const existing = await storage.getAdCampaign(id);
      updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
    } else if (req.body.imageUrl !== undefined) {
      updates.imageUrl = req.body.imageUrl;
    }
    if (req.body.bumpImageVersion === true || req.body.bumpImageVersion === "true") {
      const existing = await storage.getAdCampaign(id);
      updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
    }
    const campaign = await storage.updateAdCampaign(id, updates);
    if (!campaign) {
      return res.status(404).json({ message: "Campagna non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_advertisement",
      targetType: "campaign",
      targetId: id,
      details: `Pubblicità aggiornata: ${campaign.name}`,
    });
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/advertisements/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await storage.deleteCampaign(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_advertisement",
      targetType: "campaign",
      targetId: id,
    });
    return res.json({ message: "Pubblicità eliminata" });
  } catch (error) {
    console.error("Admin delete advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

const eulaUpload = multer({
  dest: path.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Solo file .txt (text/plain) sono accettati"));
    }
  },
});

router.post("/settings/eula/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }

    const content = fs.readFileSync(req.file.path, "utf-8");

    fs.unlinkSync(req.file.path);

    const setting = await storage.upsertAppSetting("eula_text", content);

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "upload_eula",
      targetType: "app_setting",
      targetId: "eula_text",
      details: "EULA caricato da file .txt",
    });

    return res.json({ message: "EULA caricato con successo", value: content, setting });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Admin upload EULA error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/settings/privacy-policy/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }

    const content = fs.readFileSync(req.file.path, "utf-8");
    fs.unlinkSync(req.file.path);

    const setting = await storage.upsertAppSetting("privacy_policy_text", content);

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "upload_privacy_policy",
      targetType: "app_setting",
      targetId: "privacy_policy_text",
      details: "Privacy Policy caricata da file .txt",
    });

    return res.json({ message: "Privacy Policy caricata con successo", value: content, setting });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Admin upload Privacy Policy error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/performance-records", async (_req: Request, res: Response) => {
  try {
    const allRoutes = await storage.getAllRoutes();
    const userIds = [...new Set(allRoutes.map(r => r.userId))];
    const usersMap: Record<string, string> = {};
    for (const uid of userIds) {
      const user = await storage.getUser(uid);
      if (user) usersMap[uid] = user.nickname;
    }
    const records = allRoutes.map(r => ({
      ...r,
      nickname: usersMap[r.userId] || "Sconosciuto",
    }));
    return res.json(records);
  } catch (error) {
    console.error("Admin get performance records error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/logs", async (_req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    console.error("Admin get logs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/moderator-logs", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const filterModeratorId = req.query.moderatorId ? String(req.query.moderatorId) : undefined;
    const filterAction = req.query.action ? String(req.query.action) : undefined;

    const rawLogs = await storage.getModeratorLogs();

    let filtered = rawLogs;
    if (filterModeratorId) filtered = filtered.filter((l) => l.moderatorId === filterModeratorId);
    if (filterAction) filtered = filtered.filter((l) => l.action === filterAction);

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    const allUserIds = new Set<string>();
    for (const log of paginated) {
      allUserIds.add(log.moderatorId);
      if (log.targetType === "user" && log.targetId) allUserIds.add(log.targetId);
    }
    const allModeratorsInFull = [...new Set(rawLogs.map((l) => l.moderatorId))];
    for (const id of allModeratorsInFull) allUserIds.add(id);

    const resolvedUsers = await Promise.all([...allUserIds].map((id) => storage.getUser(id)));
    const userMap = new Map<string, { id: string; nickname: string }>();
    for (const u of resolvedUsers) {
      if (u) userMap.set(u.id, { id: u.id, nickname: u.nickname });
    }

    const enriched = paginated.map((log) => ({
      ...log,
      moderatorNickname: userMap.get(log.moderatorId)?.nickname ?? log.moderatorId,
      targetUserNickname: log.targetType === "user" && log.targetId ? (userMap.get(log.targetId)?.nickname ?? log.targetId) : null,
    }));

    const moderatorProfiles = allModeratorsInFull
      .map((id) => userMap.get(id) ?? { id, nickname: id });
    const allActions = [...new Set(rawLogs.map((l) => l.action))];

    return res.json({
      logs: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      moderators: moderatorProfiles,
      actions: allActions,
    });
  } catch (error) {
    console.error("Admin moderator-logs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/stregatti", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const type = String(req.query.type ?? "tutti");
    const result = await storage.getFakeUserStats(limit, offset, type);
    return res.json(result);
  } catch (error) {
    console.error("Admin get stregatti error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/stregatti", async (req: Request, res: Response) => {
  try {
    const { nickname, userType, sex, coupleSexConfig, birthYear, region, bio, moto, wishlistDescription, wishlistMotos } = req.body;
    if (!nickname || !userType) {
      return res.status(400).json({ message: "Nickname e tipo utente obbligatori" });
    }
    const existingNickname = await storage.getUserByNickname(nickname);
    if (existingNickname) {
      return res.status(409).json({ message: "Nickname già in uso" });
    }
    const email = `fake_${nickname.toLowerCase().replace(/[^a-z0-9]/g, "")}@fakeuser.bikerlink.it`;
    const hashedPassword = await bcrypt.hash("fakeuser2025!", 10);
    const country = req.body.country || "IT";
    const user = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      coupleSexConfig: coupleSexConfig || null,
      birthYear: birthYear || null,
      region: region || null,
      country,
      isFake: true,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
      lastLoginAt: new Date(),
    });
    const COUNTRY_CENTERS: Record<string, { lat: number; lng: number }> = {
      IT: { lat: 41.87, lng: 12.57 }, DE: { lat: 51.17, lng: 10.45 }, FR: { lat: 46.23, lng: 2.21 },
      ES: { lat: 40.46, lng: -3.75 }, PT: { lat: 39.40, lng: -8.22 }, AT: { lat: 47.52, lng: 14.55 },
      CH: { lat: 46.82, lng: 8.23 }, BE: { lat: 50.50, lng: 4.47 }, NL: { lat: 52.13, lng: 5.29 },
      PL: { lat: 51.92, lng: 19.15 }, CZ: { lat: 49.82, lng: 15.47 }, SK: { lat: 48.67, lng: 19.70 },
      HU: { lat: 47.16, lng: 19.50 }, RO: { lat: 45.94, lng: 24.97 }, GR: { lat: 39.07, lng: 21.82 },
      HR: { lat: 45.10, lng: 15.20 }, SI: { lat: 46.12, lng: 14.80 }, RS: { lat: 44.02, lng: 21.01 },
      BA: { lat: 44.17, lng: 17.91 }, ME: { lat: 42.71, lng: 19.37 }, MK: { lat: 41.61, lng: 21.75 },
      AL: { lat: 41.15, lng: 20.17 }, BG: { lat: 42.73, lng: 25.49 }, MD: { lat: 47.41, lng: 28.37 },
      UA: { lat: 48.38, lng: 31.17 }, BY: { lat: 53.71, lng: 27.95 }, LT: { lat: 55.17, lng: 23.88 },
      LV: { lat: 56.88, lng: 24.60 }, EE: { lat: 58.60, lng: 25.01 }, FI: { lat: 64.96, lng: 25.74 },
      SE: { lat: 60.13, lng: 18.64 }, NO: { lat: 60.47, lng: 8.47 }, DK: { lat: 56.26, lng: 9.50 },
      IE: { lat: 53.41, lng: -8.24 }, GB: { lat: 55.38, lng: -3.44 }, IS: { lat: 64.96, lng: -19.02 },
      LU: { lat: 49.82, lng: 6.13 }, MT: { lat: 35.94, lng: 14.38 }, CY: { lat: 35.13, lng: 33.43 },
      TR: { lat: 38.96, lng: 35.24 }, AD: { lat: 42.55, lng: 1.60 }, MC: { lat: 43.74, lng: 7.41 },
      SM: { lat: 43.94, lng: 12.46 }, LI: { lat: 47.17, lng: 9.56 }, XK: { lat: 42.60, lng: 20.90 },
    };
    const REGION_COORDS: Record<string, Record<string, { lat: number; lng: number }>> = {
      IT: {
        "Abruzzo": { lat: 42.19, lng: 13.73 }, "Basilicata": { lat: 40.64, lng: 15.97 },
        "Calabria": { lat: 38.91, lng: 16.59 }, "Campania": { lat: 40.85, lng: 14.27 },
        "Emilia-Romagna": { lat: 44.49, lng: 11.34 }, "Friuli Venezia Giulia": { lat: 46.07, lng: 13.23 },
        "Lazio": { lat: 41.90, lng: 12.50 }, "Liguria": { lat: 44.41, lng: 8.95 },
        "Lombardia": { lat: 45.46, lng: 9.19 }, "Marche": { lat: 43.62, lng: 13.52 },
        "Molise": { lat: 41.56, lng: 14.67 }, "Piemonte": { lat: 45.07, lng: 7.69 },
        "Puglia": { lat: 41.13, lng: 16.86 }, "Sardegna": { lat: 39.22, lng: 9.12 },
        "Sicilia": { lat: 37.60, lng: 14.02 }, "Toscana": { lat: 43.77, lng: 11.25 },
        "Trentino-Alto Adige": { lat: 46.07, lng: 11.13 }, "Umbria": { lat: 43.00, lng: 12.64 },
        "Valle d'Aosta": { lat: 45.74, lng: 7.32 }, "Veneto": { lat: 45.44, lng: 12.33 },
      },
      DE: {
        "Baden-Württemberg": { lat: 48.66, lng: 9.35 }, "Bayern": { lat: 48.79, lng: 11.50 },
        "Berlin": { lat: 52.52, lng: 13.40 }, "Brandenburg": { lat: 52.41, lng: 12.53 },
        "Bremen": { lat: 53.08, lng: 8.80 }, "Hamburg": { lat: 53.55, lng: 10.00 },
        "Hessen": { lat: 50.65, lng: 9.17 }, "Mecklenburg-Vorpommern": { lat: 53.61, lng: 12.43 },
        "Niedersachsen": { lat: 52.64, lng: 9.84 }, "Nordrhein-Westfalen": { lat: 51.43, lng: 7.66 },
        "Rheinland-Pfalz": { lat: 49.91, lng: 7.45 }, "Saarland": { lat: 49.40, lng: 7.02 },
        "Sachsen": { lat: 51.10, lng: 13.20 }, "Sachsen-Anhalt": { lat: 51.95, lng: 11.69 },
        "Schleswig-Holstein": { lat: 54.22, lng: 9.69 }, "Thüringen": { lat: 50.91, lng: 11.03 },
      },
      FR: {
        "Auvergne-Rhône-Alpes": { lat: 45.44, lng: 4.39 }, "Bourgogne-Franche-Comté": { lat: 47.28, lng: 4.99 },
        "Bretagne": { lat: 48.20, lng: -2.93 }, "Centre-Val de Loire": { lat: 47.75, lng: 1.67 },
        "Corse": { lat: 42.04, lng: 9.02 }, "Grand Est": { lat: 48.70, lng: 6.18 },
        "Hauts-de-France": { lat: 50.48, lng: 2.79 }, "Île-de-France": { lat: 48.85, lng: 2.35 },
        "Normandie": { lat: 49.18, lng: 0.37 }, "Nouvelle-Aquitaine": { lat: 44.83, lng: 0.58 },
        "Occitanie": { lat: 43.61, lng: 2.21 }, "Pays de la Loire": { lat: 47.76, lng: -0.33 },
        "Provence-Alpes-Côte d'Azur": { lat: 43.93, lng: 6.07 },
      },
      ES: {
        "Andalucía": { lat: 37.38, lng: -5.97 }, "Aragón": { lat: 41.65, lng: -0.88 },
        "Asturias": { lat: 43.36, lng: -5.86 }, "Baleares": { lat: 39.57, lng: 2.65 },
        "Canarias": { lat: 28.10, lng: -15.41 }, "Cantabria": { lat: 43.18, lng: -4.05 },
        "Castilla-La Mancha": { lat: 39.54, lng: -3.00 }, "Castilla y León": { lat: 41.65, lng: -4.73 },
        "Cataluña": { lat: 41.59, lng: 1.52 }, "Comunidad de Madrid": { lat: 40.42, lng: -3.70 },
        "Comunidad Valenciana": { lat: 39.48, lng: -0.75 }, "Extremadura": { lat: 39.49, lng: -6.06 },
        "Galicia": { lat: 42.58, lng: -7.89 }, "La Rioja": { lat: 42.29, lng: -2.54 },
        "Navarra": { lat: 42.82, lng: -1.65 }, "País Vasco": { lat: 43.04, lng: -2.34 },
        "Región de Murcia": { lat: 37.99, lng: -1.13 },
      },
      PT: {
        "Alentejo": { lat: 38.57, lng: -8.00 }, "Algarve": { lat: 37.20, lng: -8.20 },
        "Centro": { lat: 40.21, lng: -8.43 }, "Lisboa": { lat: 38.72, lng: -9.14 },
        "Norte": { lat: 41.55, lng: -8.43 }, "Açores": { lat: 37.74, lng: -25.67 },
        "Madeira": { lat: 32.76, lng: -16.96 },
      },
      AT: {
        "Burgenland": { lat: 47.51, lng: 16.59 }, "Kärnten": { lat: 46.73, lng: 14.30 },
        "Niederösterreich": { lat: 48.11, lng: 15.81 }, "Oberösterreich": { lat: 48.03, lng: 13.98 },
        "Salzburg": { lat: 47.63, lng: 13.13 }, "Steiermark": { lat: 47.36, lng: 15.12 },
        "Tirol": { lat: 47.26, lng: 11.39 }, "Vorarlberg": { lat: 47.26, lng: 9.92 },
        "Wien": { lat: 48.21, lng: 16.37 },
      },
      CH: {
        "Bern": { lat: 46.95, lng: 7.45 }, "Geneva": { lat: 46.20, lng: 6.15 },
        "Graubünden": { lat: 46.66, lng: 9.58 }, "Luzern": { lat: 47.05, lng: 8.31 },
        "Ticino": { lat: 46.33, lng: 8.80 }, "Valais": { lat: 46.23, lng: 7.61 },
        "Vaud": { lat: 46.57, lng: 6.52 }, "Zürich": { lat: 47.38, lng: 8.54 },
      },
      GR: {
        "Attica": { lat: 37.97, lng: 23.73 }, "Creta": { lat: 35.24, lng: 24.81 },
        "Macedonia": { lat: 40.64, lng: 22.94 }, "Tessaglia": { lat: 39.64, lng: 22.42 },
        "Peloponneso": { lat: 37.50, lng: 22.37 }, "Epiro": { lat: 39.66, lng: 20.85 },
        "Ionia": { lat: 38.90, lng: 20.69 }, "Tracia": { lat: 41.15, lng: 25.41 },
      },
      PL: {
        "Mazowieckie": { lat: 52.07, lng: 21.02 }, "Małopolskie": { lat: 49.72, lng: 20.25 },
        "Śląskie": { lat: 50.26, lng: 19.02 }, "Dolnośląskie": { lat: 51.11, lng: 17.04 },
        "Wielkopolskie": { lat: 52.41, lng: 16.93 }, "Pomorskie": { lat: 54.35, lng: 18.65 },
        "Łódź": { lat: 51.76, lng: 19.46 }, "Lubelskie": { lat: 51.25, lng: 22.57 },
      },
      RO: {
        "București": { lat: 44.43, lng: 26.10 }, "Cluj": { lat: 46.77, lng: 23.60 },
        "Timiș": { lat: 45.75, lng: 21.22 }, "Brașov": { lat: 45.65, lng: 25.61 },
        "Constanța": { lat: 44.18, lng: 28.64 }, "Iași": { lat: 47.16, lng: 27.59 },
        "Sibiu": { lat: 45.80, lng: 24.15 }, "Prahova": { lat: 45.14, lng: 25.99 },
      },
      TR: {
        "İstanbul": { lat: 41.01, lng: 28.97 }, "Ankara": { lat: 39.92, lng: 32.85 },
        "İzmir": { lat: 38.42, lng: 27.14 }, "Antalya": { lat: 36.90, lng: 30.69 },
        "Bursa": { lat: 40.19, lng: 29.06 }, "Konya": { lat: 37.87, lng: 32.49 },
        "Adana": { lat: 37.00, lng: 35.32 }, "Trabzon": { lat: 41.00, lng: 39.73 },
      },
      GB: {
        "Inghilterra": { lat: 52.35, lng: -1.17 }, "Scozia": { lat: 56.49, lng: -4.20 },
        "Galles": { lat: 52.13, lng: -3.78 }, "Irlanda del Nord": { lat: 54.61, lng: -6.69 },
      },
      SE: {
        "Stockholm": { lat: 59.33, lng: 18.07 }, "Västra Götaland": { lat: 57.71, lng: 12.01 },
        "Skåne": { lat: 55.99, lng: 13.59 }, "Uppsala": { lat: 59.86, lng: 17.64 },
        "Östergötland": { lat: 58.41, lng: 15.62 }, "Norrbotten": { lat: 66.83, lng: 20.40 },
      },
      NO: {
        "Oslo": { lat: 59.91, lng: 10.75 }, "Vestland": { lat: 60.39, lng: 5.32 },
        "Rogaland": { lat: 59.00, lng: 6.09 }, "Trøndelag": { lat: 63.43, lng: 10.39 },
        "Nordland": { lat: 67.28, lng: 14.41 }, "Troms og Finnmark": { lat: 69.66, lng: 18.96 },
      },
      FI: {
        "Uusimaa": { lat: 60.25, lng: 24.84 }, "Pirkanmaa": { lat: 61.50, lng: 23.77 },
        "Lappi": { lat: 67.73, lng: 26.60 }, "Pohjois-Pohjanmaa": { lat: 65.01, lng: 25.47 },
        "Varsinais-Suomi": { lat: 60.44, lng: 22.26 }, "Etelä-Karjala": { lat: 61.05, lng: 28.19 },
      },
      HU: {
        "Budapest": { lat: 47.50, lng: 19.04 }, "Pest": { lat: 47.45, lng: 19.48 },
        "Győr-Moson-Sopron": { lat: 47.68, lng: 17.63 }, "Hajdú-Bihar": { lat: 47.53, lng: 21.63 },
        "Borsod-Abaúj-Zemplén": { lat: 48.10, lng: 20.79 }, "Baranya": { lat: 45.99, lng: 18.23 },
      },
      CZ: {
        "Praha": { lat: 50.08, lng: 14.43 }, "Jihomoravský": { lat: 49.19, lng: 16.61 },
        "Moravskoslezský": { lat: 49.82, lng: 18.26 }, "Ústecký": { lat: 50.66, lng: 13.88 },
        "Plzeňský": { lat: 49.74, lng: 13.38 }, "Jihočeský": { lat: 49.00, lng: 14.43 },
      },
      SK: {
        "Bratislavský": { lat: 48.15, lng: 17.11 }, "Košický": { lat: 48.72, lng: 21.26 },
        "Prešovský": { lat: 49.00, lng: 21.24 }, "Banskobystrický": { lat: 48.74, lng: 19.15 },
        "Žilinský": { lat: 49.22, lng: 18.74 }, "Nitrianský": { lat: 48.31, lng: 18.08 },
      },
      BG: {
        "Sofia": { lat: 42.70, lng: 23.32 }, "Plovdiv": { lat: 42.15, lng: 24.75 },
        "Varna": { lat: 43.21, lng: 27.91 }, "Burgas": { lat: 42.51, lng: 27.47 },
        "Stara Zagora": { lat: 42.43, lng: 25.64 }, "Ruse": { lat: 43.85, lng: 25.95 },
      },
      UA: {
        "Kiev": { lat: 50.45, lng: 30.52 }, "Leopoli": { lat: 49.84, lng: 24.03 },
        "Kharkiv": { lat: 49.99, lng: 36.23 }, "Odessa": { lat: 46.49, lng: 30.73 },
        "Dnipropetrovsk": { lat: 48.47, lng: 35.05 }, "Zakarpattia": { lat: 48.62, lng: 22.30 },
        "Mykolaiv": { lat: 46.97, lng: 31.99 }, "Zaporizhzhia": { lat: 47.84, lng: 35.14 },
      },
      RS: {
        "Beograd": { lat: 44.82, lng: 20.46 }, "Vojvodina": { lat: 45.26, lng: 19.83 },
        "Šumadija": { lat: 44.02, lng: 20.81 },
      },
      HR: {
        "Grad Zagreb": { lat: 45.81, lng: 15.97 }, "Splitsko-dalmatinska": { lat: 43.51, lng: 16.44 },
        "Primorsko-goranska": { lat: 45.34, lng: 14.41 }, "Istarska": { lat: 45.23, lng: 13.90 },
        "Osječko-baranjska": { lat: 45.55, lng: 18.69 }, "Zadarska": { lat: 44.12, lng: 15.23 },
        "Dubrovačko-neretvanska": { lat: 42.65, lng: 18.09 },
      },
    };
    const regionCoordsForCountry = REGION_COORDS[country] ?? {};
    const coordsEntry = region ? (regionCoordsForCountry[region] ?? COUNTRY_CENTERS[country] ?? { lat: 41.87, lng: 12.57 }) : (COUNTRY_CENTERS[country] ?? { lat: 41.87, lng: 12.57 });
    const lat = coordsEntry.lat + (Math.random() - 0.5) * 0.5;
    const lng = coordsEntry.lng + (Math.random() - 0.5) * 0.5;
    await storage.createUserProfile({
      userId: user.id,
      isAvailable: true,
      latitude: lat,
      longitude: lng,
      bio: bio || null,
    });
    if (moto && (userType === "biker" || userType === "coppia")) {
      await storage.createUserMotorcycle({
        userId: user.id,
        brand: moto.brand || "Ducati",
        model: moto.model || "Monster",
        year: moto.year || 2022,
        displacement: moto.displacement || 821,
        motorcycleType: moto.motorcycleType || "Naked",
        ridingStyle: moto.ridingStyle || "Allegra",
      });
    }
    if (userType === "zavorrina" && wishlistDescription) {
      const wl = await storage.createOrUpdateWishlist(user.id, wishlistDescription);
      if (wishlistMotos && Array.isArray(wishlistMotos)) {
        for (const wm of wishlistMotos) {
          await storage.addWishlistMoto({
            wishlistId: wl.id,
            brand: wm.brand || null,
            model: wm.model || null,
            motorcycleType: wm.motorcycleType || null,
            ridingStyle: wm.ridingStyle || null,
          });
        }
      }
    }
    await assignFakeUserToClubs(user.id);
    const { password: _, ...safeUser } = user;
    return res.status(201).json(safeUser);
  } catch (error) {
    console.error("Admin create stregatto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/users/:id/stats", async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { pool } = await import("../db");

    const userResult = await pool.query(
      `SELECT u.id, u.nickname, u.email, u.user_type as "userType", u.role, u.status,
              u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
              u.last_logout_at as "lastLogoutAt", u.last_app_close_at as "lastAppCloseAt",
              u.ghost_mode as "ghostMode",
              u.is_fake as "isFake", u.is_primal as "isPrimal",
              up.total_km as "totalKm", up.total_rides as "totalRides",
              up.is_available as "isAvailable", up.bio,
              up.latitude, up.longitude
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const user = userResult.rows[0];

    const [proposalsResult, conversationsResult, messagesResult, adClicksResult, reportsResult, motorcyclesResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int as count FROM proposals WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int as count FROM conversation_participants WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int as count FROM messages WHERE sender_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT ac.id, camp.name as "adTitle", ac.created_at as "clickedAt"
         FROM ad_clicks ac
         LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
         WHERE ac.user_id = $1
         ORDER BY ac.created_at DESC
         LIMIT 20`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int as "filed", 
                (SELECT COUNT(*)::int FROM reports WHERE reported_user_id = $1) as "received"
         FROM reports WHERE reporter_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT brand, model, year, displacement, motorcycle_type as "motorcycleType", riding_style as "ridingStyle"
         FROM user_motorcycles WHERE user_id = $1`,
        [userId]
      ),
    ]);

    const loginHistory = await pool.query(
      `SELECT ml.action, ml.created_at as "createdAt", m.nickname as "moderatorNickname"
       FROM moderator_logs ml
       LEFT JOIN users m ON ml.moderator_id = m.id
       WHERE ml.target_id = $1
       ORDER BY ml.created_at DESC
       LIMIT 20`,
      [userId]
    );

    const { onlineTracker } = await import("../online-tracker");
    return res.json({
      user: { ...user, isOnline: onlineTracker.isOnline(userId) },
      stats: {
        proposalsCreated: proposalsResult.rows[0]?.count ?? 0,
        conversationsCount: conversationsResult.rows[0]?.count ?? 0,
        messagesSent: messagesResult.rows[0]?.count ?? 0,
        reportsFiled: reportsResult.rows[0]?.filed ?? 0,
        reportsReceived: reportsResult.rows[0]?.received ?? 0,
      },
      adClicks: adClicksResult.rows,
      motorcycles: motorcyclesResult.rows,
      moderatorLogs: loginHistory.rows,
    });
  } catch (error) {
    console.error("Admin user stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/stregatti/toggle-all", async (req: Request, res: Response) => {
  try {
    const { enabled, adminPassword } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "Il campo 'enabled' deve essere un booleano" });
    }
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }
    const admin = await storage.getUser(req.session.userId!);
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const validPassword = await bcrypt.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non valida" });
    }
    const { db } = await import("../db");
    const { users: usersTable, userProfiles } = await import("../../shared/schema");
    const { eq } = await import("drizzle-orm");
    await storage.upsertAppSetting("fake_users_enabled", enabled ? "true" : "false");
    const fakeUsers = await db.select().from(usersTable).where(eq(usersTable.isFake, true));
    const newLoginAt = enabled ? new Date() : new Date("2020-01-01");
    for (const fakeUser of fakeUsers) {
      await db.update(userProfiles).set({ isAvailable: enabled }).where(eq(userProfiles.userId, fakeUser.id));
      const userUpdate: Record<string, unknown> = { lastLoginAt: newLoginAt };
      if (enabled && !fakeUser.country) userUpdate.country = "IT";
      await db.update(usersTable).set(userUpdate as any).where(eq(usersTable.id, fakeUser.id));
    }
    return res.json({ message: `Tutti gli stregatti sono stati ${enabled ? "abilitati" : "disabilitati"}`, count: fakeUsers.length });
  } catch (error) {
    console.error("Admin toggle all stregatti error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/stregatti", async (req: Request, res: Response) => {
  console.log("[Admin] DELETE /stregatti ricevuto");
  try {
    const count = await storage.deleteAllFakeUsers();
    await storage.upsertAppSetting("skip_fake_user_seed", "true");
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_all_fake_users",
      targetType: "user",
      targetId: "",
      details: `Eliminati tutti gli stregatti (${count})`,
    });
    console.log(`[Admin] DELETE /stregatti completato: ${count} eliminati`);
    return res.json({ message: `${count} stregatti eliminati`, count });
  } catch (error) {
    console.error("[Admin] DELETE /stregatti ERRORE:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/stregatti/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await storage.deleteFakeUser(id);
    return res.json({ message: "Stregatto eliminato" });
  } catch (error) {
    console.error("Admin delete stregatto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/stregatti/:id/toggle-available", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const profile = await storage.getUserProfile(id);
    if (!profile) {
      return res.status(404).json({ message: "Profilo non trovato" });
    }
    const overrideUntil = new Date(Date.now() + 60 * 60 * 1000);
    await storage.updateUserProfile(id, {
      isAvailable: !profile.isAvailable,
      adminOverrideUntil: overrideUntil,
    } as any);
    return res.json({ isAvailable: !profile.isAvailable });
  } catch (error) {
    console.error("Admin toggle stregatto availability error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/stregatti/:id/toggle-online", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const user = await storage.getUser(id);
    if (!user || !user.isFake) {
      return res.status(404).json({ message: "Stregatto non trovato" });
    }
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const isCurrentlyOnline = user.lastLoginAt && new Date(user.lastLoginAt) >= fifteenMinutesAgo;
    const newLoginAt = isCurrentlyOnline ? new Date("2020-01-01") : new Date();
    await storage.updateUser(id, { lastLoginAt: newLoginAt } as any);
    const overrideUntil = new Date(Date.now() + 60 * 60 * 1000);
    await storage.updateUserProfile(id, { adminOverrideUntil: overrideUntil } as any);
    return res.json({ isOnline: !isCurrentlyOnline });
  } catch (error) {
    console.error("Admin toggle stregatto online error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/stregatti/:id/conversations", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const convs = await storage.getFakeUserConversations(id);
    return res.json(convs);
  } catch (error) {
    console.error("Admin get stregatto conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/stregatti/all-conversations", async (req: Request, res: Response) => {
  try {
    const fakeUsers = await db.select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(and(eq(users.isFake, true), ne(users.nickname, "BikerLink_Official")));
    let deleted = 0;
    for (const u of fakeUsers) {
      const convs = await storage.getFakeUserConversations(u.id);
      for (const conv of convs) {
        await storage.deleteConversation(String(conv.id));
        deleted++;
      }
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_all_fake_chats",
      targetType: "system",
      targetId: "all",
      details: `Eliminate globalmente ${deleted} conversazioni di ${fakeUsers.length} utenti fake`,
    });
    return res.json({ deleted, users: fakeUsers.length, message: `${deleted} conversazioni eliminate` });
  } catch (error) {
    console.error("Admin delete all fake conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/stregatti/:id/conversations", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const user = await storage.getUser(id);
    if (!user || !user.isFake) {
      return res.status(404).json({ message: "Stregatto non trovato" });
    }
    const convs = await storage.getFakeUserConversations(id);
    let deleted = 0;
    for (const conv of convs) {
      await storage.deleteConversation(String(conv.id));
      deleted++;
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_fake_user_chats",
      targetType: "user",
      targetId: id,
      details: `Eliminate ${deleted} conversazioni dell'utente fake ${user.nickname}`,
    });
    return res.json({ deleted, message: `${deleted} conversazioni eliminate` });
  } catch (error) {
    console.error("Admin delete stregatto conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/stregatti/conversations/:convId/messages", async (req: Request, res: Response) => {
  try {
    const convId = req.params.convId;
    const msgs = await storage.getMessages(convId, 200, 0);
    const result = await Promise.all(
      msgs.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender ? { id: sender.id, nickname: sender.nickname, userType: sender.userType, isFake: sender.isFake } : null,
        };
      })
    );
    return res.json(result);
  } catch (error) {
    console.error("Admin get stregatto conversation messages error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/motoclubs", async (_req: Request, res: Response) => {
  try {
    const clubs = await db.select().from(motoClubs).orderBy(desc(motoClubs.createdAt));
    if (clubs.length === 0) return res.json([]);
    const memberCounts = await db
      .select({ clubId: motoClubMembers.clubId, memberCount: count(motoClubMembers.id) })
      .from(motoClubMembers)
      .where(eq(motoClubMembers.status, "active"))
      .groupBy(motoClubMembers.clubId);
    const countMap = new Map(memberCounts.map((r) => [r.clubId, Number(r.memberCount)]));
    const result = clubs.map((c) => ({ ...c, memberCount: countMap.get(c.id) ?? 0 }));
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.delete("/motoclubs/:id", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const clubId = req.params.id;
    await db.delete(motoClubs).where(eq(motoClubs.id, clubId));
    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "delete_motoclub",
      targetType: "motoclub",
      targetId: clubId,
      details: "Club eliminato dall'admin",
    });
    return res.json({ message: "Club eliminato" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/motoclubs/requests", async (_req: Request, res: Response) => {
  try {
    const requests = await db.select().from(motoClubRequests).orderBy(desc(motoClubRequests.createdAt));
    return res.json(requests);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/motoclubs/requests/:id/approve", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const requestId = req.params.id;

    const [request] = await db.select().from(motoClubRequests).where(eq(motoClubRequests.id, requestId)).limit(1);
    if (!request) return res.status(404).json({ message: "Richiesta non trovata" });

    await db.update(motoClubRequests)
      .set({ status: "approved", reviewedBy: adminId, updatedAt: new Date() })
      .where(eq(motoClubRequests.id, requestId));

    const [newClub] = await db.insert(motoClubs).values({
      name: request.name,
      clubType: request.clubType,
      brandName: request.brandName,
      modelName: request.modelName,
      isApproved: true,
      createdBy: request.requestedBy ?? null,
      parentClubId: (request as any).parentClubId ?? null,
      latitude: (request as any).latitude ?? null,
      longitude: (request as any).longitude ?? null,
    }).returning();

    const [conv] = await db.insert(conversations).values({
      conversationType: "motoclub",
      title: `Club ${request.name}`,
    }).returning();

    await db.update(motoClubs)
      .set({ conversationId: conv.id })
      .where(eq(motoClubs.id, newClub.id));

    const inviteRadiusKm = (request as any).inviteRadiusKm as number | null;
    const inviteUserIdsJson = (request as any).inviteUserIds as string | null;
    const invitedUserIds = new Set<string>();

    if (inviteRadiusKm && (request as any).latitude != null && (request as any).longitude != null) {
      const lat = (request as any).latitude as number;
      const lng = (request as any).longitude as number;
      const nearbyUsers = await db
        .select({ userId: userProfiles.userId })
        .from(userProfiles)
        .where(
          sql`(6371 * acos(cos(radians(${lat})) * cos(radians(${userProfiles.latitude})) * cos(radians(${userProfiles.longitude}) - radians(${lng})) + sin(radians(${lat})) * sin(radians(${userProfiles.latitude})))) <= ${inviteRadiusKm}`
        )
        .limit(200);
      nearbyUsers.forEach(r => { if (r.userId !== request.requestedBy) invitedUserIds.add(r.userId); });
    }

    if (inviteUserIdsJson) {
      try {
        const ids: string[] = JSON.parse(inviteUserIdsJson);
        ids.forEach(id => { if (id !== request.requestedBy) invitedUserIds.add(id); });
      } catch {}
    }

    for (const uid of invitedUserIds) {
      try {
        await db.insert(motoClubInvites).values({ clubId: newClub.id, userId: uid, status: "pending" }).onConflictDoNothing();
        await storage.createNotification({
          userId: uid,
          title: "Sei stato invitato in un Motoclub!",
          body: `Sei invitato a unirti al club "${request.name}"`,
          notificationType: "motoclub_invite",
          referenceType: "motoclub",
          referenceId: newClub.id,
        }).catch(() => {});
      } catch {}
    }

    if (request.requestedBy) {
      try {
        await storage.createNotification({
          userId: request.requestedBy,
          title: "Motoclub approvato!",
          body: `Il tuo motoclub "${request.name}" è stato approvato e creato! Puoi trovarlo nella sezione Motoclub.`,
          notificationType: "system",
          referenceType: "motoclub",
          referenceId: newClub.id,
        });
      } catch (e) {
        console.error("[approve motoclub] notification error:", e);
      }

      await db.update(feedbackTickets)
        .set({ status: "resolved", updatedAt: new Date() })
        .where(and(
          eq(feedbackTickets.userId, request.requestedBy),
          eq(feedbackTickets.status, "open"),
          sql`${feedbackTickets.message} LIKE ${'%Request ID: ' + requestId + '%'}`
        ));
    }

    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "approve_motoclub_request",
      targetType: "motoclub_request",
      targetId: requestId,
      details: `Approvata richiesta: ${request.name} (${invitedUserIds.size} inviti inviati)`,
    });

    return res.json({ message: "Richiesta approvata", club: newClub, invitesSent: invitedUserIds.size });
  } catch (e) {
    console.error("[approve motoclub request]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/motoclubs/requests/:id/reject", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const requestId = req.params.id;
    const { note } = req.body as { note?: string };

    const [request] = await db.select().from(motoClubRequests).where(eq(motoClubRequests.id, requestId)).limit(1);

    await db.update(motoClubRequests)
      .set({ status: "rejected", reviewedBy: adminId, reviewNote: note ?? null, updatedAt: new Date() })
      .where(eq(motoClubRequests.id, requestId));

    if (request?.requestedBy) {
      try {
        const noteText = note ? ` Motivazione: ${note}` : "";
        await storage.createNotification({
          userId: request.requestedBy,
          title: "Richiesta motoclub non approvata",
          body: `La richiesta di creazione del motoclub "${request.name}" non è stata approvata.${noteText}`,
          notificationType: "system",
          referenceType: "motoclub_request",
          referenceId: requestId,
        });
      } catch (e) {
        console.error("[reject motoclub] notification error:", e);
      }
    }

    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "reject_motoclub_request",
      targetType: "motoclub_request",
      targetId: requestId,
      details: note ?? "Richiesta rifiutata",
    });

    return res.json({ message: "Richiesta rifiutata" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/motoclubs/:id", async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 50);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });

    const [{ totalCount }] = await db
      .select({ totalCount: count(motoClubMembers.id) })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active")));

    const memberships = await db
      .select({
        membershipId: motoClubMembers.id,
        userId: motoClubMembers.userId,
        role: motoClubMembers.role,
        status: motoClubMembers.status,
        joinedAt: motoClubMembers.joinedAt,
        nickname: users.nickname,
        userType: users.userType,
        avatarUrl: users.avatarUrl,
        country: users.country,
        isFake: users.isFake,
      })
      .from(motoClubMembers)
      .innerJoin(users, eq(motoClubMembers.userId, users.id))
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active")))
      .orderBy(motoClubMembers.joinedAt)
      .limit(limit)
      .offset(offset);

    const total = Number(totalCount);
    return res.json({ ...club, members: memberships, totalCount: total, hasMore: offset + limit < total });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.delete("/motoclubs/:id/members/:userId", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const { id: clubId, userId } = req.params;

    await db.delete(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.userId, userId)));

    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "remove_motoclub_member",
      targetType: "motoclub",
      targetId: clubId,
      details: `Rimosso membro ${userId} dal club ${clubId}`,
    });

    return res.json({ message: "Membro rimosso" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/motoclubs/:id/simulate-activity", async (req: Request, res: Response) => {
  try {
    const { id: clubId } = req.params;
    const { message, count = 1 } = req.body as { message?: string; count?: number };

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    if (!club.conversationId) return res.status(400).json({ message: "Il club non ha una conversazione associata" });

    const fakeMembers = await db
      .select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .innerJoin(users, eq(motoClubMembers.userId, users.id))
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active"), eq(users.isFake, true)));

    if (fakeMembers.length === 0) {
      return res.status(400).json({ message: "Nessun utente fake nel club" });
    }

    const CLUB_HASHTAGS = [
      "#touring", "#raduno", "#weekend", "#gita", "#escursione",
      "#motociclismo", "#club", "#ride", "#bikers",
    ];
    const CLUB_MESSAGES = [
      "Ciao a tutti! Qualcuno disponibile questo weekend per una gita?",
      "Ragazzi, chi viene al raduno il mese prossimo?",
      "Bella giornata per girare! Voi avete in programma qualcosa?",
      "Ho appena finito il tagliando, moto pronta per partire!",
      "Qualcuno conosce un bel percorso di montagna da fare insieme?",
      "Buonasera a tutto il club! Quando organizziamo la prossima uscita?",
      "Ho visto che il meteo questo fine settimana è ottimo, andiamo?",
      "Nuovo membro qui! Felice di far parte del club 🤙",
      "Qualcuno ha già fatto il percorso del passo sabato scorso?",
      "Per chi è interessato, sto organizzando una piccola gita domenica.",
    ];

    const safeCount = Math.min(Math.max(1, count), 10);
    const shuffledFakes = [...fakeMembers].sort(() => Math.random() - 0.5);

    for (let i = 0; i < safeCount; i++) {
      const randomFake = shuffledFakes[i % shuffledFakes.length];
      const hashtag = CLUB_HASHTAGS[Math.floor(Math.random() * CLUB_HASHTAGS.length)];
      const baseMsg = CLUB_MESSAGES[Math.floor(Math.random() * CLUB_MESSAGES.length)];
      const finalText = message?.trim() || `${hashtag} ${baseMsg}`;

      const delay = i * 1500;
      const convId = club.conversationId;
      const senderId = randomFake.userId;
      setTimeout(async () => {
        try {
          await storage.createMessage({
            conversationId: convId,
            senderId,
            messageType: "text",
            content: finalText,
            imageUrl: null,
            latitude: null,
            longitude: null,
            isFiltered: false,
          });
          await storage.updateConversationTimestamp(convId);
        } catch (e) {
          console.error("simulate-activity error:", e);
        }
      }, delay);
    }

    return res.json({ message: `Simulazione avviata: ${safeCount} messaggi in invio`, count: safeCount });
  } catch (e) {
    console.error("simulate-activity error:", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/mass-seed-fake-users", async (_req: Request, res: Response) => {
  try {
    const { getMassSeedStatus, massSeedFakeUsers } = await import("../mass-seed");
    const status = await getMassSeedStatus();
    if (status.running) {
      return res.status(409).json({ message: "Generazione già in corso", ...status });
    }
    massSeedFakeUsers().catch((err) => console.error("[mass-seed] background error:", err));
    return res.json({ started: true });
  } catch (error) {
    console.error("Admin mass seed error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/mass-seed-status", async (_req: Request, res: Response) => {
  try {
    const { getMassSeedStatus } = await import("../mass-seed");
    return res.json(await getMassSeedStatus());
  } catch (error) {
    console.error("Admin mass seed status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/force-matching", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    console.log("[Admin] Avvio force-matching richiesto dall'admin");
    const { bikerBiker: bbUser, zavarrina: zavUser } = await runMatchingForUser(adminId);
    const bbBulk = await runBikerBikerMatching();
    const zavBulk = await runWishlistMatching();
    const bikerBiker = bbUser + bbBulk;
    const zavarrina = zavUser + zavBulk;
    console.log(`[Admin] Force-matching completato: ${bikerBiker} biker-biker (${bbUser} mirati + ${bbBulk} bulk), ${zavarrina} zavarrina`);
    return res.json({ bikerBiker, zavarrina });
  } catch (error) {
    console.error("Admin force-matching error:", error);
    return res.status(500).json({ message: "Errore durante il matching" });
  }
});

router.delete("/reset-matches", async (_req: Request, res: Response) => {
  try {
    const [bb] = await db.select({ count: count() }).from(bikerBikerMatches);
    await db.delete(bikerBikerMatches);
    console.log(`[Admin] Reset biker-biker matches: eliminati ${bb?.count ?? 0} match`);
    return res.json({ deleted: Number(bb?.count ?? 0) });
  } catch (error) {
    console.error("Admin reset-matches error:", error);
    return res.status(500).json({ message: "Errore durante il reset" });
  }
});

router.get("/invitation-codes/stats", async (_req: Request, res: Response) => {
  try {
    const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users).then(r => Number(r[0]?.count ?? 0));
    const usersWithCode = await storage.countUsersWithInvitationCode();
    const codes = await storage.getInvitationCodes();
    const perCode = await Promise.all(
      codes.map(async (c) => ({
        code: c.code,
        label: c.label ?? c.code,
        count: await storage.countUsersByInvitationCode(c.code),
        isActive: c.isActive,
        currentUses: c.currentUses,
        maxUses: c.maxUses,
      }))
    );
    return res.json({ totalUsers, usersWithCode, perCode });
  } catch (error) {
    console.error("Admin invitation stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/invitation-codes", async (_req: Request, res: Response) => {
  try {
    const codes = await storage.getInvitationCodes();
    return res.json(codes);
  } catch (error) {
    console.error("Admin invitation list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/invitation-codes", async (req: Request, res: Response) => {
  try {
    const { code, label, giftMessage, maxUses, expiresAt } = req.body;
    if (!code || typeof code !== "string" || code.trim().length < 2) {
      return res.status(400).json({ message: "Codice non valido (minimo 2 caratteri)" });
    }
    const created = await storage.createInvitationCode({
      code: code.trim().toUpperCase(),
      label: label?.trim() || null,
      giftMessage: giftMessage?.trim() || null,
      createdBy: (req as any).currentUser?.id ?? null,
      maxUses: Number(maxUses) || 100,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Codice già esistente" });
    }
    console.error("Admin invitation create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/invitation-codes/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, giftMessage, maxUses, isActive, expiresAt } = req.body;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });

    const updated = await storage.updateInvitationCode(id, {
      ...(label !== undefined && { label: label?.trim() || null }),
      ...(giftMessage !== undefined && { giftMessage: giftMessage?.trim() || null }),
      ...(maxUses !== undefined && { maxUses: Number(maxUses) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : undefined }),
    });
    return res.json(updated);
  } catch (error) {
    console.error("Admin invitation update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/invitation-codes/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });
    await storage.deleteInvitationCode(id);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Admin invitation delete error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/invitation-codes/:id/image", inviteCodeUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });
    if (!req.file) return res.status(400).json({ message: "Nessuna immagine caricata" });
    const imageUrl = `/uploads/invitation-codes/${req.file.filename}`;
    const updated = await storage.updateInvitationCode(id, { imageUrl });
    return res.json(updated);
  } catch (error) {
    console.error("Admin invitation image upload error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/email-status", async (_req: Request, res: Response) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const hasDbCreds = !!(userSetting?.value && passSetting?.value);
    const hasEnvCreds = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    const configured = hasDbCreds || hasEnvCreds;
    const maskedEmail = hasDbCreds
      ? userSetting!.value!.replace(/(.{2}).*(@.*)/, "$1***$2")
      : hasEnvCreds
      ? process.env.GMAIL_USER!.replace(/(.{2}).*(@.*)/, "$1***$2")
      : null;
    return res.json({ configured, maskedEmail });
  } catch (error) {
    console.error("Admin email status error:", error);
    return res.status(500).json({ configured: false, maskedEmail: null });
  }
});

router.get("/db-stats", async (_req: Request, res: Response) => {
  try {
    const {
      users: usersTable,
      userProfiles,
      conversations,
      messages,
      motoClubs,
      motoClubMembers,
      motoClubRequests,
      workshops,
      reports,
      invitationCodes,
      proposals,
      userMotorcycles,
      easterEggs,
      collectedEasterEggs,
      adCampaigns,
      moderatorLogs,
      notifications,
      routes,
      feedbackTickets,
    } = await import("../../shared/schema");
    const { count: countFn, desc: descFn } = await import("drizzle-orm");

    const [
      [usersCount],
      usersRecent,
      [userProfilesCount],
      userProfilesRecent,
      [conversationsCount],
      conversationsRecent,
      [messagesCount],
      messagesRecent,
      [motoClubsCount],
      motoClubsRecent,
      [motoClubMembersCount],
      motoClubMembersRecent,
      [motoClubRequestsCount],
      motoClubRequestsRecent,
      [workshopsCount],
      workshopsRecent,
      [reportsCount],
      reportsRecent,
      [invitationCodesCount],
      invitationCodesRecent,
      [proposalsCount],
      proposalsRecent,
      [userMotorcyclesCount],
      userMotorcyclesRecent,
      [easterEggsCount],
      easterEggsRecent,
      [collectedEasterEggsCount],
      collectedEasterEggsRecent,
      [adCampaignsCount],
      adCampaignsRecent,
      [moderatorLogsCount],
      moderatorLogsRecent,
      [notificationsCount],
      notificationsRecent,
      [routesCount],
      routesRecent,
      [feedbackTicketsCount],
      feedbackTicketsRecent,
    ] = await Promise.all([
      db.select({ total: countFn() }).from(usersTable),
      db.select({ id: usersTable.id, createdAt: usersTable.createdAt, label: usersTable.nickname, email: usersTable.email, role: usersTable.role, status: usersTable.status }).from(usersTable).orderBy(descFn(usersTable.createdAt)).limit(5),
      db.select({ total: countFn() }).from(userProfiles),
      db.select({ id: userProfiles.id, createdAt: userProfiles.updatedAt, label: userProfiles.userId }).from(userProfiles).orderBy(descFn(userProfiles.updatedAt)).limit(5),
      db.select({ total: countFn() }).from(conversations),
      db.select({ id: conversations.id, createdAt: conversations.createdAt, label: conversations.title, conversationType: conversations.conversationType }).from(conversations).orderBy(descFn(conversations.createdAt)).limit(5),
      db.select({ total: countFn() }).from(messages),
      db.select({ id: messages.id, createdAt: messages.createdAt, label: messages.content, messageType: messages.messageType }).from(messages).orderBy(descFn(messages.createdAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubs),
      db.select({ id: motoClubs.id, createdAt: motoClubs.createdAt, label: motoClubs.name, clubType: motoClubs.clubType, isApproved: motoClubs.isApproved }).from(motoClubs).orderBy(descFn(motoClubs.createdAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubMembers),
      db.select({ id: motoClubMembers.id, createdAt: motoClubMembers.joinedAt, label: motoClubMembers.userId, clubId: motoClubMembers.clubId, role: motoClubMembers.role }).from(motoClubMembers).orderBy(descFn(motoClubMembers.joinedAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubRequests),
      db.select({ id: motoClubRequests.id, createdAt: motoClubRequests.createdAt, label: motoClubRequests.name, status: motoClubRequests.status }).from(motoClubRequests).orderBy(descFn(motoClubRequests.createdAt)).limit(5),
      db.select({ total: countFn() }).from(workshops),
      db.select({ id: workshops.id, createdAt: workshops.createdAt, label: workshops.name, isApproved: workshops.isApproved }).from(workshops).orderBy(descFn(workshops.createdAt)).limit(5),
      db.select({ total: countFn() }).from(reports),
      db.select({ id: reports.id, createdAt: reports.createdAt, label: reports.reason, status: reports.status }).from(reports).orderBy(descFn(reports.createdAt)).limit(5),
      db.select({ total: countFn() }).from(invitationCodes),
      db.select({ id: invitationCodes.id, createdAt: invitationCodes.createdAt, label: invitationCodes.code, isActive: invitationCodes.isActive }).from(invitationCodes).orderBy(descFn(invitationCodes.createdAt)).limit(5),
      db.select({ total: countFn() }).from(proposals),
      db.select({ id: proposals.id, createdAt: proposals.createdAt, label: proposals.title, status: proposals.status }).from(proposals).orderBy(descFn(proposals.createdAt)).limit(5),
      db.select({ total: countFn() }).from(userMotorcycles),
      db.select({ id: userMotorcycles.id, createdAt: userMotorcycles.createdAt, label: userMotorcycles.brand, model: userMotorcycles.model }).from(userMotorcycles).orderBy(descFn(userMotorcycles.createdAt)).limit(5),
      db.select({ total: countFn() }).from(easterEggs),
      db.select({ id: easterEggs.id, createdAt: easterEggs.createdAt, label: easterEggs.name, isActive: easterEggs.isActive }).from(easterEggs).orderBy(descFn(easterEggs.createdAt)).limit(5),
      db.select({ total: countFn() }).from(collectedEasterEggs),
      db.select({ id: collectedEasterEggs.id, createdAt: collectedEasterEggs.collectedAt, label: collectedEasterEggs.easterEggId, userId: collectedEasterEggs.userId }).from(collectedEasterEggs).orderBy(descFn(collectedEasterEggs.collectedAt)).limit(5),
      db.select({ total: countFn() }).from(adCampaigns),
      db.select({ id: adCampaigns.id, createdAt: adCampaigns.createdAt, label: adCampaigns.name, isActive: adCampaigns.isActive }).from(adCampaigns).orderBy(descFn(adCampaigns.createdAt)).limit(5),
      db.select({ total: countFn() }).from(moderatorLogs),
      db.select({ id: moderatorLogs.id, createdAt: moderatorLogs.createdAt, label: moderatorLogs.action, targetType: moderatorLogs.targetType }).from(moderatorLogs).orderBy(descFn(moderatorLogs.createdAt)).limit(5),
      db.select({ total: countFn() }).from(notifications),
      db.select({ id: notifications.id, createdAt: notifications.createdAt, label: notifications.title, notificationType: notifications.notificationType }).from(notifications).orderBy(descFn(notifications.createdAt)).limit(5),
      db.select({ total: countFn() }).from(routes),
      db.select({ id: routes.id, createdAt: routes.createdAt, label: routes.title, status: routes.status }).from(routes).orderBy(descFn(routes.createdAt)).limit(5),
      db.select({ total: countFn() }).from(feedbackTickets),
      db.select({ id: feedbackTickets.id, createdAt: feedbackTickets.createdAt, label: feedbackTickets.subject, status: feedbackTickets.status, ticketType: feedbackTickets.ticketType }).from(feedbackTickets).orderBy(descFn(feedbackTickets.createdAt)).limit(5),
    ]);

    return res.json({
      tables: [
        { name: "users", label: "Utenti", total: Number(usersCount?.total ?? 0), recent: usersRecent },
        { name: "userProfiles", label: "Profili Utente", total: Number(userProfilesCount?.total ?? 0), recent: userProfilesRecent },
        { name: "conversations", label: "Conversazioni", total: Number(conversationsCount?.total ?? 0), recent: conversationsRecent },
        { name: "messages", label: "Messaggi", total: Number(messagesCount?.total ?? 0), recent: messagesRecent },
        { name: "motoClubs", label: "Motoclub", total: Number(motoClubsCount?.total ?? 0), recent: motoClubsRecent },
        { name: "motoClubMembers", label: "Membri Motoclub", total: Number(motoClubMembersCount?.total ?? 0), recent: motoClubMembersRecent },
        { name: "motoClubRequests", label: "Richieste Motoclub", total: Number(motoClubRequestsCount?.total ?? 0), recent: motoClubRequestsRecent },
        { name: "workshops", label: "Officine", total: Number(workshopsCount?.total ?? 0), recent: workshopsRecent },
        { name: "reports", label: "Segnalazioni", total: Number(reportsCount?.total ?? 0), recent: reportsRecent },
        { name: "invitationCodes", label: "Codici Invito", total: Number(invitationCodesCount?.total ?? 0), recent: invitationCodesRecent },
        { name: "proposals", label: "Proposte", total: Number(proposalsCount?.total ?? 0), recent: proposalsRecent },
        { name: "userMotorcycles", label: "Moto Utenti", total: Number(userMotorcyclesCount?.total ?? 0), recent: userMotorcyclesRecent },
        { name: "easterEggs", label: "Easter Eggs", total: Number(easterEggsCount?.total ?? 0), recent: easterEggsRecent },
        { name: "collectedEasterEggs", label: "Easter Eggs Raccolti", total: Number(collectedEasterEggsCount?.total ?? 0), recent: collectedEasterEggsRecent },
        { name: "adCampaigns", label: "Campagne Ad", total: Number(adCampaignsCount?.total ?? 0), recent: adCampaignsRecent },
        { name: "moderatorLogs", label: "Log Moderatori", total: Number(moderatorLogsCount?.total ?? 0), recent: moderatorLogsRecent },
        { name: "notifications", label: "Notifiche", total: Number(notificationsCount?.total ?? 0), recent: notificationsRecent },
        { name: "routes", label: "Percorsi", total: Number(routesCount?.total ?? 0), recent: routesRecent },
        { name: "feedbackTickets", label: "Feedback Ticket", total: Number(feedbackTicketsCount?.total ?? 0), recent: feedbackTicketsRecent },
      ],
    });
  } catch (error) {
    console.error("Admin db-stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/stregatti/wake-all", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const fakeUserIds = db.select({ id: users.id }).from(users).where(eq(users.isFake, true));
    await db.update(users)
      .set({ lastLoginAt: now })
      .where(eq(users.isFake, true));
    await db.update(users)
      .set({ country: "IT" })
      .where(and(eq(users.isFake, true), or(isNull(users.country), eq(users.country, ""))));
    await db.update(userProfiles)
      .set({ isAvailable: true })
      .where(inArray(userProfiles.userId, fakeUserIds));
    const [{ cnt }] = await db.select({ cnt: sql<number>`cast(count(*) as int)` }).from(users).where(eq(users.isFake, true));
    return res.json({ ok: true, count: cnt });
  } catch (error) {
    console.error("Admin wake-all stregatti error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/stregatti/distribute-to-clubs", async (_req: Request, res: Response) => {
  try {
    const [fakeUsers, approvedClubs] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.isFake, true)),
      db.select({ id: motoClubs.id }).from(motoClubs).where(eq(motoClubs.isApproved, true)),
    ]);
    if (approvedClubs.length === 0) {
      return res.json({ ok: true, usersProcessed: fakeUsers.length, assigned: 0, skipped: 0, failed: 0 });
    }
    const rows: { clubId: string; userId: string; role: string; status: string }[] = [];
    for (const fu of fakeUsers) {
      const pickCount = Math.min(1 + Math.floor(Math.random() * 3), approvedClubs.length);
      const shuffled = [...approvedClubs].sort(() => Math.random() - 0.5).slice(0, pickCount);
      for (const club of shuffled) {
        rows.push({ clubId: club.id, userId: fu.id, role: "member", status: "active" });
      }
    }
    let assigned = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const result = await db.insert(motoClubMembers)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: motoClubMembers.id });
      assigned += result.length;
      await new Promise(r => setTimeout(r, 0));
    }
    const skipped = rows.length - assigned;
    return res.json({ ok: true, usersProcessed: fakeUsers.length, assigned, skipped, failed: 0 });
  } catch (error) {
    console.error("Admin distribute-to-clubs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/backup/status", async (_req: Request, res: Response) => {
  try {
    const { getBackupStatus } = await import("../backup-service");
    return res.json(await getBackupStatus());
  } catch (error) {
    console.error("Admin backup status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/backup/db", async (_req: Request, res: Response) => {
  try {
    const { backupDatabase } = await import("../backup-service");
    const result = await backupDatabase();
    await storage.createModeratorLog({
      moderatorId: (_req as any).currentUser?.id || "system",
      action: "backup_db",
      targetType: "system",
      targetId: result.name.slice(0, 36),
      details: `Backup DB su Drive: ${result.name} (${result.size} bytes)`,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Admin backup db error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il backup del database" });
  }
});

router.post("/backup/media", async (_req: Request, res: Response) => {
  try {
    const { backupMedia } = await import("../backup-service");
    const result = await backupMedia();
    await storage.createModeratorLog({
      moderatorId: (_req as any).currentUser?.id || "system",
      action: "backup_media",
      targetType: "system",
      targetId: result.name.slice(0, 36),
      details: `Backup media su Drive: ${result.name} (${result.size} bytes)`,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Admin backup media error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il backup dei media" });
  }
});

router.put("/backup/schedule", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled deve essere un booleano" });
    }
    const { setAutoBackupEnabled } = await import("../backup-service");
    await setAutoBackupEnabled(enabled);
    return res.json({ ok: true, enabled });
  } catch (error: any) {
    console.error("Admin backup schedule error:", error);
    return res.status(500).json({ message: error.message || "Errore durante la configurazione del backup" });
  }
});

router.get("/backup/drive-folder", (_req: Request, res: Response) => {
  return res.json({ folder: null });
});

router.post("/backup/drive-folder", (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

router.get("/backup/frequency", async (_req: Request, res: Response) => {
  try {
    const { getBackupFrequency } = await import("../backup-service");
    return res.json(await getBackupFrequency());
  } catch (error) {
    console.error("Admin backup frequency GET error:", error);
    return res.status(500).json({ message: "Errore nel recupero della frequenza" });
  }
});

router.post("/backup/frequency", async (req: Request, res: Response) => {
  try {
    const { dbHours, mediaHours } = req.body as { dbHours?: unknown; mediaHours?: unknown };
    const parsed: { dbHours?: number; mediaHours?: number } = {};
    if (dbHours !== undefined) {
      const n = Number(dbHours);
      if (!Number.isFinite(n) || n < 1) {
        return res.status(400).json({ message: "dbHours deve essere un numero intero >= 1" });
      }
      parsed.dbHours = Math.floor(n);
    }
    if (mediaHours !== undefined) {
      const n = Number(mediaHours);
      if (!Number.isFinite(n) || n < 1) {
        return res.status(400).json({ message: "mediaHours deve essere un numero intero >= 1" });
      }
      parsed.mediaHours = Math.floor(n);
    }
    const { setBackupFrequency } = await import("../backup-service");
    const result = await setBackupFrequency(parsed);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("Admin backup frequency POST error:", error);
    return res.status(500).json({ message: "Errore nel salvataggio della frequenza" });
  }
});

router.post("/reconcile-club-invites", async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId || req.session.userId!;
    const userMotos = await db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, userId));

    if (userMotos.length === 0) {
      return res.json({ motorsChecked: 0, pendingInvites: 0, message: "Nessuna moto nel garage" });
    }

    for (const moto of userMotos) {
      await createClubInvitesForMoto(userId, moto.brand, moto.model);
    }

    const invites = await db.select()
      .from(motoClubInvites)
      .where(and(eq(motoClubInvites.userId, userId), eq(motoClubInvites.status, "pending")));

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "reconcile_club_invites",
      targetType: "user",
      targetId: userId,
      details: `Riconciliati inviti club per ${userMotos.length} moto, ${invites.length} inviti pending`,
    });

    return res.json({
      motorsChecked: userMotos.length,
      pendingInvites: invites.length,
      message: invites.length > 0
        ? `${invites.length} inviti club pending per ${userMotos.length} moto`
        : "Tutti gli inviti club già presenti o accettati",
    });
  } catch (error) {
    console.error("Reconcile club invites error:", error);
    return res.status(500).json({ message: "Errore durante la riconciliazione inviti" });
  }
});

router.post("/reconcile-fake-moto", async (req: Request, res: Response) => {
  try {
    const fakeUsersWithoutMoto = await db.select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.isFake, true),
          sql`${users.userType} IN ('biker', 'coppia')`,
          notExists(
            db.select({ id: userMotorcycles.id })
              .from(userMotorcycles)
              .where(eq(userMotorcycles.userId, users.id))
          )
        )
      );

    let reconciledCount = 0;
    const BATCH_SIZE = 50;

    if (fakeUsersWithoutMoto.length > 0) {
      for (let i = 0; i < fakeUsersWithoutMoto.length; i += BATCH_SIZE) {
        const batch = fakeUsersWithoutMoto.slice(i, i + BATCH_SIZE);
        const motoRows: {
          userId: string;
          brand: string;
          model: string;
          year: number;
          displacement: number;
          motorcycleType: string;
          ridingStyle: string;
        }[] = [];

        for (const u of batch) {
          const motos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          for (const moto of motos) {
            motoRows.push({
              userId: u.id,
              brand: moto.brand,
              model: moto.model,
              year: getMotoYear(),
              displacement: moto.displacement,
              motorcycleType: moto.type,
              ridingStyle: moto.style,
            });
          }
          reconciledCount++;
        }

        if (motoRows.length > 0) {
          await db.insert(userMotorcycles).values(motoRows).onConflictDoNothing();
        }
      }
      console.log(`[ReconcileFakeMoto] Riconciliati ${reconciledCount} utenti fake senza moto`);
    }

    const allFakeBikers = await db.select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.isFake, true),
          sql`${users.userType} IN ('biker', 'coppia')`
        )
      );

    let clubJoins = 0;
    const brandClubsCache = new Map<string, { id: string; name: string }[]>();

    for (let i = 0; i < allFakeBikers.length; i += BATCH_SIZE) {
      const batch = allFakeBikers.slice(i, i + BATCH_SIZE);
      for (const u of batch) {
        const userMotos = await db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, u.id));
        const seenClubIds = new Set<string>();
        for (const moto of userMotos) {
          const brandKey = moto.brand.toLowerCase();
          if (!brandClubsCache.has(brandKey)) {
            const clubs = await db.select({ id: motoClubs.id, name: motoClubs.name })
              .from(motoClubs)
              .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "brand"), ilike(motoClubs.brandName!, moto.brand)));
            brandClubsCache.set(brandKey, clubs);
          }
          const clubs = brandClubsCache.get(brandKey) || [];
          for (const club of clubs) {
            if (seenClubIds.has(club.id)) continue;
            seenClubIds.add(club.id);
            const result = await db.insert(motoClubMembers).values({
              clubId: club.id,
              userId: u.id,
              role: "member",
              status: "active",
            }).onConflictDoNothing().returning({ id: motoClubMembers.id });
            if (result.length > 0) clubJoins++;
          }
        }
      }
    }

    console.log(`[ReconcileFakeMoto] Auto-join brand clubs: ${clubJoins} for ${allFakeBikers.length} fake bikers`);

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "reconcile_fake_moto",
      targetType: "system",
      targetId: "matching",
      details: `Moto: ${reconciledCount} nuove, Club: ${clubJoins} iscrizioni brand (${allFakeBikers.length} fake)`,
    });

    return res.json({
      reconciled: reconciledCount,
      clubJoins,
      fakeBikersProcessed: allFakeBikers.length,
      message: `Moto inserite per ${reconciledCount} fake biker, ${clubJoins} iscrizioni brand club (${allFakeBikers.length} fake processati)`,
    });
  } catch (error) {
    console.error("Reconcile fake moto error:", error);
    return res.status(500).json({ message: "Errore durante il reconcile" });
  }
});

router.get("/matching-stats", async (_req: Request, res: Response) => {
  try {
    const [totalMotoResult, zavarrinaMatchResult, bikerBikerMatchResult] = await Promise.all([
      db.select({ count: count() }).from(userMotorcycles),
      db.select({ count: count() }).from(bikerZavarrinaMatches),
      db.select({ count: count() }).from(bikerBikerMatches),
    ]);

    const totalMotorcycles = Number(totalMotoResult[0]?.count ?? 0);
    const totalZavarrinaMatches = Number(zavarrinaMatchResult[0]?.count ?? 0);
    const totalBikerBikerMatches = Number(bikerBikerMatchResult[0]?.count ?? 0);

    const fakeBikersWithoutMoto = await db.select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.isFake, true),
          sql`${users.userType} IN ('biker', 'coppia')`,
          notExists(
            db.select({ id: userMotorcycles.id })
              .from(userMotorcycles)
              .where(eq(userMotorcycles.userId, users.id))
          )
        )
      );

    const lastCycle = getLastMatchingCycleMeta();

    return res.json({
      totalMotorcycles,
      totalZavarrinaMatches,
      totalBikerBikerMatches,
      fakeBikersWithoutMoto: fakeBikersWithoutMoto.length,
      lastCycle,
    });
  } catch (error) {
    console.error("Matching stats error:", error);
    return res.status(500).json({ message: "Errore durante il recupero delle statistiche" });
  }
});

router.get("/restart-history", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(serverRestarts)
      .orderBy(desc(serverRestarts.startedAt));
    return res.json({ total: rows.length, restarts: rows });
  } catch (error) {
    console.error("Admin restart-history error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/system-health", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const backendUptimeSec = Math.floor((now - SERVER_START_TIME) / 1000);
    const metroUptimeSec = uptimeState.metroOnline && uptimeState.metroStartTime > 0
      ? Math.floor((now - uptimeState.metroStartTime) / 1000)
      : 0;

    const LOGS_DIR = path.resolve(process.cwd(), "logs");
    const UPTIME_LOG = path.join(LOGS_DIR, "uptime-resets.log");

    let events: { timestamp: string; message: string; type: string }[] = [];
    if (fs.existsSync(UPTIME_LOG)) {
      const raw = fs.readFileSync(UPTIME_LOG, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      const last50 = lines.slice(-50);
      events = last50.reverse().map((line) => {
        const spaceIdx = line.indexOf(" ");
        const ts = spaceIdx !== -1 ? line.substring(0, spaceIdx) : "";
        const msg = spaceIdx !== -1 ? line.substring(spaceIdx + 1) : line;
        let type = "OTHER";
        if (msg.includes("BACKEND RESTART")) type = "BACKEND_RESTART";
        else if (msg.includes("BACKEND UP") && msg.includes("cold start")) type = "COLD_START";
        else if (msg.includes("METRO UP")) type = "METRO_UP";
        else if (msg.includes("METRO DOWN")) type = "METRO_DOWN";
        return { timestamp: ts, message: msg, type };
      });
    }

    return res.json({
      backendStartedAt: SERVER_START_TIME,
      backendUptimeSec,
      metroOnline: uptimeState.metroOnline,
      metroStartedAt: uptimeState.metroStartTime,
      metroUptimeSec,
      events,
      otaErrors: otaErrors.slice().reverse(),
    });
  } catch (error) {
    console.error("Admin system-health error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

const otaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/ota/upload", otaUpload.single("bundle"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "File bundle mancante" });
    const version = (req.query.version as string) || "unknown";
    const filename = `ota-${version}-${Date.now()}.js`;
    const objectPath = `private/ota/${filename}`;
    await uploadBuffer(objectPath, req.file.buffer, "application/javascript");
    return res.json({ url: objectPath, filename });
  } catch (error) {
    console.error("[OTA] Upload error:", error);
    return res.status(500).json({ message: "Errore upload bundle" });
  }
});

router.post("/ota", async (req: Request, res: Response) => {
  try {
    const { version, bundlePath, releaseNotes } = req.body;
    if (!version || !bundlePath) return res.status(400).json({ message: "version e bundlePath obbligatori" });
    const result = await db.execute(sql`
      INSERT INTO ota_releases (version, bundle_path, release_notes, status, created_by)
      VALUES (${version}, ${bundlePath}, ${releaseNotes || null}, 'draft', ${req.session.userId!})
      RETURNING *
    `);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[OTA] Create error:", error);
    return res.status(500).json({ message: "Errore creazione release" });
  }
});

router.post("/ota/:id/publish", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.execute(sql`UPDATE ota_releases SET status = 'inactive', updated_at = NOW() WHERE status = 'active'`);
    const result = await db.execute(sql`
      UPDATE ota_releases
      SET status = 'active', published_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    if (!result.rows.length) return res.status(404).json({ message: "Release non trovata" });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[OTA] Publish error:", error);
    return res.status(500).json({ message: "Errore pubblicazione release" });
  }
});

router.get("/ota", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`SELECT * FROM ota_releases ORDER BY created_at DESC LIMIT 20`);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura releases" });
  }
});


const TRANSLATIONS_STAGING: {
  keyMap: Record<string, { position: string; it: string }>;
  importedData: Record<string, Record<string, string>>;
  exportedFileId: string | null;
  exportedLangs: string[];
} = {
  keyMap: {},
  importedData: {},
  exportedFileId: null,
  exportedLangs: [],
};

const ALLOWED_LANGS = new Set(["en", "de", "es", "fr", "tr"]);

const LANG_FILE_MAP: Record<string, string> = {
  en: path.resolve(process.cwd(), "lib/i18n/en.ts"),
  de: path.resolve(process.cwd(), "lib/i18n/de.ts"),
  es: path.resolve(process.cwd(), "lib/i18n/es.ts"),
  fr: path.resolve(process.cwd(), "lib/i18n/fr.ts"),
  tr: path.resolve(process.cwd(), "lib/i18n/tr.ts"),
};

const LANG_LABELS: Record<string, string> = {
  en: "Inglese (EN)",
  de: "Tedesco (DE)",
  es: "Spagnolo (ES)",
  fr: "Francese (FR)",
  tr: "Turco (TR)",
};

function buildKeyPositionLabel(key: string): string {
  const parts = key.split(".");
  const prefix = parts[0];
  const rest = parts.slice(1).join(".");

  const prefixMap: Record<string, string> = {
    app: "App",
    auth: "Autenticazione",
    register: "Registrazione",
    tabs: "Tab navigazione",
    map: "Schermata Mappa",
    proposals: "Proposte",
    chat: "Chat",
    contest: "Contest Foto",
    profile: "Profilo",
    tracking: "Tracking GPS",
    workshops: "Officine",
    easterEggs: "Easter Eggs",
    notifications: "Notifiche",
    feedback: "Feedback",
    admin: "Pannello Admin",
    report: "Segnalazione",
    common: "Comune",
    validation: "Validazione form",
    syneco: "Syneco",
    language: "Lingua",
    userType: "Tipo utente",
    match: "Match",
    garage: "Garage",
    home: "Home",
    ride: "Ride",
  };

  const sectionLabel = prefixMap[prefix] || prefix;
  const fieldLabel = rest
    .replace(/\./g, " → ")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();

  return `${sectionLabel} → ${fieldLabel || key}`;
}

router.post("/translations/prepare", async (_req: Request, res: Response) => {
  try {
    const itPath = path.resolve(process.cwd(), "lib/i18n/it.ts");
    const raw = fs.readFileSync(itPath, "utf-8");

    const keyMap: Record<string, { position: string; it: string }> = {};
    const lineRegex = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/;

    for (const line of raw.split("\n")) {
      const match = line.match(lineRegex);
      if (match) {
        const key = match[1];
        const itText = match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        keyMap[key] = {
          position: buildKeyPositionLabel(key),
          it: itText,
        };
      }
    }

    TRANSLATIONS_STAGING.keyMap = keyMap;
    TRANSLATIONS_STAGING.importedData = {};

    const totalKeys = Object.keys(keyMap).length;
    const langCounts: Record<string, number> = {};
    for (const lang of Array.from(ALLOWED_LANGS)) {
      try {
        const existing = fs.readFileSync(LANG_FILE_MAP[lang], "utf-8");
        const kvRegex = /^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)+)"\s*,?\s*$/gm;
        let count = 0;
        let m: RegExpExecArray | null;
        while ((m = kvRegex.exec(existing)) !== null) {
          if (m[2].trim()) count++;
        }
        langCounts[lang] = count;
      } catch {
        langCounts[lang] = 0;
      }
    }

    return res.json({
      count: totalKeys,
      langCounts,
      message: `${totalKeys} stringhe trovate nel file IT`,
    });
  } catch (error) {
    console.error("[translations/prepare] error:", error);
    return res.status(500).json({ message: "Errore durante la preparazione" });
  }
});

router.post("/translations/export", async (req: Request, res: Response) => {
  try {
    const { langs } = req.body as { langs: string[] };
    if (!langs || !Array.isArray(langs) || langs.length === 0) {
      return res.status(400).json({ message: "Seleziona almeno una lingua" });
    }
    const invalidLangsExport = langs.filter((l) => !ALLOWED_LANGS.has(l));
    if (invalidLangsExport.length > 0) {
      return res.status(400).json({ message: `Lingue non valide: ${invalidLangsExport.join(", ")}` });
    }

    const { keyMap } = TRANSLATIONS_STAGING;
    if (Object.keys(keyMap).length === 0) {
      return res.status(400).json({ message: "Esegui prima 'Prepara generazione'" });
    }

    const spreadsheetTitle = `BikerLink Traduzioni ${new Date().toISOString().slice(0, 10)}`;

    const csvHeaders = ["Chiave", "Posizione nell'app", "IT (fonte)", ...langs.map((l) => l.toUpperCase())];
    const csvRows = Object.entries(keyMap).map(([key, val]) => {
      const row: string[] = [key, val.position, val.it];
      for (const _ of langs) {
        row.push("");
      }
      return row;
    });

    function csvEscape(value: string): string {
      if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
        return '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    }

    const csvLines = [csvHeaders, ...csvRows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    const drive = getDriveClient();

    if (TRANSLATIONS_STAGING.exportedFileId) {
      try {
        await drive.files.delete({ fileId: TRANSLATIONS_STAGING.exportedFileId, supportsAllDrives: true });
        console.log(`[translations/export] Vecchio file Drive eliminato: ${TRANSLATIONS_STAGING.exportedFileId}`);
      } catch (delErr: any) {
        console.warn(`[translations/export] Impossibile eliminare vecchio file ${TRANSLATIONS_STAGING.exportedFileId}:`, delErr?.message);
      }
      TRANSLATIONS_STAGING.exportedFileId = null;
    }

    let createResp: Awaited<ReturnType<typeof drive.files.create>>;
    try {
      createResp = await drive.files.create({
        requestBody: {
          name: spreadsheetTitle,
          mimeType: "application/vnd.google-apps.spreadsheet",
          parents: [DRIVE_FOLDER_TRADUZIONI_ID],
        },
        media: {
          mimeType: "text/csv",
          body: csvLines,
        },
        fields: "id,name",
      });
    } catch (createErr: any) {
      console.error("[translations/export] Drive create error — code:", createErr?.code, "errors:", JSON.stringify(createErr?.errors ?? []));
      const isQuota =
        createErr?.errors?.some((e: any) => e.reason === "storageQuotaExceeded") ||
        createErr?.message?.toLowerCase().includes("quota");
      if (isQuota) {
        return res.status(507).json({
          message: "Quota Drive esaurita. Vai in Admin → Traduzioni → 'Pulisci file Drive' per liberare spazio.",
        });
      }
      const isPermission =
        createErr?.errors?.some((e: any) =>
          ["forbidden", "insufficientPermissions", "notFound"].includes(e.reason)
        ) ||
        createErr?.code === 403;
      if (isPermission) {
        return res.status(403).json({
          message: "Il Service Account non ha permessi di scrittura sulla cartella Drive. Condividi la cartella con l'email del SA come Editor.",
        });
      }
      throw createErr;
    }

    if (!createResp.data.id) {
      console.error("[translations/export] Drive create error: no id in response");
      return res.status(500).json({ message: "Errore nella creazione del Google Sheet" });
    }

    const driveFile = { id: createResp.data.id!, name: createResp.data.name ?? spreadsheetTitle };

    TRANSLATIONS_STAGING.exportedFileId = driveFile.id;
    TRANSLATIONS_STAGING.exportedLangs = langs;

    return res.json({
      fileId: driveFile.id,
      fileUrl: `https://docs.google.com/spreadsheets/d/${driveFile.id}/edit`,
      langs,
      message: `Sheet creato con ${Object.keys(keyMap).length} stringhe e colonne: ${langs.join(", ")}`,
    });
  } catch (error) {
    console.error("[translations/export] error:", error);
    return res.status(500).json({ message: "Errore durante l'esportazione" });
  }
});

router.get("/translations/download-csv", async (req: Request, res: Response) => {
  try {
    const langsParam = ((req.query.langs as string) || "").trim();
    const langs = langsParam
      ? langsParam.split(",").filter((l) => ALLOWED_LANGS.has(l.trim())).map((l) => l.trim())
      : Array.from(ALLOWED_LANGS);

    const itPath = path.resolve(process.cwd(), "lib/i18n/it.ts");
    const raw = fs.readFileSync(itPath, "utf-8");

    const keyMap: Record<string, { position: string; it: string }> = {};
    const lineRegex = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/;
    for (const line of raw.split("\n")) {
      const match = line.match(lineRegex);
      if (match) {
        const key = match[1];
        const itText = match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        keyMap[key] = { position: buildKeyPositionLabel(key), it: itText };
      }
    }

    function csvEscape(value: string): string {
      if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
        return '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    }

    const csvHeaders = ["Chiave", "Posizione nell'app", "IT (fonte)", ...langs.map((l) => l.toUpperCase())];
    const csvRows = Object.entries(keyMap).map(([key, val]) => {
      const row: string[] = [key, val.position, val.it];
      for (const _l of langs) row.push("");
      return row;
    });

    const csvContent =
      "\uFEFF" +
      [csvHeaders, ...csvRows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\r\n");

    const filename = `BikerLink_Traduzioni_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error) {
    console.error("[translations/download-csv] error:", error);
    return res.status(500).json({ message: "Errore durante il download CSV" });
  }
});

function getImportInfo() {
  return {
    exportedFileId: TRANSLATIONS_STAGING.exportedFileId,
    exportedLangs: TRANSLATIONS_STAGING.exportedLangs,
  };
}

router.get("/translations/import-info", (_req: Request, res: Response) => {
  return res.json(getImportInfo());
});

router.get("/translations/import", (_req: Request, res: Response) => {
  return res.json(getImportInfo());
});

router.get("/translations/browse", async (req: Request, res: Response) => {
  try {
    const folderId = (req.query.folderId as string | undefined)?.trim();
    const searchQuery = (req.query.q as string | undefined)?.trim();
    const drive = getDriveClient();

    if (searchQuery) {
      const escapedQ = searchQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const driveQ = `name contains '${escapedQ}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      let sheetsData: { id?: string | null; name?: string | null; modifiedTime?: string | null; parents?: string[] | null }[] = [];
      try {
        const sheetsResp = await drive.files.list({
          q: driveQ,
          fields: "files(id,name,modifiedTime,parents)",
          orderBy: "modifiedTime desc",
          pageSize: 50,
        });
        sheetsData = sheetsResp.data.files || [];
      } catch (driveErr) {
        console.error("[translations/browse] Search Drive error:", driveErr);
        return res.status(502).json({ message: "Errore nella ricerca Drive" });
      }

      async function resolveFolderPath(parentId: string | undefined): Promise<string> {
        if (!parentId) return "";
        const parts: string[] = [];
        let currentId: string | undefined = parentId;
        const MAX_DEPTH = 6;
        for (let i = 0; i < MAX_DEPTH && currentId; i++) {
          const meta = await getDriveFolderMeta(currentId);
          if (!meta) break;
          parts.unshift(meta.name);
          currentId = meta.parents?.[0];
        }
        return parts.join(" / ");
      }

      const sheetsWithPaths = await Promise.all(
        sheetsData.map(async (f) => ({
          id: f.id ?? "",
          name: f.name ?? "",
          modifiedTime: f.modifiedTime ?? undefined,
          folderPath: await resolveFolderPath(f.parents?.[0] ?? undefined).catch(() => ""),
        }))
      );

      return res.json({
        folderName: "Risultati ricerca",
        folders: [],
        sheets: sheetsWithPaths,
        isSearch: true,
      });
    }

    const driveListOpts = { supportsAllDrives: true, includeItemsFromAllDrives: true };

    let foldersFiles: { id?: string | null; name?: string | null }[] = [];
    let sheetsFiles: { id?: string | null; name?: string | null; modifiedTime?: string | null }[] = [];

    if (folderId) {
      const parentClause = `'${folderId}' in parents`;
      const qFolders = `${parentClause} and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const qSheets = `${parentClause} and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      try {
        const [foldersResp, sheetsResp] = await Promise.all([
          drive.files.list({ q: qFolders, fields: "files(id,name)", orderBy: "name", pageSize: 100, ...driveListOpts }),
          drive.files.list({ q: qSheets, fields: "files(id,name,modifiedTime)", orderBy: "modifiedTime desc", pageSize: 100, ...driveListOpts }),
        ]);
        foldersFiles = foldersResp.data.files || [];
        sheetsFiles = sheetsResp.data.files || [];
      } catch (driveErr) {
        console.error("[translations/browse] Drive error:", driveErr);
        return res.status(502).json({ message: "Errore nel recupero del contenuto Drive" });
      }
    } else {
      const qRootFolders = `'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const qRootSheets = `'root' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const qSharedFolders = `sharedWithMe=true and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const qSharedSheets = `sharedWithMe=true and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      try {
        const [rF, rS, sF, sS] = await Promise.all([
          drive.files.list({ q: qRootFolders, fields: "files(id,name)", orderBy: "name", pageSize: 100, ...driveListOpts }),
          drive.files.list({ q: qRootSheets, fields: "files(id,name,modifiedTime)", orderBy: "modifiedTime desc", pageSize: 100, ...driveListOpts }),
          drive.files.list({ q: qSharedFolders, fields: "files(id,name)", orderBy: "name", pageSize: 100, ...driveListOpts }),
          drive.files.list({ q: qSharedSheets, fields: "files(id,name,modifiedTime)", orderBy: "modifiedTime desc", pageSize: 100, ...driveListOpts }),
        ]);
        const seenF = new Set<string>();
        for (const f of [...(rF.data.files || []), ...(sF.data.files || [])]) {
          if (f.id && !seenF.has(f.id)) { seenF.add(f.id); foldersFiles.push(f); }
        }
        const seenS = new Set<string>();
        for (const f of [...(rS.data.files || []), ...(sS.data.files || [])]) {
          if (f.id && !seenS.has(f.id)) { seenS.add(f.id); sheetsFiles.push(f); }
        }
        foldersFiles.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      } catch (driveErr) {
        console.error("[translations/browse] Drive error:", driveErr);
        return res.status(502).json({ message: "Errore nel recupero del contenuto Drive" });
      }
    }

    let folderName = "Drive";
    let saEmail: string | undefined;
    if (folderId) {
      const meta = await getDriveFolderMeta(folderId);
      if (meta) folderName = meta.name;
    } else {
      try {
        const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        if (saJson) saEmail = (JSON.parse(saJson) as { client_email?: string }).client_email;
      } catch { /* ignore */ }
    }

    return res.json({
      folderName,
      folders: foldersFiles.map((f) => ({ id: f.id ?? "", name: f.name ?? "" })),
      sheets: sheetsFiles.map((f) => ({ id: f.id ?? "", name: f.name ?? "", modifiedTime: f.modifiedTime ?? undefined })),
      ...(saEmail ? { saEmail } : {}),
    });
  } catch (error) {
    console.error("[translations/browse] error:", error);
    return res.status(500).json({ message: "Errore durante la navigazione Drive" });
  }
});

router.get("/translations/file-path", async (req: Request, res: Response) => {
  try {
    const fileId = (req.query.fileId as string | undefined)?.trim();
    if (!fileId) {
      return res.status(400).json({ message: "fileId richiesto" });
    }
    const fileMeta = await getDriveFolderMeta(fileId);
    if (!fileMeta) {
      return res.status(502).json({ message: "Impossibile recuperare il percorso del file" });
    }
    const parentId = fileMeta.parents?.[0];
    if (!parentId) {
      return res.json({ folderPath: "Drive" });
    }

    const parent = await getDriveFolderMeta(parentId);
    if (!parent) {
      return res.json({ folderPath: "Drive" });
    }
    const parentName = parent.name;
    const grandParentId = parent.parents?.[0];

    if (!grandParentId) {
      return res.json({ folderPath: parentName });
    }

    const grandParent = await getDriveFolderMeta(grandParentId);
    if (!grandParent) {
      return res.json({ folderPath: parentName });
    }

    return res.json({ folderPath: `${grandParent.name} / ${parentName}` });
  } catch (error) {
    console.error("[translations/file-path] error:", error);
    return res.status(500).json({ message: "Errore durante il recupero del percorso" });
  }
});

router.delete("/translations/folder-cache", (_req: Request, res: Response) => {
  const clearedCount = driveFolderNameCache.size;
  driveFolderNameCache.clear();
  console.log(`[translations/folder-cache] Cache svuotata: ${clearedCount} voci rimosse`);
  return res.json({ cleared: clearedCount });
});

const TRANSLATIONS_PREFS_KEY = "translations.prefs";

router.get("/translations/prefs", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, TRANSLATIONS_PREFS_KEY));
    if (rows.length === 0 || !rows[0].valueJson) return res.json({ hasRecord: false });
    const stored = rows[0].valueJson as { sheet?: { id: string; name: string; folderPath?: string } | null };
    return res.json({
      hasRecord: true,
      sheet: stored.sheet ?? null,
    });
  } catch (error) {
    console.error("[translations/prefs GET] error:", error);
    return res.status(500).json({ message: "Errore nel recupero delle preferenze" });
  }
});

router.post("/translations/prefs", async (req: Request, res: Response) => {
  try {
    const { sheet } = req.body as {
      sheet?: { id: string; name: string; folderPath?: string } | null;
    };
    if (sheet === undefined) return res.json({ ok: true });
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, TRANSLATIONS_PREFS_KEY));
    const current = (existing.length > 0 && existing[0].valueJson ? existing[0].valueJson : {}) as Record<string, unknown>;
    const updated = { ...current, sheet };
    await db.insert(appSettings)
      .values({ key: TRANSLATIONS_PREFS_KEY, valueJson: updated, description: "Preferenze admin traduzioni (foglio import)" })
      .onConflictDoUpdate({ target: appSettings.key, set: { valueJson: updated, updatedAt: new Date() } });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[translations/prefs POST] error:", error);
    return res.status(500).json({ message: "Errore nel salvataggio delle preferenze" });
  }
});

router.get("/translations/preview-sheet", async (req: Request, res: Response) => {
  try {
    const fileId = (req.query.fileId as string | undefined)?.trim();
    if (!fileId) {
      return res.status(400).json({ message: "fileId richiesto" });
    }

    const drive = getDriveClient();
    let csvText: string;
    try {
      const exportResp = await drive.files.export(
        { fileId, mimeType: "text/csv" },
        { responseType: "text" }
      );
      csvText = exportResp.data as string;
    } catch (driveErr) {
      console.error("[translations/preview-sheet] Drive error:", driveErr);
      return res.status(500).json({ message: "Errore nella lettura del Google Sheet" });
    }
    const firstLine = csvText.split(/\r?\n/)[0] ?? "";

    // Simple split for header — headers don't contain commas/quotes in our format
    const columns = firstLine.split(",").map((c) => c.trim().replace(/^"|"$/g, "").toUpperCase());
    const langColumns = columns.filter((c) => ALLOWED_LANGS.has(c.toLowerCase()));

    return res.json({ columns, langColumns });
  } catch (error) {
    console.error("[translations/preview-sheet] error:", error);
    return res.status(500).json({ message: "Errore durante la preview del foglio" });
  }
});

router.post("/translations/import", async (req: Request, res: Response) => {
  try {
    const { langs, fileId: customFileId } = req.body as { langs: string[]; fileId?: string };
    if (!langs || !Array.isArray(langs) || langs.length === 0) {
      return res.status(400).json({ message: "Seleziona almeno una lingua da importare" });
    }

    const { exportedFileId, exportedLangs, keyMap } = TRANSLATIONS_STAGING;
    const resolvedFileId = (customFileId && customFileId.trim()) ? customFileId.trim() : exportedFileId;

    if (!resolvedFileId) {
      return res.status(400).json({ message: "Nessun file selezionato. Esegui prima 'Genera ed esporta' o specifica un file manualmente" });
    }

    const invalidLangsImport = langs.filter((l) => !ALLOWED_LANGS.has(l));
    if (invalidLangsImport.length > 0) {
      return res.status(400).json({ message: `Lingue non valide: ${invalidLangsImport.join(", ")}` });
    }

    const usingSessionFile = resolvedFileId === exportedFileId && !customFileId?.trim();
    if (usingSessionFile && exportedLangs.length > 0) {
      const invalidLangs = langs.filter((l) => !exportedLangs.includes(l));
      if (invalidLangs.length > 0) {
        return res.status(400).json({ message: `Lingue non presenti nell'esportazione: ${invalidLangs.join(", ")}` });
      }
    }

    const drive = getDriveClient();
    let csvText: string;
    try {
      const exportResp = await drive.files.export(
        { fileId: resolvedFileId, mimeType: "text/csv" },
        { responseType: "text" }
      );
      csvText = exportResp.data as string;
    } catch (driveErr) {
      console.error("[translations/import] read error:", driveErr);
      return res.status(500).json({ message: "Errore nella lettura del Google Sheet" });
    }

    function parseCsv(text: string): string[][] {
      const rows: string[][] = [];
      let row: string[] = [];
      let field = "";
      let inQuotes = false;
      let i = 0;
      while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              inQuotes = false;
              i++;
            }
          } else {
            field += ch;
            i++;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
            i++;
          } else if (ch === ',') {
            row.push(field);
            field = "";
            i++;
          } else if (ch === '\r' && text[i + 1] === '\n') {
            row.push(field);
            field = "";
            if (row.some((f) => f !== "")) rows.push(row);
            row = [];
            i += 2;
          } else if (ch === '\n') {
            row.push(field);
            field = "";
            if (row.some((f) => f !== "")) rows.push(row);
            row = [];
            i++;
          } else {
            field += ch;
            i++;
          }
        }
      }
      if (field !== "" || row.length > 0) {
        row.push(field);
        if (row.some((f) => f !== "")) rows.push(row);
      }
      return rows;
    }

    const allRows = parseCsv(csvText);

    if (allRows.length < 2) {
      return res.status(400).json({ message: "Il foglio è vuoto o mancano le righe" });
    }

    const headerRow = allRows[0];
    const langColumnIndexes: Record<string, number> = {};
    for (const lang of langs) {
      const colHeader = lang.toUpperCase();
      const idx = headerRow.indexOf(colHeader);
      if (idx !== -1) {
        langColumnIndexes[lang] = idx;
      }
    }

    const importedData: Record<string, Record<string, string>> = {};
    for (const lang of langs) {
      importedData[lang] = {};
    }

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      const key = row[0];
      if (!key || !keyMap[key]) continue;
      for (const lang of langs) {
        const colIdx = langColumnIndexes[lang];
        if (colIdx !== undefined) {
          const val = row[colIdx] || "";
          if (val.trim()) {
            importedData[lang][key] = val;
          }
        }
      }
    }

    TRANSLATIONS_STAGING.importedData = importedData;

    const summary = langs.map((l) => `${l.toUpperCase()}: ${Object.keys(importedData[l] || {}).length} stringhe`).join(", ");
    return res.json({
      langs,
      summary,
      message: `Dati importati: ${summary}`,
    });
  } catch (error) {
    console.error("[translations/import] error:", error);
    return res.status(500).json({ message: "Errore durante l'importazione" });
  }
});

router.post("/translations/apply", async (_req: Request, res: Response) => {
  try {
    const { importedData, keyMap } = TRANSLATIONS_STAGING;

    if (Object.keys(importedData).length === 0) {
      return res.status(400).json({ message: "Nessun dato importato. Esegui prima 'Importa da Drive'" });
    }

    const allKeys = Object.keys(keyMap);
    const summaryByLang: Record<string, { updated: number; skipped: number }> = {};

    for (const [lang, translations] of Object.entries(importedData)) {
      if (!ALLOWED_LANGS.has(lang)) {
        console.warn(`[translations/apply] skipping unknown lang: ${lang}`);
        continue;
      }
      const filePath = LANG_FILE_MAP[lang];

      const existingValues: Record<string, string> = {};
      try {
        const existing = fs.readFileSync(filePath, "utf-8");
        const kvRegex = /^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/gm;
        let m: RegExpExecArray | null;
        while ((m = kvRegex.exec(existing)) !== null) {
          const k = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          const v = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          existingValues[k] = v;
        }
      } catch {
      }

      const varName = lang;
      const lines: string[] = [`const ${varName}: Record<string, string> = {`];

      let updated = 0;
      let skipped = 0;

      for (const key of allKeys) {
        const imported = translations[key];
        if (imported && imported.trim()) {
          const escaped = imported.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
          lines.push(`  "${key}": "${escaped}",`);
          updated++;
        } else {
          const preserved = existingValues[key] ?? "";
          const escaped = preserved.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
          lines.push(`  "${key}": "${escaped}",`);
          skipped++;
        }
      }

      lines.push(`};`);
      lines.push(``);
      lines.push(`export default ${varName};`);
      lines.push(``);

      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
      summaryByLang[lang] = { updated, skipped };
    }

    const summaryStr = Object.entries(summaryByLang)
      .map(([l, s]) => `${l.toUpperCase()}: ${s.updated} aggiornate, ${s.skipped} preservate`)
      .join(" | ");

    return res.json({
      summary: summaryByLang,
      message: `Traduzioni applicate: ${summaryStr}`,
    });
  } catch (error) {
    console.error("[translations/apply] error:", error);
    return res.status(500).json({ message: "Errore durante l'applicazione delle traduzioni" });
  }
});

router.get("/coordinate-history/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await storage.getCoordinateHistoryStats();
    return res.json(stats);
  } catch (error) {
    console.error("Admin coordinate-history stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/coordinate-history/users", async (_req: Request, res: Response) => {
  try {
    const [modeSetting, usersSetting] = await Promise.all([
      storage.getAppSetting("coordinate_history_mode"),
      storage.getAppSetting("coordinate_history_users"),
    ]);
    const mode = modeSetting?.value || "all";
    const selectedUserIds: string[] = usersSetting?.value ? JSON.parse(usersSetting.value) : [];
    const recordStats = await storage.getCoordinateHistoryUsers();
    return res.json({
      mode,
      selectedUserIds,
      usersWithRecords: recordStats,
    });
  } catch (error) {
    console.error("Admin coordinate-history users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/coordinate-history/settings", async (_req: Request, res: Response) => {
  try {
    const [enabled, interval, maxRecords, mode, selectedUsers] = await Promise.all([
      storage.getAppSetting("coordinate_history_enabled"),
      storage.getAppSetting("coordinate_history_interval"),
      storage.getAppSetting("coordinate_history_max_records"),
      storage.getAppSetting("coordinate_history_mode"),
      storage.getAppSetting("coordinate_history_users"),
    ]);
    return res.json({
      enabled: enabled?.value === "true",
      interval: interval?.value ? parseInt(interval.value, 10) : 30,
      maxRecords: maxRecords?.value ? parseInt(maxRecords.value, 10) : 60,
      mode: mode?.value || "all",
      selectedUsers: selectedUsers?.value ? JSON.parse(selectedUsers.value) : [],
    });
  } catch (error) {
    console.error("Admin coordinate-history settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/coordinate-history/settings", async (req: Request, res: Response) => {
  try {
    const { enabled, interval, maxRecords, mode, selectedUsers } = req.body;
    if (enabled !== undefined) {
      await storage.upsertAppSetting("coordinate_history_enabled", enabled ? "true" : "false");
    }
    if (interval !== undefined) {
      const val = parseInt(interval, 10);
      if (!isNaN(val) && val >= 5) {
        await storage.upsertAppSetting("coordinate_history_interval", String(val));
      }
    }
    if (maxRecords !== undefined) {
      const val = parseInt(maxRecords, 10);
      if (!isNaN(val) && val >= 1) {
        await storage.upsertAppSetting("coordinate_history_max_records", String(val));
      }
    }
    if (mode !== undefined && (mode === "all" || mode === "selected")) {
      await storage.upsertAppSetting("coordinate_history_mode", mode);
    }
    if (selectedUsers !== undefined && Array.isArray(selectedUsers)) {
      await storage.upsertAppSetting("coordinate_history_users", JSON.stringify(selectedUsers));
    }
    return res.json({ message: "Impostazioni storico coordinate aggiornate" });
  } catch (error) {
    console.error("Admin coordinate-history settings update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/translations/restart", async (_req: Request, res: Response) => {
  try {
    res.json({ ok: true, message: "Backend in riavvio..." });
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } catch (error) {
    console.error("[translations/restart] error:", error);
    return res.status(500).json({ message: "Errore durante il riavvio" });
  }
});

router.get("/settings/bg-location", async (_req: Request, res: Response) => {
  try {
    const [enabled, trigger, interval, notificationText, ghostModeContinue] = await Promise.all([
      storage.getAppSetting("bg_location_enabled"),
      storage.getAppSetting("bg_location_trigger"),
      storage.getAppSetting("bg_location_interval_seconds"),
      storage.getAppSetting("bg_location_notification_text"),
      storage.getAppSetting("bg_location_ghost_mode_continue"),
    ]);
    return res.json({
      enabled: enabled?.value !== "false",
      trigger: trigger?.value || "always",
      intervalSeconds: interval?.value ? parseInt(interval.value, 10) : 30,
      notificationText: notificationText?.value || "BikerLink: {motivo} — posizione attiva in background",
      ghostModeContinue: ghostModeContinue?.value === "true",
    });
  } catch (error) {
    console.error("Get bg-location settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.patch("/settings/bg-location", async (req: Request, res: Response) => {
  try {
    const { enabled, trigger, intervalSeconds, notificationText, ghostModeContinue } = req.body;
    const validTriggers = ["always", "tracking", "sos", "tracking_or_sos"];

    if (enabled !== undefined) {
      await storage.upsertAppSetting("bg_location_enabled", enabled ? "true" : "false");
    }
    if (trigger !== undefined) {
      if (!validTriggers.includes(trigger)) {
        return res.status(400).json({ message: "Modalità trigger non valida" });
      }
      await storage.upsertAppSetting("bg_location_trigger", trigger);
    }
    if (intervalSeconds !== undefined) {
      const val = parseInt(intervalSeconds, 10);
      if (isNaN(val) || val < 10 || val > 300) {
        return res.status(400).json({ message: "Intervallo deve essere tra 10 e 300 secondi" });
      }
      await storage.upsertAppSetting("bg_location_interval_seconds", String(val));
    }
    if (notificationText !== undefined) {
      await storage.upsertAppSetting("bg_location_notification_text", String(notificationText).substring(0, 200));
    }
    if (ghostModeContinue !== undefined) {
      await storage.upsertAppSetting("bg_location_ghost_mode_continue", ghostModeContinue ? "true" : "false");
    }

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "setting",
      targetId: "bg_location",
      details: "Impostazioni background location aggiornate",
    });

    return res.json({ message: "Impostazioni background location aggiornate" });
  } catch (error) {
    console.error("Update bg-location settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/settings/floating-widget", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("floating_widget_enabled");
    return res.json({ enabled: setting?.value !== "false" });
  } catch (error) {
    console.error("Get floating-widget setting error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.patch("/settings/floating-widget", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled deve essere un booleano" });
    }
    await storage.upsertAppSetting("floating_widget_enabled", enabled ? "true" : "false");
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "setting",
      targetId: "floating_widget_enabled",
      details: `Widget flottante ${enabled ? "abilitato" : "disabilitato"}`,
    });
    return res.json({ enabled });
  } catch (error) {
    console.error("Update floating-widget setting error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/drive/storage-info", async (_req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const about = await drive.about.get({ fields: "storageQuota" });
    const quota = about.data?.storageQuota ?? {};
    return res.json({
      limit: quota.limit ? parseInt(quota.limit) : null,
      usage: quota.usage ? parseInt(quota.usage) : null,
      usageInDrive: quota.usageInDrive ? parseInt(quota.usageInDrive) : null,
    });
  } catch (error: any) {
    console.error("Drive storage-info error — code:", error?.code, "errors:", JSON.stringify(error?.errors ?? []), error);
    const isPermission =
      error?.code === 403 ||
      error?.errors?.some((e: any) =>
        ["forbidden", "insufficientPermissions", "notFound"].includes(e.reason)
      );
    if (isPermission) {
      return res.status(403).json({ message: "Il Service Account non ha permessi di lettura su Drive." });
    }
    return res.status(500).json({ message: "Errore nel recupero quota Drive" });
  }
});

router.delete("/drive/cleanup-exports", async (_req: Request, res: Response) => {
  try {
    const drive = getDriveClient();
    const q = `(name contains 'BikerLink' OR name contains 'Traduzioni' OR name contains 'bikerlink') and trashed=false`;
    const listResp = await drive.files.list({
      q,
      fields: "files(id,name,size)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = listResp.data.files || [];
    let deleted = 0;
    let freed = 0;
    for (const f of files) {
      try {
        await drive.files.delete({ fileId: f.id!, supportsAllDrives: true });
        deleted++;
        freed += f.size ? parseInt(f.size as unknown as string) : 0;
        console.log(`[cleanup-exports] Eliminato: ${f.name} (${f.id})`);
      } catch (err: any) {
        console.warn(`[cleanup-exports] Impossibile eliminare ${f.id}:`, err?.message);
      }
    }
    if (TRANSLATIONS_STAGING.exportedFileId && files.some((f) => f.id === TRANSLATIONS_STAGING.exportedFileId)) {
      TRANSLATIONS_STAGING.exportedFileId = null;
    }
    return res.json({ deleted, freed, total: files.length });
  } catch (error: any) {
    console.error("Drive cleanup-exports error — code:", error?.code, "errors:", JSON.stringify(error?.errors ?? []), error);
    const isPermission =
      error?.code === 403 ||
      error?.errors?.some((e: any) =>
        ["forbidden", "insufficientPermissions", "notFound"].includes(e.reason)
      );
    if (isPermission) {
      return res.status(403).json({ message: "Il Service Account non ha permessi sulla cartella Drive." });
    }
    return res.status(500).json({ message: "Errore durante la pulizia Drive" });
  }
});

// Protected by router.use(requireAdmin) above — only admins can access
router.get("/gps-errors", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const [errors, total] = await Promise.all([
      storage.getGpsErrors(limit, offset),
      storage.countGpsErrors(),
    ]);
    return res.json({ errors, total, page, limit });
  } catch (error) {
    console.error("GPS errors fetch error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

export default router;

