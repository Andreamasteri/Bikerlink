import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { sendSuccess, sendError } from "../lib/api-response";
import { storage } from "../storage";
import { db } from "../db";
import { motoClubs, motoClubMembers } from "@shared/db";
import { clientErrorSchema, startupBeaconSchema } from "@shared/validators";
import { eq } from "drizzle-orm";


const router = Router();

/**
 * Narrows an Express route/query param to a plain string.
 * Returns null when the value is an array or missing so the caller can
 * respond with 400 instead of silently coercing bad input.
 */
function _paramStr(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}


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

// SECURITY (Task #1082) — POST /startup-beacon hardening.
// The endpoint is intentionally public (clients ping during startup before
// having a session). Without per-route limits the global JSON parser
// (express.json({ limit: "10mb" })) let an unauthenticated attacker push
// up to 50 × 10 MB blobs into the in-memory startupBeacons ring buffer
// (~500 MB attacker-retained), and pollute admin diagnostics with arbitrary
// keys via `...rest`.
//
// Defenses applied:
//   1. Per-route JSON parser capped at 8 KB (overrides the 10 MB global).
//   2. IP rate limit: 30 requests / 5 min — generous for legit startup
//      retries, lethal for spray-attacks.
//   3. Sanitization of the attacker-controlled `data` field:
//        - max 20 keys
//        - each key truncated to 64 chars
//        - each value coerced & truncated (strings 200 chars, primitives
//          kept as-is, objects/arrays JSON-stringified then truncated)
//        - aggregate stringified payload capped at 1 KB; if it overflows
//          the field is dropped and replaced by `{ __truncated: true }`.
const startupBeaconJson = express.json({ limit: "8kb" });
const startupBeaconLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { message: "Too many startup beacons" },
  standardHeaders: true,
  legacyHeaders: false
});


const clientErrorJson = express.json({ limit: "16kb" });
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { received: true },
  standardHeaders: true,
  legacyHeaders: false
});

const BEACON_DATA_MAX_KEYS = 20;
const BEACON_DATA_KEY_MAX = 64;
const BEACON_DATA_VALUE_MAX = 200;
const BEACON_DATA_TOTAL_MAX = 1024;

function sanitizeBeaconData(rest: Record<string, unknown>): Record<string, unknown> | undefined {
  const keys = Object.keys(rest);
  if (keys.length === 0) return undefined;
  const sanitized: Record<string, unknown> = {};
  let count = 0;
  for (const rawKey of keys) {
    if (count >= BEACON_DATA_MAX_KEYS) break;
    const key = String(rawKey).substring(0, BEACON_DATA_KEY_MAX);
    const v = rest[rawKey];
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      sanitized[key] = v;
    } else if (typeof v === "string") {
      sanitized[key] = v.substring(0, BEACON_DATA_VALUE_MAX);
    } else {
      try {
        sanitized[key] = JSON.stringify(v).substring(0, BEACON_DATA_VALUE_MAX);
      } catch {
        sanitized[key] = "[unserializable]";
      }
    }
    count++;
  }
  try {
    if (JSON.stringify(sanitized).length > BEACON_DATA_TOTAL_MAX) {
      return { __truncated: true };
    }
  } catch {
    return { __truncated: true };
  }
  return sanitized;
}

interface ClubAssignStats {
  assigned: number;
  skipped: number;
  failed: number;
}

async function _assignFakeUserToClubs(userId: string): Promise<ClubAssignStats> {
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
          status: "active"
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

function _requireAdmin(req: Request, res: Response, next: Function) {
  const path = req.originalUrl || req.url;
  // Ultimi 6 char del sessionId per la diagnostica (no PII, no leak completo).
  const sid = req.sessionID ? `…${req.sessionID.slice(-6)}` : "none";
  if (!req.session.userId) {
    console.warn(`[admin-auth] 401 reason=no-session path=${path} sid=${sid}`);
    return sendError(res, 401, "Sessione scaduta. Effettua di nuovo l'accesso.");
  }
  storage.getUser(req.session.userId).then((user) => {
    if (!user) {
      console.warn(`[admin-auth] 403 reason=user-not-found path=${path} sid=${sid} userId=${req.session.userId}`);
      return sendError(res, 403, "Account non trovato.");
    }
    if (user.role !== "admin") {
      console.warn(`[admin-auth] 403 reason=not-admin path=${path} sid=${sid} userId=${user.id} role=${user.role}`);
      return sendError(res, 403, "Accesso riservato agli amministratori.");
    }
    // Task #1078: defense-in-depth — admin sospeso/bloccato non deve continuare
    // a chiamare endpoint privilegiati anche se la sessione è ancora viva.
    // (Il middleware globale in routes.ts dovrebbe già averla distrutta.)
    if (user.status !== "active") {
      console.warn(`[admin-auth] 403 reason=not-active path=${path} sid=${sid} userId=${user.id} status=${user.status}`);
      return sendError(res, 403, "Account non attivo.");
    }
    (req as Request & { currentUser?: unknown }).currentUser = user;
    next();
  }).catch((err) => {
    console.error(`[admin-auth] 500 reason=db-error path=${path} sid=${sid} userId=${req.session.userId}`, err);
    return sendError(res, 500, "Errore autenticazione admin");
  });
}



router.post("/client-error", clientErrorLimiter, clientErrorJson, (req: Request, res: Response) => {
  try {
    const parsedCe = clientErrorSchema.safeParse(req.body || {});
    const { message, stack, componentStack, platform, appVersion, isFatal } = parsedCe.success ? parsedCe.data : {};
    // GDPR/CCPA compliance: do NOT log req.ip — client IP must not appear in error logs
    console.error("[CLIENT-ERROR]", JSON.stringify({
      message: message || "unknown",
      stack: (stack || "").substring(0, 2000),
      componentStack: (componentStack || "").substring(0, 1000),
      platform: platform || "unknown",
      appVersion: appVersion || "unknown",
      isFatal: !!isFatal,
      timestamp: new Date().toISOString()
    }));
    return res.json({ received: true });
  } catch {
    return res.status(200).json({ received: true });
  }
});


router.post("/startup-beacon", startupBeaconLimiter, startupBeaconJson, (req: Request, res: Response) => {
  try {
    const parsedSb = startupBeaconSchema.safeParse(req.body ?? {});
    if (!parsedSb.success) return sendError(res, 400, parsedSb.error.issues[0].message);
    const { step, ts, recovered, platform, ...rest } = parsedSb.data;
    const tsNum = typeof ts === "number" ? ts : Date.now();
    const entry: StartupBeaconEntry = {
      step: String(step).substring(0, 100),
      ts: tsNum,
      isoTime: new Date(tsNum).toISOString(),
      recovered: !!recovered,
      platform: platform ? String(platform).substring(0, 16) : undefined,
      data: sanitizeBeaconData(rest as Record<string, unknown>),
      receivedAt: new Date().toISOString()
    };
    startupBeacons.push(entry);
    if (startupBeacons.length > BEACONS_MAX) startupBeacons.splice(0, startupBeacons.length - BEACONS_MAX);
    console.log(`[BEACON]${entry.recovered ? " RECOVERED" : ""} step=${entry.step} platform=${entry.platform ?? "?"} t=${entry.isoTime}${entry.data ? " data=" + JSON.stringify(entry.data) : ""}`);
    return sendSuccess(res);
  } catch {
    return sendError(res, 500, "Errore interno");
  }
});

import usersRouter from './admin/users';
import settingsRouter from './admin/settings';
import adsRouter from './admin/advertisements';
import analyticsRouter from './admin/analytics';
import stregattiRouter from './admin/stregatti';
import miscRouter from './admin/misc';
import matchingRouter from './admin/matching';
import otaRouter from './admin/ota';
import mapsAdminRouter from './admin/maps/index';
router.use('/users', _requireAdmin, usersRouter);
router.use('/settings', settingsRouter);
router.use('/advertisements', _requireAdmin, adsRouter);
router.use('/analytics', _requireAdmin, analyticsRouter);
router.use('/stregatti', _requireAdmin, stregattiRouter);
router.use('/ota', _requireAdmin, otaRouter);
router.use('/maps', _requireAdmin, mapsAdminRouter);
router.use('/', miscRouter);
router.use('/', matchingRouter);

export default router;
