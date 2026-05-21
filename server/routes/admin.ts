import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import crypto from "crypto";
import { haversineKm } from "../geo";
import fs from "fs";
import path from "path";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, TextRun, HeightRule } from "docx";
import bcrypt from "bcryptjs";
import { uploadBuffer, objectExists, isValidOtaBundlePath, deleteObject } from "../objectStorage";
import { storage } from "../storage";
import { db } from "../db";
import { getTrustedClientIp } from "../lib/abuse-rate-limit";
import { motoClubs, motoClubRequests, motoClubMembers, motoClubInvites, zavarrinaWishlists, zavarrinaWishlistMotos, conversations, conversationParticipants, messages, feedbackTickets, moderatorLogs, users, userProfiles, userMotorcycles, bikerZavarrinaMatches, bikerBikerMatches, serverRestarts, appSettings, userMusicTracks, userLastfmSessions, userPlaylistSnapshots, otaEvents, adCampaigns as adCampaignsTable, matchPreferences, gpsRejectionStats, siteVisits, rideTelemetry, routes, otaPublishTokens } from "@shared/schema";
import { DEFAULT_PREFS } from "./match-preferences";
import { createClubInvitesForMoto } from "./motoclubs";
import { eq, and, ne, desc, sql, count, notExists, inArray, notInArray, lte, isNull, or, ilike } from "drizzle-orm";
import { sendEmail, sendEmailDetailed, getEmailDiagnostics } from "../email";
import {
  verifyEmailStore,
  resendVerificationStore,
  verifyAttempts,
  clearVerifyAttempts,
  VERIFY_EMAIL_WINDOW_MS,
  VERIFY_EMAIL_MAX,
  RESEND_VERIFICATION_WINDOW_MS,
  RESEND_VERIFICATION_MAX,
  VERIFY_MAX_ATTEMPTS,
  VERIFY_ATTEMPT_WINDOW_MS,
} from "./auth";
import { MOTORCYCLES, pickRandomN, getMotoYear } from "../mass-seed-data";
import { getLastMatchingCycleMeta, runBikerBikerMatching, runWishlistMatching, runMatchingForUser, triggerMatchingRun } from "../matching-engine";
import { isProtectedUser, PROTECTED_EMAILS } from "../constants";
import { closeSseClient } from "../chat-sse";
import { SERVER_START_TIME, uptimeState } from "../uptime";
import { downloadBuffer } from "../objectStorage";
import { revokeAllUserSessions } from "../session-utils";
import { cacheAdImage } from "./ads";
import { allSettledLimited } from "../lib/concurrency";

const router = Router();

/**
 * Narrows an Express route/query param to a plain string.
 * Returns null when the value is an array or missing so the caller can
 * respond with 400 instead of silently coercing bad input.
 */
function paramStr(v: string | string[] | undefined): string | null {
  return typeof v === "string" ? v : null;
}

interface OtaProbeRecord {
  status?: number;
  contentType?: string;
  bodySnippet?: string;
  durationMs?: number;
  error?: string;
}

interface OtaErrorEntry {
  error: string;
  failCount: number;
  updateId: string;
  runtimeVersion: string;
  phase?: string;
  source?: string;
  platform?: string;
  timestamp: string;
  // Task #1148: diagnostica avanzata, tutti opzionali e già troncati a monte.
  errorCode?: string;
  errorCause?: string;
  errorUserInfo?: string;
  nativeStack?: string;
  updateUrl?: string;
  channel?: string;
  networkInfo?: string;
  probe?: OtaProbeRecord;
}
const otaErrors: OtaErrorEntry[] = [];
const OTA_ERRORS_MAX = 100;

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
  legacyHeaders: false,
});

// SECURITY (Task #1125) — POST /ota-error and /client-error are public
// telemetry sinks. Both used to fall back to the global 10 MB JSON parser
// (server/index.ts) and only ota-error had a manual per-IP gate that ran
// AFTER parsing. Now both routes:
//   1. Are excluded from the global parser (server/index.ts).
//   2. Use a small per-route JSON parser sized to the legitimate payload.
//      ota-error fields are explicitly truncated to a few hundred chars,
//      so 8 KB is comfortable. client-error includes a stack and component
//      stack truncated to 2 KB + 1 KB downstream, so 16 KB leaves slack.
//   3. Run an express-rate-limit BEFORE the parser so an attacker pays the
//      429 in O(1) instead of provoking a multi-MB parse on every loop.
// Upper-bounded windows + small caps mean a single IP can no longer flood
// logs (client-error) or pollute ota_events / in-memory ring buffers
// (ota-error) without hitting a hard limit.
// Task #1148: limite alzato da 8kb a 16kb per ospitare i nuovi campi
// diagnostici (nativeStack ~1.5kb, probe.bodySnippet 200, ecc.) — tutti
// comunque troncati esplicitamente prima di essere persistiti.
const otaErrorJson = express.json({ limit: "16kb" });
const otaErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { message: "Troppi eventi OTA: rallenta." },
  standardHeaders: true,
  legacyHeaders: false,
});

const clientErrorJson = express.json({ limit: "16kb" });
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { received: true },
  standardHeaders: true,
  legacyHeaders: false,
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
  // Task #1770: se la richiesta è già stata autenticata via OTA token
  // (per i tre endpoint di publish), bypassa il controllo sessione.
  if ((req as any).otaTokenAuthenticated === true) {
    return next();
  }

  const path = req.originalUrl || req.url;
  // Ultimi 6 char del sessionId per la diagnostica (no PII, no leak completo).
  const sid = req.sessionID ? `…${req.sessionID.slice(-6)}` : "none";
  if (!req.session.userId) {
    console.warn(`[admin-auth] 401 reason=no-session path=${path} sid=${sid}`);
    return res.status(401).json({ message: "Sessione scaduta. Effettua di nuovo l'accesso.", reason: "no-session" });
  }
  storage.getUser(req.session.userId).then((user) => {
    if (!user) {
      console.warn(`[admin-auth] 403 reason=user-not-found path=${path} sid=${sid} userId=${req.session.userId}`);
      return res.status(403).json({ message: "Account non trovato.", reason: "user-not-found" });
    }
    if (user.role !== "admin") {
      console.warn(`[admin-auth] 403 reason=not-admin path=${path} sid=${sid} userId=${user.id} role=${user.role}`);
      return res.status(403).json({ message: "Accesso riservato agli amministratori.", reason: "not-admin" });
    }
    // Task #1078: defense-in-depth — admin sospeso/bloccato non deve continuare
    // a chiamare endpoint privilegiati anche se la sessione è ancora viva.
    // (Il middleware globale in routes.ts dovrebbe già averla distrutta.)
    if (user.status !== "active") {
      console.warn(`[admin-auth] 403 reason=not-active path=${path} sid=${sid} userId=${user.id} status=${user.status}`);
      return res.status(403).json({ message: "Account non attivo.", reason: "not-active" });
    }
    (req as any).currentUser = user;
    next();
  }).catch((err) => {
    console.error(`[admin-auth] 500 reason=db-error path=${path} sid=${sid} userId=${req.session.userId}`, err);
    return res.status(500).json({ message: "Errore autenticazione admin", reason: "db-error" });
  });
}

// Task #1770 — OTA token middleware: valida Bearer token per i 3 endpoint di publish.
// Viene applicato PRIMA di router.use(requireAdmin) per i soli path OTA di scrittura.
// Se il token è valido, imposta req.otaTokenAuthenticated = true; requireAdmin lo rispetta.
const OTA_PUBLISH_PATHS: Array<RegExp | string> = [
  // POST /ota  (create release)
  /^\/ota\/?$/,
  // POST /ota/:id/publish
  /^\/ota\/[^/]+\/publish\/?$/,
  // POST /ota/assign-slot
  /^\/ota\/assign-slot\/?$/,
];

function matchOtaPublishPath(method: string, url: string): boolean {
  if (method !== "POST") return false;
  const pathname = url.split("?")[0];
  return OTA_PUBLISH_PATHS.some((p) =>
    typeof p === "string" ? pathname === p : p.test(pathname)
  );
}

async function checkOtaTokenMiddleware(req: Request, _res: Response, next: Function) {
  try {
    if (!matchOtaPublishPath(req.method, req.url)) return next();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();
    const rawToken = authHeader.substring(7).trim();
    if (!rawToken) return next();
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const now = new Date();
    const rows = await db
      .select({ id: otaPublishTokens.id })
      .from(otaPublishTokens)
      .where(
        and(
          eq(otaPublishTokens.tokenHash, tokenHash),
          eq(otaPublishTokens.revoked, false),
          or(
            isNull(otaPublishTokens.expiresAt),
            sql`${otaPublishTokens.expiresAt} > ${now}`
          )
        )
      )
      .limit(1);
    if (rows.length > 0) {
      (req as any).otaTokenAuthenticated = true;
      (req as any).otaTokenId = rows[0].id;
      // Aggiorna last_used_at in background (best-effort)
      db.update(otaPublishTokens)
        .set({ lastUsedAt: now })
        .where(eq(otaPublishTokens.id, rows[0].id))
        .catch((e: unknown) => console.warn("[OTA-TOKEN] last_used_at update failed:", e));
    }
  } catch (e) {
    console.error("[OTA-TOKEN] checkOtaTokenMiddleware error:", e);
  }
  next();
}

// Registra il middleware OTA token PRIMA del gate requireAdmin globale
router.use(checkOtaTokenMiddleware as any);

// Retention massima righe ota_events — usato come limite per la query admin
// di visualizzazione. Il cleanup hard è gestito da Phase 12.5 in server/index.ts
// (ogni 6h, configurabile via env var OTA_EVENTS_RETENTION, default 1000).
const _rawEventsRetention = parseInt(process.env.OTA_EVENTS_RETENTION ?? "1000", 10);
const OTA_EVENTS_DB_RETENTION = Number.isFinite(_rawEventsRetention) && _rawEventsRetention >= 1
  ? _rawEventsRetention
  : 1000;

function clientIp(req: Request): string | undefined {
  // Task #1126 (Telemetry and Reporting Abuse): delegate to the centralized
  // `getTrustedClientIp` helper. That helper documents the trust-proxy
  // contract and is the single chokepoint for IP derivation across all
  // public telemetry endpoints. Used here both for the per-IP rate-limit
  // key on /api/admin/ota-error AND for the `ip` value persisted in the
  // ota_events table — neither must ever be derived from raw
  // `X-Forwarded-For` parsing because that header is attacker-controlled
  // and a rotated value would defeat OTA_ERROR_RATE_MAX and poison the
  // operator telemetry table with spoofed source addresses.
  return getTrustedClientIp(req);
}

// Rate limiter in-memory per /ota-error (endpoint pubblico): max 60 req/60s/IP.
// Mappa IP -> array di timestamp (ms). Cleanup probabilistico inline.
const otaErrorRateMap = new Map<string, number[]>();
const OTA_ERROR_RATE_WINDOW_MS = 60_000;
const OTA_ERROR_RATE_MAX = 60;
function checkOtaErrorRate(ip: string | undefined): boolean {
  if (!ip) return true; // Senza IP non blocchiamo (proxy mal configurato).
  const now = Date.now();
  const arr = otaErrorRateMap.get(ip) ?? [];
  const fresh = arr.filter((t) => now - t < OTA_ERROR_RATE_WINDOW_MS);
  if (fresh.length >= OTA_ERROR_RATE_MAX) {
    otaErrorRateMap.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  otaErrorRateMap.set(ip, fresh);
  // Cleanup probabilistico mappa (evita crescita illimitata).
  if (Math.random() < 0.01 && otaErrorRateMap.size > 500) {
    for (const [k, v] of otaErrorRateMap) {
      if (v.every((t) => now - t > OTA_ERROR_RATE_WINDOW_MS)) otaErrorRateMap.delete(k);
    }
  }
  return true;
}

router.post("/ota-error", otaErrorLimiter, otaErrorJson, async (req: Request, res: Response) => {
  try {
    // Task #1125: keep the legacy in-memory per-IP gate as defense-in-depth
    // alongside the new express-rate-limit middleware. The middleware is
    // the primary gate (it runs before the JSON parser); this map stays
    // useful as a secondary safety net behind any proxy that strips
    // X-Forwarded-For inconsistently.
    const ip = clientIp(req);
    if (!checkOtaErrorRate(ip)) {
      return res.status(429).json({ message: "Troppi eventi OTA: rallenta." });
    }
    const {
      error, failCount, updateId, runtimeVersion, phase, source, platform,
      // Task #1625: stable device fingerprint (replaces IP-based tracking).
      deviceId,
      // Task #1148: nuovi campi diagnostici opzionali (tutti troncati sotto).
      errorCode, errorCause, errorUserInfo, nativeStack, updateUrl, channel, networkInfo, probe,
    } = req.body as {
      error?: string;
      failCount?: number;
      updateId?: string;
      runtimeVersion?: string;
      phase?: string;
      source?: string;
      platform?: string;
      deviceId?: string;
      errorCode?: string;
      errorCause?: string;
      errorUserInfo?: string;
      nativeStack?: string;
      updateUrl?: string;
      channel?: string;
      networkInfo?: string;
      probe?: {
        status?: unknown;
        contentType?: unknown;
        bodySnippet?: unknown;
        durationMs?: unknown;
        error?: unknown;
      };
    };
    if (!error) return res.status(400).json({ message: "error is required" });

    // Sanitizza/tronca esplicitamente il blocco diagnostico — anche se il
    // frontend dovrebbe già farlo, qui è la fonte di verità per i limiti.
    const sanitizedProbe: OtaProbeRecord | undefined = probe && typeof probe === "object" ? {
      status: typeof probe.status === "number" ? probe.status : undefined,
      contentType: typeof probe.contentType === "string" ? probe.contentType.substring(0, 64) : undefined,
      bodySnippet: typeof probe.bodySnippet === "string" ? probe.bodySnippet.substring(0, 200) : undefined,
      durationMs: typeof probe.durationMs === "number" ? probe.durationMs : undefined,
      error: typeof probe.error === "string" ? probe.error.substring(0, 200) : undefined,
    } : undefined;
    const sanitizedDiag = {
      errorCode: typeof errorCode === "string" ? errorCode.substring(0, 64) : undefined,
      errorCause: typeof errorCause === "string" ? errorCause.substring(0, 300) : undefined,
      errorUserInfo: typeof errorUserInfo === "string" ? errorUserInfo.substring(0, 500) : undefined,
      nativeStack: typeof nativeStack === "string" ? nativeStack.substring(0, 1500) : undefined,
      updateUrl: typeof updateUrl === "string" ? updateUrl.substring(0, 256) : undefined,
      channel: typeof channel === "string" ? channel.substring(0, 32) : undefined,
      networkInfo: typeof networkInfo === "string" ? networkInfo.substring(0, 64) : undefined,
      probe: sanitizedProbe,
    };
    const hasDiagnostics = Object.values(sanitizedDiag).some((v) => v !== undefined);

    const entry: OtaErrorEntry = {
      error: String(error).substring(0, 500),
      failCount: typeof failCount === "number" ? failCount : 0,
      updateId: String(updateId ?? "unknown").substring(0, 64),
      runtimeVersion: String(runtimeVersion ?? "unknown").substring(0, 16),
      phase: phase ? String(phase).substring(0, 24) : undefined,
      source: source ? String(source).substring(0, 24) : undefined,
      platform: platform ? String(platform).substring(0, 16) : undefined,
      timestamp: new Date().toISOString(),
      ...sanitizedDiag,
    };
    // Tieni l'array in memoria come fallback per /system-health (UI legacy).
    otaErrors.push(entry);
    if (otaErrors.length > OTA_ERRORS_MAX) otaErrors.splice(0, otaErrors.length - OTA_ERRORS_MAX);
    const isOk = entry.error.startsWith("ok:");
    const tag = isOk ? "OTA-EVENT" : "OTA-ERROR";
    const fn = isOk ? console.log : console.warn;
    fn(`[${tag}] rv=${entry.runtimeVersion} uid=${entry.updateId} src=${entry.source ?? "?"} ph=${entry.phase ?? "?"} pf=${entry.platform ?? "?"} fail#${entry.failCount}: ${entry.error}`);

    // Persisti su DB (sopravvive ai riavvii del backend).
    try {
      await db.insert(otaEvents).values({
        phase: (entry.phase ?? "unknown").substring(0, 32),
        source: entry.source?.substring(0, 32),
        platform: entry.platform?.substring(0, 16),
        runtimeVersion: entry.runtimeVersion.substring(0, 32),
        currentUpdateId: entry.updateId.substring(0, 64),
        error: entry.error,
        failCount: entry.failCount,
        ip: clientIp(req),
        deviceId: typeof deviceId === "string" ? deviceId.substring(0, 64) : undefined,
        diagnostics: hasDiagnostics ? sanitizedDiag : undefined,
      });
      // Nota: il cleanup della tabella ota_events è gestito dal job schedulato
      // in Phase 12.5 di server/index.ts (ogni 6h). Non c'è più cleanup
      // probabilistico qui per evitare contention DB sull'endpoint pubblico.
    } catch (dbErr) {
      console.error("[OTA-EVENT] DB insert failed:", dbErr);
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/client-error", clientErrorLimiter, clientErrorJson, (req: Request, res: Response) => {
  try {
    const { message, stack, componentStack, platform, appVersion, isFatal } = req.body || {};
    // GDPR/CCPA compliance: do NOT log req.ip — client IP must not appear in error logs
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

router.post("/startup-beacon", startupBeaconLimiter, startupBeaconJson, (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as {
      step?: string;
      ts?: number;
      recovered?: boolean;
      platform?: string;
      [key: string]: unknown;
    };
    const { step, ts, recovered, platform, ...rest } = body;
    if (!step) return res.status(400).json({ message: "step is required" });
    const tsNum = typeof ts === "number" ? ts : Date.now();
    const entry: StartupBeaconEntry = {
      step: String(step).substring(0, 100),
      ts: tsNum,
      isoTime: new Date(tsNum).toISOString(),
      recovered: !!recovered,
      platform: platform ? String(platform).substring(0, 16) : undefined,
      data: sanitizeBeaconData(rest as Record<string, unknown>),
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

// DELETE /api/admin/purge-non-admin-users
// Elimina tutti gli utenti non-admin dal DB (CASCADE su tutte le tabelle correlate).
// Richiede header X-Confirm-Purge: PURGE-CONFIRMED per prevenire invocazioni accidentali.
// events.approved_by usa NO ACTION — viene nullato prima del DELETE.
// Tutte le sessioni attive vengono invalidate. L'operazione è atomica (DB transaction).
// L'operazione è loggata in moderator_logs.
router.delete("/purge-non-admin-users", async (req: Request, res: Response) => {
  const confirmHeader = req.headers["x-confirm-purge"];
  if (confirmHeader !== "PURGE-CONFIRMED") {
    return res.status(400).json({ message: "Conferma mancante. Invia header X-Confirm-Purge: PURGE-CONFIRMED" });
  }

  try {
    const adminId = req.session.userId!;

    // Account riservati (Apple/Google reviewer) — protetti dalla purga
    const protectedEmails = PROTECTED_EMAILS.map((e) => e.toLowerCase());
    const protectedEmailsClause = sql.join(
      protectedEmails.map((e) => sql`${e}`),
      sql`, `
    );

    const { deletedCount } = await db.transaction(async (tx) => {
      // Step 1: null events.approved_by per utenti non-admin (esclude account protetti)
      await tx.execute(sql`
        UPDATE events SET approved_by = NULL
        WHERE approved_by IN (
          SELECT id FROM users
          WHERE role != 'admin'
            AND LOWER(email) NOT IN (${protectedEmailsClause})
        )
      `);

      // Step 2: conta utenti da eliminare (esclude account protetti)
      const countResult = await tx.execute(sql`
        SELECT COUNT(*) AS cnt FROM users
        WHERE role != 'admin'
          AND LOWER(email) NOT IN (${protectedEmailsClause})
      `);
      const deletedCount = Number((countResult.rows[0] as { cnt: string }).cnt);

      // Step 3: elimina utenti non-admin (esclude account protetti — CASCADE FK correlate)
      await tx.execute(sql`
        DELETE FROM users
        WHERE role != 'admin'
          AND LOWER(email) NOT IN (${protectedEmailsClause})
      `);

      // Step 4: elimina conversazioni orfane (senza partecipanti)
      await tx.execute(sql`
        DELETE FROM conversations
        WHERE id NOT IN (SELECT DISTINCT conversation_id FROM conversation_participants)
      `);

      // Step 5: invalida tutte le sessioni attive (anche reviewer rifaranno login)
      await tx.execute(sql`DELETE FROM session`);

      // Step 6: log in moderator_logs (targetId = adminId — operazione system, notNull)
      await tx.insert(moderatorLogs).values({
        moderatorId: adminId,
        action: "purge_non_admin_users",
        targetType: "system",
        targetId: adminId,
        details: `Purga DB: eliminati ${deletedCount} utenti non-admin (esclusi ${protectedEmails.length} account protetti) + tutte le sessioni`,
      });

      return { deletedCount };
    });

    console.log(`[PURGE] ${deletedCount} utenti non-admin eliminati dall'admin ${adminId} (account protetti: ${protectedEmails.join(", ")})`);
    return res.json({ purged: true, deletedUsers: deletedCount, protectedEmails });
  } catch (err) {
    console.error("[PURGE] errore durante purga utenti:", err);
    return res.status(500).json({ message: "Errore durante la purga utenti" });
  }
});

// GET /api/admin/ota-events?limit=100&phase=X&source=Y&platform=Z&updateId=W
// Lista eventi OTA persistiti su DB (ordinati dal più recente). Admin-only.
router.get("/ota-events", async (req: Request, res: Response) => {
  try {
    const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 100 : limitRaw, 1), 500);
    const phaseFilter = req.query.phase ? String(req.query.phase).substring(0, 32) : null;
    const sourceFilter = req.query.source ? String(req.query.source).substring(0, 32) : null;
    const platformFilter = req.query.platform ? String(req.query.platform).substring(0, 16) : null;
    const updateIdFilter = req.query.updateId ? String(req.query.updateId).substring(0, 64) : null;
    const deviceIdFilter = req.query.deviceId ? String(req.query.deviceId).substring(0, 64) : null;

    // Build WHERE clause fragments using sql template for type safety.
    const whereFragments = [
      phaseFilter ? sql`phase = ${phaseFilter}` : undefined,
      sourceFilter ? sql`source = ${sourceFilter}` : undefined,
      platformFilter ? sql`platform = ${platformFilter}` : undefined,
      updateIdFilter ? sql`current_update_id ILIKE ${"%" + updateIdFilter + "%"}` : undefined,
      deviceIdFilter ? sql`ip ILIKE ${"%" + deviceIdFilter + "%"}` : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    const whereSql = whereFragments.length > 0
      ? sql`WHERE ${sql.join(whereFragments, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT id, created_at, phase, source, platform, runtime_version, current_update_id, release_id, error, fail_count, ip, diagnostics
      FROM ota_events
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return res.json({ events: result.rows, limit, filters: { phase: phaseFilter, source: sourceFilter, platform: platformFilter, updateId: updateIdFilter, deviceId: deviceIdFilter } });
  } catch (err) {
    console.error("[OTA-EVENTS] read error:", err);
    return res.status(500).json({ message: "Errore lettura eventi OTA" });
  }
});

// GET /api/admin/ota-device-history?deviceId=X&limit=50
// Returns the full OTA timeline for a specific device (identified by device_id fingerprint).
// The most-recent event is used to derive the device's current update state.
router.get("/ota-device-history", async (req: Request, res: Response) => {
  try {
    const rawDeviceId = req.query.deviceId ? String(req.query.deviceId).trim().substring(0, 64) : null;
    if (!rawDeviceId) {
      return res.status(400).json({ message: "deviceId è obbligatorio" });
    }
    // Default: exact match. Pass fuzzy=true for contains-search (useful when
    // admins only have a partial device ID fragment).
    const fuzzy = req.query.fuzzy === "true";
    const pageRaw = parseInt(String(req.query.page ?? "1"), 10);
    const page = Math.max(isNaN(pageRaw) ? 1 : pageRaw, 1);
    const pageSizeRaw = parseInt(String(req.query.pageSize ?? "100"), 10);
    const pageSize = Math.min(Math.max(isNaN(pageSizeRaw) ? 100 : pageSizeRaw, 1), 500);
    const offset = (page - 1) * pageSize;

    const matchSql = fuzzy
      ? sql`device_id ILIKE ${"%" + rawDeviceId + "%"}`
      : sql`device_id = ${rawDeviceId}`;

    // Total count for pagination
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM ota_events WHERE ${matchSql}
    `);
    const totalCount = (countResult.rows[0] as { total: number }).total ?? 0;

    const result = await db.execute(sql`
      SELECT id, created_at, phase, source, platform, runtime_version, current_update_id, release_id, error, fail_count, ip, device_id, diagnostics
      FROM ota_events
      WHERE ${matchSql}
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const events = result.rows as Array<{
      id: string;
      created_at: string;
      phase: string;
      source: string | null;
      platform: string | null;
      runtime_version: string | null;
      current_update_id: string | null;
      release_id: string | null;
      error: string | null;
      fail_count: number;
      ip: string | null;
    }>;

    // currentState is always derived from the very first event (most recent)
    // regardless of pagination page so it stays stable as the user pages.
    let currentState = null;
    if (page === 1 && events.length > 0) {
      const first = events[0];
      currentState = {
        updateId: first.current_update_id,
        runtimeVersion: first.runtime_version,
        platform: first.platform,
        lastSeen: first.created_at,
        lastPhase: first.phase,
        lastError: first.error,
      };
    } else if (page > 1 && totalCount > 0) {
      // Fetch just the most-recent event for the current-state summary
      const latestResult = await db.execute(sql`
        SELECT phase, platform, runtime_version, current_update_id, error, created_at
        FROM ota_events
        WHERE ${matchSql}
        ORDER BY created_at DESC
        LIMIT 1
      `);
      if (latestResult.rows.length > 0) {
        const r = latestResult.rows[0] as {
          phase: string;
          platform: string | null;
          runtime_version: string | null;
          current_update_id: string | null;
          error: string | null;
          created_at: string;
        };
        currentState = {
          updateId: r.current_update_id,
          runtimeVersion: r.runtime_version,
          platform: r.platform,
          lastSeen: r.created_at,
          lastPhase: r.phase,
          lastError: r.error,
        };
      }
    }

    const totalPages = Math.ceil(totalCount / pageSize);

    return res.json({
      events,
      currentState,
      total: totalCount,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
      deviceId: rawDeviceId,
      fuzzy,
    });
  } catch (err) {
    console.error("[OTA-DEVICE-HISTORY] read error:", err);
    return res.status(500).json({ message: "Errore lettura storico dispositivo" });
  }
});

router.get("/startup-beacon", (_req: Request, res: Response) => {
  return res.json({
    count: startupBeacons.length,
    beacons: [...startupBeacons].reverse(),
  });
});

router.get("/ota-adoption", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        release_id,
        runtime_version,
        phase,
        platform,
        COUNT(*) AS event_count,
        COUNT(DISTINCT ip) AS unique_devices,
        MIN(created_at) AS first_seen,
        MAX(created_at) AS last_seen
      FROM ota_events
      WHERE release_id IS NOT NULL AND release_id <> ''
      GROUP BY release_id, runtime_version, phase, platform
      ORDER BY last_seen DESC
    `);
    const daily = await db.execute(sql`
      SELECT
        release_id,
        runtime_version,
        DATE_TRUNC('day', created_at) AS day,
        COUNT(DISTINCT ip) AS unique_devices
      FROM ota_events
      WHERE release_id IS NOT NULL AND release_id <> ''
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY release_id, runtime_version, day
      ORDER BY day ASC
    `);
    return res.json({ breakdown: result.rows, daily: daily.rows });
  } catch (err) {
    console.error("[OTA-ADOPTION] read error:", err);
    return res.status(500).json({ message: "Errore lettura adoption trends" });
  }
});

// GET /api/admin/ota-stats — adoption stats aggregated per update+platform.
// Groups ota_events by current_update_id/runtime_version/platform and returns
// ok_count (phase=reload), error_count (phase=error), unique device IPs, last seen.
router.get("/ota-stats", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        current_update_id,
        MIN(release_id) AS release_id,
        COALESCE(runtime_version, '?') AS runtime_version,
        COALESCE(platform, '?') AS platform,
        COUNT(*) FILTER (WHERE phase = 'reload') AS ok_count,
        COUNT(*) FILTER (WHERE phase = 'error') AS error_count,
        COUNT(DISTINCT ip) AS unique_devices,
        MAX(created_at) AS last_seen
      FROM ota_events
      WHERE current_update_id IS NOT NULL AND current_update_id <> ''
      GROUP BY
        current_update_id,
        COALESCE(runtime_version, '?'),
        COALESCE(platform, '?')
      ORDER BY last_seen DESC
      LIMIT 100
    `);
    return res.json({ stats: result.rows });
  } catch (err) {
    console.error("[OTA-STATS] read error:", err);
    return res.status(500).json({ message: "Errore lettura OTA stats" });
  }
});

// GET /api/admin/ota-stuck-events — lista eventi circuit-breaker (Task #1590)
// Filtrabile per runtimeVersion, ordinabile per data (sempre DESC).
router.get("/ota-stuck-events", async (req: Request, res: Response) => {
  try {
    const limitRaw = parseInt(String(req.query.limit ?? "200"), 10);
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 200 : limitRaw, 1), 500);
    const rvFilter = req.query.runtimeVersion
      ? String(req.query.runtimeVersion).substring(0, 32)
      : null;

    const whereSql = rvFilter
      ? sql`WHERE runtime_version = ${rvFilter}`
      : sql``;

    const result = await db.execute(sql`
      SELECT id, device_id, rollback_count, stuck_sessions, runtime_version, created_at
      FROM ota_stuck_events
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT device_id)::int AS unique_devices,
             COUNT(DISTINCT runtime_version)::int AS unique_rvs,
             MAX(created_at) AS last_event_at
      FROM ota_stuck_events
    `);

    const countRow = countResult.rows[0] as {
      total: number;
      unique_devices: number;
      unique_rvs: number;
      last_event_at: string | null;
    };

    return res.json({
      events: result.rows,
      total: countRow.total ?? 0,
      uniqueDevices: countRow.unique_devices ?? 0,
      uniqueRvs: countRow.unique_rvs ?? 0,
      lastEventAt: countRow.last_event_at ?? null,
      limit,
      filter: { runtimeVersion: rvFilter },
    });
  } catch (err) {
    console.error("[OTA-STUCK-EVENTS] read error:", err);
    return res.status(500).json({ message: "Errore lettura stuck events" });
  }
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

// GET /api/admin/users
// Returns the full user list for admin moderation purposes.
//
// INTENTIONAL EXCEPTION — map_visibility_filter does NOT apply here.
// map_visibility_filter is a user-facing privacy control that determines
// which users are visible to other *regular* users on the public map
// (options: "all" | "online_only" | "available_only"). Applying it to
// admin endpoints would hide suspended, offline, or ghost-mode users
// from moderators, breaking moderation workflows. Admins must always
// see the complete user roster regardless of visibility settings.
//
// Access is restricted to verified admin sessions via requireAdmin (see
// router.use(requireAdmin) above). No regular user can reach this route.
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

router.get("/users/stats/summary", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        userType: users.userType,
        sex: users.sex,
        isFake: users.isFake,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(and(ne(users.role, "admin"), ne(users.role, "moderator")))
      .groupBy(users.userType, users.sex, users.isFake);

    const sum = (type?: string, sex?: string | null, fake?: boolean) =>
      rows
        .filter((r) =>
          (type === undefined || r.userType === type) &&
          (sex === undefined || r.sex === sex) &&
          (fake === undefined || r.isFake === fake)
        )
        .reduce((s, r) => s + r.count, 0);

    return res.json({
      totale: {
        real: sum(undefined, undefined, false),
        fake: sum(undefined, undefined, true),
      },
      biker: {
        total: { real: sum("biker", undefined, false), fake: sum("biker", undefined, true) },
        M: { real: sum("biker", "M", false), fake: sum("biker", "M", true) },
        F: { real: sum("biker", "F", false), fake: sum("biker", "F", true) },
      },
      zavorrina: {
        total: { real: sum("zavorrina", undefined, false), fake: sum("zavorrina", undefined, true) },
        M: { real: sum("zavorrina", "M", false), fake: sum("zavorrina", "M", true) },
        F: { real: sum("zavorrina", "F", false), fake: sum("zavorrina", "F", true) },
      },
      coppia: {
        total: { real: sum("coppia", undefined, false), fake: sum("coppia", undefined, true) },
      },
    });
  } catch (err) {
    console.error("[admin] users stats summary error:", err);
    return res.status(500).json({ message: "Errore interno" });
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
    if (status === "suspended" || status === "blocked") {
      closeSseClient(id);
    }
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
    // Fail-closed: revoca PRIMA dell'update password. Se la revoca fallisce,
    // la password resta invariata: nessun gap di sicurezza.
    let revoked = 0;
    try {
      revoked = await revokeAllUserSessions(id);
    } catch (e) {
      console.error(`[ADMIN PASSWORD RESET] Session revocation failed for user ${id}:`, e);
      return res.status(500).json({
        message: "Errore temporaneo nella revoca delle sessioni. Riprova tra qualche istante.",
      });
    }
    // Terminate any open SSE chat stream so that a stolen session cannot
    // continue to receive private messages after password-reset revocation.
    closeSseClient(id);
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
      details: `Password resettata dall'admin (sessioni revocate: ${revoked})`,
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

    const totalUsersResult = await db.execute(sql`SELECT count(*)::int as count FROM users WHERE is_fake = false`);
    const totalUsers = (totalUsersResult.rows[0] as { count: number } | undefined)?.count ?? 0;

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
    const result = await db.execute(sql`SELECT id, nickname, user_type as "userType", sex, region, created_at as "createdAt" FROM users WHERE is_fake = false ORDER BY created_at DESC`);
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
    const result = await db.execute(sql`SELECT id, nickname, user_type as "userType", last_login_at as "lastLoginAt" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= ${since} ORDER BY last_login_at DESC`);
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics active-users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/online-now", async (_req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const result = await db.execute(sql`SELECT id, nickname, user_type as "userType", last_login_at as "lastLoginAt" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= ${fifteenMinutesAgo} ORDER BY last_login_at DESC`);
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics online-now error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/ad-clicks", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT ac.id, ac.user_id as "userId", u.nickname, u.user_type as "userType",
             camp.name as "adTitle", ac.created_at as "clickedAt"
      FROM ad_clicks ac
      LEFT JOIN users u ON ac.user_id = u.id
      LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
      ORDER BY ac.created_at DESC
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics ad-clicks error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/pending-reports", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT ft.id, ft.ticket_type as "type", ft.subject as "title", ft.message as "description",
             u.nickname as "submittedBy", ft.created_at as "createdAt"
      FROM feedback_tickets ft
      LEFT JOIN users u ON ft.user_id = u.id
      WHERE ft.status = 'open'
      ORDER BY ft.created_at DESC
    `);
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

// =============================================================================
// Task #56 — Diagnostica e osservabilità sistema email
// =============================================================================

// Stato completo invio email: credenziali, sorgente (db/env), esito ultimo invio
// reale (incluso messaggio di errore SMTP esatto se fallito).
router.get("/email-status", async (_req: Request, res: Response) => {
  try {
    const diag = await getEmailDiagnostics();
    return res.json(diag);
  } catch (error) {
    console.error("Get email status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// Invia un'email di test e ritorna il risultato strutturato (incluso errore SMTP
// completo se fallisce). Default destinatario: bikerlinkapp@gmail.com.
router.post("/email-test", async (req: Request, res: Response) => {
  try {
    const rawTo = typeof req.body?.to === "string" ? req.body.to.trim() : "";
    const to = rawTo || "bikerlinkapp@gmail.com";
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(to)) {
      return res.status(400).json({ ok: false, error: "Indirizzo email destinatario non valido" });
    }
    const subject = `BikerLink — Email di test (${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })})`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
        <h2 style="color:#FF6B35;">🏍️ BikerLink — Test invio email</h2>
        <p>Questo è un invio di test generato dal pannello admin per verificare che il transporter Gmail funzioni correttamente.</p>
        <p style="color:#666;font-size:12px;">Timestamp server: ${new Date().toISOString()}</p>
      </div>`;
    const result = await sendEmailDetailed(to, subject, html);
    return res.json(result);
  } catch (error) {
    console.error("Email test error:", error);
    return res.status(500).json({ ok: false, error: "Errore interno del server" });
  }
});

// Stato dei rate limiter coinvolti nella verifica email.
// Limit attuali: verify-email = 10/15min/IP, resend-verification = 5/h/IP,
// per-userId verifyAttempts = 5 fallimenti / 30min (oltre cancella i token).
router.get("/email-rate-limit-status", async (_req: Request, res: Response) => {
  try {
    const verifyEmailEntries: Array<{ ip: string; count: number; resetAt: string | null }> = [];
    const resendEntries: Array<{ ip: string; count: number; resetAt: string | null }> = [];

    // express-rate-limit MemoryStore espone `hits: Record<string, number>` e
    // `resetTime: Date`; in v7 le chiavi sono accessibili direttamente.
    const veStore = verifyEmailStore as unknown as { hits?: Record<string, number>; resetTime?: Date };
    const reStore = resendVerificationStore as unknown as { hits?: Record<string, number>; resetTime?: Date };

    for (const [ip, count] of Object.entries(veStore.hits ?? {})) {
      verifyEmailEntries.push({ ip, count, resetAt: veStore.resetTime?.toISOString() ?? null });
    }
    for (const [ip, count] of Object.entries(reStore.hits ?? {})) {
      resendEntries.push({ ip, count, resetAt: reStore.resetTime?.toISOString() ?? null });
    }

    const now = Date.now();
    const userLockouts: Array<{ userId: string; nickname?: string; count: number; firstAt: string; remainingMs: number; lockedOut: boolean }> = [];
    for (const [userId, entry] of verifyAttempts.entries()) {
      const elapsed = now - entry.firstAt;
      if (elapsed > VERIFY_ATTEMPT_WINDOW_MS) continue;
      const u = await storage.getUser(userId).catch(() => null);
      userLockouts.push({
        userId,
        nickname: u?.nickname,
        count: entry.count,
        firstAt: new Date(entry.firstAt).toISOString(),
        remainingMs: Math.max(0, VERIFY_ATTEMPT_WINDOW_MS - elapsed),
        lockedOut: entry.count >= VERIFY_MAX_ATTEMPTS,
      });
    }

    return res.json({
      verifyEmail: {
        max: VERIFY_EMAIL_MAX,
        windowMs: VERIFY_EMAIL_WINDOW_MS,
        entries: verifyEmailEntries,
      },
      resendVerification: {
        max: RESEND_VERIFICATION_MAX,
        windowMs: RESEND_VERIFICATION_WINDOW_MS,
        entries: resendEntries,
      },
      userLockouts: {
        max: VERIFY_MAX_ATTEMPTS,
        windowMs: VERIFY_ATTEMPT_WINDOW_MS,
        entries: userLockouts,
      },
    });
  } catch (error) {
    console.error("Email rate limit status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// Reset dei contatori in-memory dei rate limiter email.
// Body: { scope: 'verify' | 'resend' | 'user-lockouts' | 'all', ip?: string, userId?: string }
// - scope=verify  : reset rate limit /verify-email per IP (o tutti se ip non specificato)
// - scope=resend  : reset rate limit /resend-verification per IP (o tutti)
// - scope=user-lockouts : cancella verifyAttempts per userId (o tutti)
// - scope=all     : cancella tutto
router.post("/email-rate-limit-reset", async (req: Request, res: Response) => {
  try {
    const { scope, ip, userId } = req.body as { scope?: string; ip?: string; userId?: string };
    if (!scope) {
      return res.status(400).json({ message: "Parametro 'scope' richiesto" });
    }
    const validScopes = new Set(["verify", "resend", "user-lockouts", "all"]);
    if (!validScopes.has(scope)) {
      return res.status(400).json({ message: "Scope non valido. Usa: verify | resend | user-lockouts | all" });
    }

    const cleared: string[] = [];

    if (scope === "verify" || scope === "all") {
      if (ip) {
        await verifyEmailStore.resetKey(ip);
        cleared.push(`verifyEmail[${ip}]`);
      } else {
        await verifyEmailStore.resetAll();
        cleared.push("verifyEmail[*]");
      }
    }
    if (scope === "resend" || scope === "all") {
      if (ip) {
        await resendVerificationStore.resetKey(ip);
        cleared.push(`resendVerification[${ip}]`);
      } else {
        await resendVerificationStore.resetAll();
        cleared.push("resendVerification[*]");
      }
    }
    if (scope === "user-lockouts" || scope === "all") {
      if (userId) {
        clearVerifyAttempts(userId);
        cleared.push(`userLockout[${userId}]`);
      } else {
        verifyAttempts.clear();
        cleared.push("userLockouts[*]");
      }
    }

    console.log(`[admin] email rate limit reset: ${cleared.join(", ")}`);
    return res.json({ message: "Rate limit resettati", cleared });
  } catch (error) {
    console.error("Email rate limit reset error:", error);
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
    const allowedKeys = ["email_verification_enabled", "ads_enabled", "syneco_branding_visible", "donation_enabled", "donation_text", "gps_required", "marketplace_enabled", "fake_users_enabled", "ghost_mode_enabled", "phone_field_enabled", "user_available_on_login", "floating_widget_enabled", "units_preference_enabled"];

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
        const motoclubConvRows = await db
          .select({ conversationId: motoClubs.conversationId })
          .from(motoClubs)
          .where(sql`${motoClubs.conversationId} IS NOT NULL`);
        const motoclubConvIds = motoclubConvRows
          .map((r) => r.conversationId)
          .filter((id): id is string => id !== null && id !== undefined);
        if (motoclubConvIds.length > 0) {
          await db.delete(conversationParticipants)
            .where(and(
              inArray(conversationParticipants.conversationId, motoclubConvIds),
              inArray(conversationParticipants.userId, zavIds),
            ));
        }
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

router.put("/settings/match_preferences_visible", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("match_preferences_visible", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "match_preferences_visible",
      details: `match_preferences_visible = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin match_preferences_visible error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/search_preference_locked", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("search_preference_locked", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "search_preference_locked",
      details: `search_preference_locked = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin search_preference_locked error:", error);
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

router.put("/settings/primal_user_enabled", async (req: Request, res: Response) => {
  try {
    const { value } = req.body as { value: string };
    if (value !== "true" && value !== "false") {
      return res.status(400).json({ message: "Valore non valido: usare 'true' o 'false'" });
    }
    const setting = await storage.upsertAppSetting("primal_user_enabled", value);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "primal_user_enabled",
      details: `primal_user_enabled = ${value}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin primal_user_enabled error:", error);
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

/**
 * Delete an ad image file only when no other campaign still references it.
 * Pass the IDs of the campaign(s) being deleted/updated so they are excluded
 * from the reference check (they are about to lose their reference).
 * Both local-cache and object-storage copies are cleaned. Fire-and-forget safe.
 */
async function deleteAdImageIfUnreferenced(filename: string, excludeIds: string[]): Promise<void> {
  try {
    const imageUrl = `/api/ads/images/${filename}`;
    const conditions = [eq(adCampaignsTable.imageUrl, imageUrl)];
    if (excludeIds.length > 0) {
      conditions.push(notInArray(adCampaignsTable.id, excludeIds));
    }
    const refs = await db.select({ id: adCampaignsTable.id }).from(adCampaignsTable).where(and(...conditions));
    if (refs.length > 0) {
      console.log(`[Ads] Skipping delete of ${filename} — still referenced by ${refs.length} campaign(s)`);
      return;
    }
    const localPath = path.join(adsDir, filename);
    fs.unlink(localPath, (err) => {
      if (err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[Ads] Failed to remove cached image:", localPath, err.message);
      } else if (!err) {
        console.log(`[Ads] Deleted local cache: ${filename}`);
      }
    });
    deleteObject(`public/ads/${filename}`)
      .then(() => console.log(`[Ads] Deleted object storage: public/ads/${filename}`))
      .catch((err) => {
        console.warn("[Ads] Failed to remove object:", filename, (err as Error)?.message ?? err);
      });
  } catch (err) {
    console.warn("[Ads] deleteAdImageIfUnreferenced failed (non-fatal):", (err as Error)?.message ?? err);
  }
}

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
  const { compressToWebPOrPassGif } = await import("../utils/image-processing");
  const compressed = await compressToWebPOrPassGif(buffer, mimetype);
  const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
  const ext = compressed.mimeType === "image/gif" ? path.extname(originalname) : ".webp";
  const filename = uniqueSuffix + ext;
  const objectPath = `public/ads/${filename}`;
  console.log(`[uploadAdImageToObjectStorage] Uploading "${originalname}" → ${objectPath} (${compressed.buffer.length} bytes, ${compressed.mimeType})`);
  await uploadBuffer(objectPath, compressed.buffer, compressed.mimeType);
  console.log(`[uploadAdImageToObjectStorage] Upload OK → /api/ads/images/${filename}`);
  return `/api/ads/images/${filename}`;
}

const adUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
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

const BULK_AD_MAX_FILE_SIZE = 5 * 1024 * 1024;

interface BulkCampaignResult {
  id: string;
  name: string;
  imageUrl: string | null;
  targetUserType: string;
  isActive: boolean;
}

router.post("/advertisements/bulk", adUpload.array("images", 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Nessuna immagine ricevuta" });
    }
    const { baseName, targetUserType, displayDuration, linkUrl, groupId: externalGroupId, startIndex: startIndexStr, totalImages: totalImagesStr } = req.body as {
      baseName?: string;
      targetUserType?: string;
      displayDuration?: string;
      linkUrl?: string;
      groupId?: string;
      startIndex?: string;
      totalImages?: string;
    };
    if (!baseName?.trim()) {
      return res.status(400).json({ message: "Nome base campagna obbligatorio" });
    }
    const duration = parseInt(displayDuration ?? "10") || 10;
    const { randomUUID } = await import("crypto");
    const startIndex = parseInt(startIndexStr ?? "0") || 0;
    const totalImages = parseInt(totalImagesStr ?? "0") || files.length;
    const batchGroupId = externalGroupId?.trim() || (files.length > 1 ? randomUUID() : null);

    const BULK_CONCURRENCY = 10;
    const results = await allSettledLimited<BulkCampaignResult>(
      files.map((file, i) => async () => {
        if (file.size > BULK_AD_MAX_FILE_SIZE) {
          throw new Error(`${file.originalname} (troppo grande, max 5MB)`);
        }
        const globalIndex = startIndex + i;
        const campaignName =
          totalImages === 1
            ? baseName.trim()
            : `${baseName.trim()} #${globalIndex + 1}`;
        const imageUrl = await uploadAdImageToObjectStorage(file.buffer, file.originalname, file.mimetype);
        const campaign = await storage.createAdCampaign({
          name: campaignName,
          sponsor: "Syneco Lubrificanti",
          imageUrl,
          linkUrl: linkUrl?.trim() || null,
          displayMode: "banner",
          description: null,
          targetUserType: targetUserType || "biker",
          rotationDuration: duration,
          rotationMode: "sequential",
          sortOrder: 0,
          startDate: null,
          endDate: null,
          placement: "home",
          groupId: batchGroupId,
        });
        await storage.createModeratorLog({
          moderatorId: req.session.userId!,
          action: "create_advertisement",
          targetType: "campaign",
          targetId: campaign.id,
          details: `Bulk upload: ${campaign.name} (${targetUserType || "biker"})${batchGroupId ? ` gruppo=${batchGroupId}` : ""}`,
        });
        cacheAdImage(campaign.imageUrl).catch(() => {});
        return {
          id: campaign.id,
          name: campaign.name,
          imageUrl: campaign.imageUrl,
          targetUserType: campaign.targetUserType,
          isActive: campaign.isActive,
        } as BulkCampaignResult;
      }),
      BULK_CONCURRENCY
    );

    const created: BulkCampaignResult[] = [];
    const failedFiles: string[] = [];
    let failed = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        created.push(result.value);
      } else {
        failed++;
        const filename = files[i].originalname;
        console.error(`[bulk ad] Failed for "${filename}":`, result.reason);
        failedFiles.push(filename);
      }
    }

    return res.status(201).json({ created: created.length, failed, campaigns: created, failedFiles, groupId: batchGroupId });
  } catch (error) {
    console.error("Admin bulk advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/advertisements", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Nome campagna obbligatorio" });
    }
    let imageUrl: string | null = null;
    if (req.file) {
      imageUrl = await uploadAdImageToObjectStorage(req.file.buffer, req.file.originalname, req.file.mimetype);
    } else if (req.body.imageUrl) {
      if (!String(req.body.imageUrl).startsWith("/api/ads/images/")) {
        return res.status(400).json({ message: "imageUrl non valido: sono accettati solo percorsi interni" });
      }
      imageUrl = req.body.imageUrl;
    }
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
    cacheAdImage(campaign.imageUrl).catch(() => {});
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/advertisements/:id", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
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
    let oldImageUrl: string | null = null;
    if (req.file) {
      const existing = await storage.getAdCampaign(id);
      oldImageUrl = existing?.imageUrl ?? null;
      updates.imageUrl = await uploadAdImageToObjectStorage(req.file.buffer, req.file.originalname, req.file.mimetype);
      updates.imageVersion = ((existing?.imageVersion ?? 0) + 1);
    } else if (req.body.imageUrl !== undefined) {
      if (req.body.imageUrl !== null && req.body.imageUrl !== "" && !String(req.body.imageUrl).startsWith("/api/ads/images/")) {
        return res.status(400).json({ message: "imageUrl non valido: sono accettati solo percorsi interni" });
      }
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
    if (req.file || req.body.imageUrl !== undefined) {
      cacheAdImage(campaign.imageUrl).catch(() => {});
    }
    if (req.file && oldImageUrl && oldImageUrl !== updates.imageUrl) {
      const match = oldImageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (match) {
        const filename = match[1];
        if (filename && !filename.includes("..") && !filename.includes("/")) {
          // The campaign at `id` now uses the new URL, so exclude it from the
          // reference check — it is no longer a reference to the old filename.
          deleteAdImageIfUnreferenced(filename, [id]).catch(() => {});
        }
      }
    }
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/advertisements/bulk-delete", async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Array di ID campagne obbligatorio" });
    }
    const toDelete = await db.select().from(adCampaignsTable).where(inArray(adCampaignsTable.id, ids));
    await db.delete(adCampaignsTable).where(inArray(adCampaignsTable.id, ids));
    for (const campaign of toDelete) {
      if (campaign.imageUrl) {
        const match = campaign.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
        if (match) {
          const filename = match[1];
          if (filename && !filename.includes("..") && !filename.includes("/")) {
            // All campaigns in `ids` are being deleted; exclude them all so the
            // reference check considers only surviving campaigns.
            deleteAdImageIfUnreferenced(filename, ids).catch(() => {});
          }
        }
      }
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "bulk_delete_advertisements",
      targetType: "campaign",
      targetId: ids[0] ?? "bulk",
      details: `Eliminate ${ids.length} campagne in blocco`,
    });
    return res.json({ deleted: ids.length });
  } catch (error) {
    console.error("Admin bulk delete advertisements error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/advertisements/group/:groupId", async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { name, linkUrl, isActive } = req.body as { name?: string; linkUrl?: string; isActive?: boolean };
    if (!name?.trim()) {
      return res.status(400).json({ message: "Nome base obbligatorio" });
    }
    const { adCampaigns: adCampaignsTable } = await import("@shared/schema");
    const existing = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.groupId, groupId));
    if (existing.length === 0) {
      return res.status(404).json({ message: "Gruppo non trovato" });
    }
    const sorted = [...existing].sort((a, b) => {
      const numA = parseInt(a.name.match(/#(\d+)$/)?.[1] ?? "0");
      const numB = parseInt(b.name.match(/#(\d+)$/)?.[1] ?? "0");
      return numA - numB;
    });
    const updated = [];
    for (let i = 0; i < sorted.length; i++) {
      const newName = sorted.length === 1 ? name.trim() : `${name.trim()} #${i + 1}`;
      const updatePayload: Record<string, unknown> = { name: newName, linkUrl: linkUrl?.trim() || null };
      if (typeof isActive === "boolean") updatePayload.isActive = isActive;
      const [upd] = await db.update(adCampaignsTable)
        .set(updatePayload)
        .where(eq(adCampaignsTable.id, sorted[i].id))
        .returning();
      updated.push(upd);
    }
    const activeLabel = typeof isActive === "boolean" ? `, isActive=${isActive}` : "";
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_advertisement_group",
      targetType: "campaign",
      targetId: groupId,
      details: `Gruppo aggiornato: ${name.trim()} (${updated.length} campagne${activeLabel})`,
    });
    return res.json(updated);
  } catch (error) {
    console.error("Admin update advertisement group error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/advertisements/:id", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
    const campaign = await storage.getAdCampaign(id);
    await storage.deleteCampaign(id);
    if (campaign?.imageUrl) {
      const match = campaign.imageUrl.match(/\/api\/ads\/images\/([^?#]+)/);
      if (match) {
        const filename = match[1];
        if (filename && !filename.includes("..") && !filename.includes("/")) {
          // The campaign at `id` is gone; exclude it from the reference check.
          deleteAdImageIfUnreferenced(filename, [id]).catch(() => {});
        }
      }
    }
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

interface AdImageHealthState {
  brokenIds: string[];
  checkedAt: number | null;
  isRunning: boolean;
}

const adImageHealth: AdImageHealthState = {
  brokenIds: [],
  checkedAt: null,
  isRunning: false,
};

const AD_IMAGE_HEALTH_INTERVAL_MS = 15 * 60 * 1000;

async function runAdImageHealthCheck(): Promise<void> {
  if (adImageHealth.isRunning) return;
  adImageHealth.isRunning = true;
  console.log("[AdImageHealth] Avvio controllo immagini campagne attive...");
  try {
    const campaigns = await storage.getActiveCampaigns();
    const brokenIds: string[] = [];
    let checked = 0;
    for (const campaign of campaigns) {
      if (!campaign.imageUrl) continue;
      const match = campaign.imageUrl.match(/\/api\/ads\/images\/(.+)$/);
      if (!match) continue;
      const filename = match[1];
      checked++;
      const localPath = path.resolve(process.cwd(), "uploads", "ads", filename);
      const localExists = fs.existsSync(localPath);
      if (localExists) continue;
      const storageOk = await objectExists(`public/ads/${filename}`);
      if (!storageOk) {
        brokenIds.push(campaign.id);
        console.warn(`[AdImageHealth] Immagine rotta per campagna "${campaign.name}" (${campaign.id}): ${filename}`);
      }
    }
    adImageHealth.brokenIds = brokenIds;
    adImageHealth.checkedAt = Date.now();
    console.log(`[AdImageHealth] Controllo completato: ${brokenIds.length} immagini rotte su ${checked} campagne attive con immagine.`);
  } catch (err) {
    console.error("[AdImageHealth] Errore durante il controllo immagini:", err);
  } finally {
    adImageHealth.isRunning = false;
  }
}

setTimeout(() => { runAdImageHealthCheck().catch(() => {}); }, 30_000);
setInterval(() => { runAdImageHealthCheck().catch(() => {}); }, AD_IMAGE_HEALTH_INTERVAL_MS);

router.get("/advertisements/image-health", async (_req: Request, res: Response) => {
  return res.json({
    brokenIds: adImageHealth.brokenIds,
    checkedAt: adImageHealth.checkedAt ? new Date(adImageHealth.checkedAt).toISOString() : null,
    isRunning: adImageHealth.isRunning,
  });
});

router.post("/advertisements/image-health/check", async (_req: Request, res: Response) => {
  if (adImageHealth.isRunning) {
    return res.json({ message: "Controllo già in corso", isRunning: true });
  }
  runAdImageHealthCheck().catch(() => {});
  return res.json({ message: "Controllo avviato", isRunning: true });
});

router.get("/advertisements/cache-stats", async (_req: Request, res: Response) => {
  try {
    let count = 0;
    let totalBytes = 0;
    if (fs.existsSync(adsDir)) {
      const files = fs.readdirSync(adsDir);
      for (const file of files) {
        const filePath = path.join(adsDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            count++;
            totalBytes += stat.size;
          }
        } catch {
          // skip unreadable files
        }
      }
    }
    return res.json({ count, totalBytes });
  } catch (error) {
    console.error("cache-stats error:", error);
    return res.status(500).json({ error: "Errore lettura cache" });
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

    const distinctAuthorIds = [...new Set(rawLogs.map((l) => l.moderatorId))];
    const authorsResolved = await Promise.all(distinctAuthorIds.map((id) => storage.getUser(id)));
    const userMap = new Map<string, { id: string; nickname: string }>();
    const moderatorRoleIds = new Set<string>();
    for (const u of authorsResolved) {
      if (!u) continue;
      userMap.set(u.id, { id: u.id, nickname: u.nickname });
      if (u.role === "moderator") moderatorRoleIds.add(u.id);
    }

    const moderatorOnlyLogs = rawLogs.filter((l) => moderatorRoleIds.has(l.moderatorId));

    let filtered = moderatorOnlyLogs;
    if (filterModeratorId) filtered = filtered.filter((l) => l.moderatorId === filterModeratorId);
    if (filterAction) filtered = filtered.filter((l) => l.action === filterAction);

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    const targetUserIdsToResolve = new Set<string>();
    for (const log of paginated) {
      if (log.targetType === "user" && log.targetId && !userMap.has(log.targetId)) {
        targetUserIdsToResolve.add(log.targetId);
      }
    }
    if (targetUserIdsToResolve.size > 0) {
      const targetUsers = await Promise.all([...targetUserIdsToResolve].map((id) => storage.getUser(id)));
      for (const u of targetUsers) {
        if (u) userMap.set(u.id, { id: u.id, nickname: u.nickname });
      }
    }

    const allModeratorsInFull = [...new Set(moderatorOnlyLogs.map((l) => l.moderatorId))];

    const enriched = paginated.map((log) => ({
      ...log,
      moderatorNickname: userMap.get(log.moderatorId)?.nickname ?? log.moderatorId,
      targetUserNickname: log.targetType === "user" && log.targetId ? (userMap.get(log.targetId)?.nickname ?? log.targetId) : null,
    }));

    const moderatorProfiles = allModeratorsInFull
      .map((id) => userMap.get(id) ?? { id, nickname: id });
    const allActions = [...new Set(moderatorOnlyLogs.map((l) => l.action))];

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

router.delete("/moderator-logs", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const deletedCount = await storage.clearModeratorLogs();
    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "clear_moderator_logs",
      targetType: "system",
      targetId: null,
      details: `Log moderatori svuotati (${deletedCount} righe)`,
    });
    return res.json({ message: "Log moderatori svuotati", deletedCount });
  } catch (error) {
    console.error("Admin delete moderator-logs error:", error);
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
    // Task #1078: password random non condivisa, non persistita altrove. Gli account
    // fake sono comunque bloccati al login da auth.ts (isFake check) — questo è
    // defense-in-depth nel caso quel guard venga rimosso accidentalmente in futuro.
    const fakeSecret = (await import("node:crypto")).randomBytes(32).toString("base64url");
    const hashedPassword = await bcrypt.hash(fakeSecret, 10);
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
    // Strip null bytes — PostgreSQL rejects them even in parameterised queries.
    const rawId = paramStr(req.params.id);
    if (rawId === null) return res.status(400).json({ message: "ID utente non valido" });
    const userId = rawId.replace(/\x00/g, "");
    if (!userId) {
      return res.status(400).json({ message: "ID utente non valido" });
    }
    const userResult = await db.execute(sql`
      SELECT u.id, u.nickname, u.email, u.user_type as "userType", u.role, u.status,
             u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
             u.last_logout_at as "lastLogoutAt", u.last_app_close_at as "lastAppCloseAt",
             u.ghost_mode as "ghostMode",
             u.is_fake as "isFake", u.is_primal as "isPrimal",
             up.total_km as "totalKm", up.total_rides as "totalRides",
             up.is_available as "isAvailable", up.bio,
             up.latitude, up.longitude
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = ${userId}
    `);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const user = userResult.rows[0];

    const [proposalsResult, conversationsResult, messagesResult, adClicksResult, reportsResult, motorcyclesResult] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int as count FROM proposals WHERE user_id = ${userId}`),
      db.execute(sql`SELECT COUNT(*)::int as count FROM conversation_participants WHERE user_id = ${userId}`),
      db.execute(sql`SELECT COUNT(*)::int as count FROM messages WHERE sender_id = ${userId}`),
      db.execute(sql`
        SELECT ac.id, camp.name as "adTitle", ac.created_at as "clickedAt"
        FROM ad_clicks ac
        LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
        WHERE ac.user_id = ${userId}
        ORDER BY ac.created_at DESC
        LIMIT 20
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as "filed",
               (SELECT COUNT(*)::int FROM reports WHERE reported_user_id = ${userId}) as "received"
        FROM reports WHERE reporter_id = ${userId}
      `),
      db.execute(sql`
        SELECT brand, model, year, displacement, motorcycle_type as "motorcycleType", riding_style as "ridingStyle"
        FROM user_motorcycles WHERE user_id = ${userId}
      `),
    ]);

    const loginHistory = await db.execute(sql`
      SELECT ml.action, ml.created_at as "createdAt", m.nickname as "moderatorNickname"
      FROM moderator_logs ml
      LEFT JOIN users m ON ml.moderator_id = m.id
      WHERE ml.target_id = ${userId}
      ORDER BY ml.created_at DESC
      LIMIT 20
    `);

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

// ── Geo Insight (admin only): on-demand, in-RAM, no persistence ────────
// Calcola al volo le 3 zone geografiche più frequentate dell'utente
// partendo dai dati già in coordinate_history. Algoritmo:
//   1) raggruppa record consecutivi entro ~400m in "sessioni stazionarie"
//   2) tiene solo sessioni con durata > 45 minuti
//   3) clustering greedy k=3 sui centroidi delle sessioni (max-min init)
//   4) ordina per minuti totali (H = casa, W = lavoro, P = pub)
const FZ_RADIUS_M = 400;
const FZ_MIN_SESSION_MIN = 45;
const FZ_MAX_GAP_MIN = 90; // se la pausa fra due record supera questa soglia, sessione chiusa
const FZ_KMEANS_ITER = 8;

function _hav(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface FzSession {
  lat: number;
  lng: number;
  weight: number; // minuti totali
  count: number; // numero di record
}

function _toMs(v: Date | string | number): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function _detectStationarySessions(
  rows: Array<{ latitude: number; longitude: number; createdAt: Date | string }>,
): FzSession[] {
  if (rows.length === 0) return [];
  const sessions: FzSession[] = [];
  let curLat = rows[0].latitude;
  let curLng = rows[0].longitude;
  let curStart = _toMs(rows[0].createdAt);
  let curEnd = curStart;
  let curCount = 1;
  let curSumLat = rows[0].latitude;
  let curSumLng = rows[0].longitude;

  const closeSession = () => {
    const minutes = (curEnd - curStart) / 60000;
    if (minutes >= FZ_MIN_SESSION_MIN) {
      sessions.push({
        lat: curSumLat / curCount,
        lng: curSumLng / curCount,
        weight: minutes,
        count: curCount,
      });
    }
  };

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ts = _toMs(r.createdAt);
    const gapMin = (ts - curEnd) / 60000;
    const dist = _hav(curLat, curLng, r.latitude, r.longitude);
    if (dist <= FZ_RADIUS_M && gapMin <= FZ_MAX_GAP_MIN) {
      curSumLat += r.latitude;
      curSumLng += r.longitude;
      curCount += 1;
      curLat = curSumLat / curCount;
      curLng = curSumLng / curCount;
      curEnd = ts;
    } else {
      closeSession();
      curLat = r.latitude;
      curLng = r.longitude;
      curStart = ts;
      curEnd = ts;
      curCount = 1;
      curSumLat = r.latitude;
      curSumLng = r.longitude;
    }
  }
  closeSession();
  return sessions;
}

function _kmeansK3(sessions: FzSession[]): Array<{ lat: number; lng: number; weight: number; count: number }> {
  if (sessions.length === 0) return [];
  if (sessions.length <= 3) {
    return sessions.map((s) => ({ lat: s.lat, lng: s.lng, weight: s.weight, count: s.count }));
  }

  // Init max-min: parti dalla sessione con peso massimo, poi scegli i 2 centroidi
  // più lontani da quelli già scelti.
  const sortedByWeight = [...sessions].sort((a, b) => b.weight - a.weight);
  const centers: Array<{ lat: number; lng: number }> = [
    { lat: sortedByWeight[0].lat, lng: sortedByWeight[0].lng },
  ];
  while (centers.length < 3) {
    let bestIdx = -1;
    let bestMinDist = -1;
    for (let i = 0; i < sessions.length; i++) {
      let minD = Infinity;
      for (const c of centers) {
        const d = _hav(c.lat, c.lng, sessions[i].lat, sessions[i].lng);
        if (d < minD) minD = d;
      }
      if (minD > bestMinDist) {
        bestMinDist = minD;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    centers.push({ lat: sessions[bestIdx].lat, lng: sessions[bestIdx].lng });
  }

  // Itera Lloyd con peso (= durata in minuti)
  let assign: number[] = new Array(sessions.length).fill(0);
  for (let it = 0; it < FZ_KMEANS_ITER; it++) {
    let changed = false;
    for (let i = 0; i < sessions.length; i++) {
      let bestK = 0;
      let bestD = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const d = _hav(centers[k].lat, centers[k].lng, sessions[i].lat, sessions[i].lng);
        if (d < bestD) {
          bestD = d;
          bestK = k;
        }
      }
      if (assign[i] !== bestK) {
        assign[i] = bestK;
        changed = true;
      }
    }
    // Ricalcolo centroidi (media pesata per durata)
    const sums = centers.map(() => ({ wLat: 0, wLng: 0, w: 0 }));
    for (let i = 0; i < sessions.length; i++) {
      const k = assign[i];
      sums[k].wLat += sessions[i].lat * sessions[i].weight;
      sums[k].wLng += sessions[i].lng * sessions[i].weight;
      sums[k].w += sessions[i].weight;
    }
    for (let k = 0; k < centers.length; k++) {
      if (sums[k].w > 0) {
        centers[k] = { lat: sums[k].wLat / sums[k].w, lng: sums[k].wLng / sums[k].w };
      }
    }
    if (!changed) break;
  }

  // Aggrega risultati per cluster.
  // count = numero di sessioni stazionarie (visite) finite in questo cluster,
  // NON il numero di record GPS grezzi.
  const clusters = centers.map(() => ({ lat: 0, lng: 0, weight: 0, count: 0 }));
  const wSums = centers.map(() => ({ wLat: 0, wLng: 0, w: 0, c: 0 }));
  for (let i = 0; i < sessions.length; i++) {
    const k = assign[i];
    wSums[k].wLat += sessions[i].lat * sessions[i].weight;
    wSums[k].wLng += sessions[i].lng * sessions[i].weight;
    wSums[k].w += sessions[i].weight;
    wSums[k].c += 1;
  }
  for (let k = 0; k < centers.length; k++) {
    if (wSums[k].w > 0) {
      clusters[k] = {
        lat: wSums[k].wLat / wSums[k].w,
        lng: wSums[k].wLng / wSums[k].w,
        weight: wSums[k].w,
        count: wSums[k].c,
      };
    }
  }
  return clusters.filter((c) => c.weight > 0);
}

router.get("/users/:id/geo-insights", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id);
    const { coordinateHistory } = await import("@shared/schema");
    const rows = await db
      .select({
        latitude: coordinateHistory.latitude,
        longitude: coordinateHistory.longitude,
        createdAt: coordinateHistory.createdAt,
      })
      .from(coordinateHistory)
      .where(eq(coordinateHistory.userId, userId))
      .orderBy(coordinateHistory.createdAt);

    if (rows.length === 0) {
      return res.json([]);
    }

    const sessions = _detectStationarySessions(rows);
    if (sessions.length === 0) {
      return res.json([]);
    }

    const clusters = _kmeansK3(sessions);
    if (clusters.length === 0) {
      return res.json([]);
    }

    // Ordina per minuti totali (durata) discendente; H=longest, W=second, P=third
    clusters.sort((a, b) => b.weight - a.weight);
    const labels: Array<"H" | "W" | "P"> = ["H", "W", "P"];
    const zones = clusters.slice(0, 3).map((c, i) => ({
      type: labels[i],
      lat: Number(c.lat.toFixed(6)),
      lng: Number(c.lng.toFixed(6)),
      visitCount: c.count,
      totalMinutes: Math.round(c.weight),
    }));

    return res.json(zones);
  } catch (error) {
    console.error("Admin geo-insights error:", error);
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
    const { eq, and, isNull, sql } = await import("drizzle-orm");
    await storage.upsertAppSetting("fake_users_enabled", enabled ? "true" : "false");
    const newLoginAt = enabled ? new Date() : new Date("2020-01-01");
    await db.update(userProfiles)
      .set({ isAvailable: enabled })
      .where(
        sql`${userProfiles.userId} IN (SELECT id FROM users WHERE is_fake = true)`
      );
    await db.update(usersTable)
      .set({ lastLoginAt: newLoginAt })
      .where(eq(usersTable.isFake, true));
    if (enabled) {
      await db.update(usersTable)
        .set({ country: "IT" })
        .where(and(eq(usersTable.isFake, true), isNull(usersTable.country)));
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(usersTable)
      .where(eq(usersTable.isFake, true));
    return res.json({ message: `Tutti gli stregatti sono stati ${enabled ? "abilitati" : "disabilitati"}`, count: Number(count) });
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
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
    await storage.deleteFakeUser(id);
    return res.json({ message: "Stregatto eliminato" });
  } catch (error) {
    console.error("Admin delete stregatto error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/stregatti/:id/toggle-available", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
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
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
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
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
    const convs = await storage.getFakeUserConversations(id);
    return res.json(convs);
  } catch (error) {
    console.error("Admin get stregatto conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/stregatti/all-conversations", async (req: Request, res: Response) => {
  try {
    const fakeUsersResult = await db.select({ id: users.id })
      .from(users)
      .where(and(eq(users.isFake, true), ne(users.nickname, "BikerLink_Official")));
    const fakeUserCount = fakeUsersResult.length;

    let deleted = 0;
    if (fakeUserCount > 0) {
      const fakeUserIds = fakeUsersResult.map(u => u.id);

      const PARAM_CHUNK = 500;
      const allConvIds = new Set<string>();
      for (let i = 0; i < fakeUserIds.length; i += PARAM_CHUNK) {
        const chunk = fakeUserIds.slice(i, i + PARAM_CHUNK);
        const rows = await db.selectDistinct({ convId: conversationParticipants.conversationId })
          .from(conversationParticipants)
          .where(inArray(conversationParticipants.userId, chunk));
        for (const r of rows) allConvIds.add(r.convId);
      }

      const convIds = [...allConvIds];
      deleted = convIds.length;

      const CHUNK = 500;
      for (let i = 0; i < convIds.length; i += CHUNK) {
        const chunk = convIds.slice(i, i + CHUNK);
        await db.delete(messages).where(inArray(messages.conversationId, chunk));
        await db.delete(conversationParticipants).where(inArray(conversationParticipants.conversationId, chunk));
        await db.delete(conversations).where(inArray(conversations.id, chunk));
      }
    }

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_all_fake_chats",
      targetType: "system",
      targetId: "all",
      details: `Eliminate globalmente ${deleted} conversazioni di ${fakeUserCount} utenti fake`,
    });
    return res.json({ deleted, users: fakeUserCount, message: `${deleted} conversazioni eliminate` });
  } catch (error) {
    console.error("Admin delete all fake conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/stregatti/:id/conversations", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
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
    const convId = paramStr(req.params.convId);
    if (convId === null) return res.status(400).json({ message: "ID conversazione non valido" });
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

    const [club] = await db.select({ conversationId: motoClubs.conversationId })
      .from(motoClubs)
      .where(eq(motoClubs.id, clubId))
      .limit(1);
    if (club?.conversationId) {
      await db.delete(conversationParticipants)
        .where(and(
          eq(conversationParticipants.conversationId, club.conversationId),
          eq(conversationParticipants.userId, userId),
        ));
    }

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
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
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
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
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
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID non valido" });
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
      details: `Backup DB su Object Storage: ${result.name} (${result.size} bytes)`,
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
      details: `Backup media su Object Storage: ${result.name} (${result.size} bytes)`,
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

router.get("/backup/download/:type", async (req: Request, res: Response) => {
  try {
    const type = req.params.type;
    if (type !== "db" && type !== "media") {
      return res.status(400).json({ message: "type deve essere 'db' o 'media'" });
    }
    const { getLastBackupMeta } = await import("../backup-service");
    const meta = await getLastBackupMeta(type);
    if (!meta || !meta.objectPath) {
      return res.status(404).json({ message: "Nessun backup disponibile" });
    }
    const buf = await downloadBuffer(meta.objectPath);
    const fileName = meta.fileName
      || meta.objectPath.split("/").pop()
      || (type === "db" ? "bikerlink_db.sql.gz" : "bikerlink_media.zip");
    const contentType = type === "db" ? "application/gzip" : "application/zip";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.end(buf);
  } catch (error: any) {
    console.error("Admin backup download error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il download del backup" });
  }
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

router.get("/sync-status", async (_req: Request, res: Response) => {
  try {
    const { getSyncStatus } = await import("../sync-service");
    return res.json(await getSyncStatus());
  } catch (error) {
    console.error("Admin sync-status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/sync-prod-to-dev", async (req: Request, res: Response) => {
  try {
    const { syncProdToDev, isSyncAvailable } = await import("../sync-service");
    if (!isSyncAvailable()) {
      return res.status(403).json({ message: "Sync non disponibile: controllare PROD_DATABASE_URL o verificare l'ambiente" });
    }
    // Avvio asincrono: risponde subito con 202, il sync gira in background
    // Il client può interrogare /sync-status per seguire l'avanzamento
    const moderatorId = req.session.userId!;
    syncProdToDev().then(async (result) => {
      if (result.ok) {
        await storage.createModeratorLog({
          moderatorId,
          action: "sync_prod_to_dev",
          targetType: "system",
          targetId: "database",
          details: "Sync manuale produzione → sviluppo completato",
        }).catch(() => {});
      }
    }).catch((err) => {
      console.error("Admin sync-prod-to-dev background error:", err);
    });
    return res.status(202).json({ ok: true, message: "Sync avviato — usa /sync-status per seguire l'avanzamento" });
  } catch (error: any) {
    console.error("Admin sync-prod-to-dev error:", error);
    return res.status(500).json({ message: error.message || "Errore interno del server" });
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

    if (allFakeBikers.length > 0) {
      // Fetch all motorcycles for all fake bikers in one query (JOIN avoids large IN list)
      const allFakeBikerMotos = await db.select({ userId: userMotorcycles.userId, brand: userMotorcycles.brand })
        .from(userMotorcycles)
        .innerJoin(users, and(eq(userMotorcycles.userId, users.id), eq(users.isFake, true), sql`${users.userType} IN ('biker', 'coppia')`));

      // Group brands by userId
      const brandsByUser = new Map<string, string[]>();
      for (const row of allFakeBikerMotos) {
        if (!brandsByUser.has(row.userId)) brandsByUser.set(row.userId, []);
        brandsByUser.get(row.userId)!.push(row.brand);
      }

      // Resolve brand clubs (one query per distinct brand, cached)
      const brandClubsCache = new Map<string, { id: string }[]>();
      const distinctBrands = [...new Set(allFakeBikerMotos.map(r => r.brand.toLowerCase()))];
      for (const brandKey of distinctBrands) {
        const clubs = await db.select({ id: motoClubs.id })
          .from(motoClubs)
          .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "brand"), ilike(motoClubs.brandName!, brandKey)));
        brandClubsCache.set(brandKey, clubs);
      }

      // Build all club-join rows without any per-user DB calls
      const clubJoinRows: { clubId: string; userId: string; role: string; status: string }[] = [];
      for (const u of allFakeBikers) {
        const brands = brandsByUser.get(u.id) || [];
        const seenClubIds = new Set<string>();
        for (const brand of brands) {
          const clubs = brandClubsCache.get(brand.toLowerCase()) || [];
          for (const club of clubs) {
            if (seenClubIds.has(club.id)) continue;
            seenClubIds.add(club.id);
            clubJoinRows.push({ clubId: club.id, userId: u.id, role: "member", status: "active" });
          }
        }
      }

      // Bulk insert in chunks
      const CLUB_CHUNK = 500;
      for (let i = 0; i < clubJoinRows.length; i += CLUB_CHUNK) {
        const result = await db.insert(motoClubMembers)
          .values(clubJoinRows.slice(i, i + CLUB_CHUNK))
          .onConflictDoNothing()
          .returning({ id: motoClubMembers.id });
        clubJoins += result.length;
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

    // Leggi gli ultimi 20 errori OTA dal DB (sopravvive ai riavvii del backend).
    // Fallback sull'array in memoria in caso di errore DB.
    let otaErrorsFromDb: OtaErrorEntry[] = [];
    try {
      const dbOtaResult = await db.execute(sql`
        SELECT error, fail_count, current_update_id, runtime_version, phase, source, platform, created_at
        FROM ota_events
        WHERE error NOT LIKE 'ok:%'
        ORDER BY created_at DESC
        LIMIT 20
      `);
      otaErrorsFromDb = dbOtaResult.rows.map((r) => ({
        error: String(r.error ?? ""),
        failCount: Number(r.fail_count ?? 0),
        updateId: String(r.current_update_id ?? "unknown"),
        runtimeVersion: String(r.runtime_version ?? "unknown"),
        phase: r.phase ? String(r.phase) : undefined,
        source: r.source ? String(r.source) : undefined,
        platform: r.platform ? String(r.platform) : undefined,
        timestamp: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
      }));
    } catch (dbErr) {
      console.error("[system-health] DB OTA errors read failed, using in-memory:", dbErr);
      otaErrorsFromDb = otaErrors.slice().reverse().filter((e) => !e.error.startsWith("ok:")).slice(0, 20);
    }

    return res.json({
      backendStartedAt: SERVER_START_TIME,
      backendUptimeSec,
      metroOnline: uptimeState.metroOnline,
      metroStartedAt: uptimeState.metroStartTime,
      metroUptimeSec,
      events,
      otaErrors: otaErrorsFromDb,
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
    // Task #1123: sanitize the version string before composing the object path.
    // The resulting path must satisfy isValidOtaBundlePath (regex
    // /^private\/ota\/[A-Za-z0-9._-]+\.js$/) so that the matching insert+serve
    // gates accept it. Strip any character outside [A-Za-z0-9._-] to defeat
    // path-traversal attempts via ?version=../foo and to keep filenames
    // round-trip safe through downstream URL/path joins.
    const rawVersion = (req.query.version as string) || "unknown";
    const safeVersion = rawVersion.replace(/[^A-Za-z0-9._-]/g, "_").substring(0, 64) || "unknown";
    const filename = `ota-${safeVersion}-${Date.now()}.js`;
    const objectPath = `private/ota/${filename}`;
    if (!isValidOtaBundlePath(objectPath)) {
      console.error("[OTA] Upload rejected: composed path failed validator:", objectPath);
      return res.status(400).json({ message: "Nome bundle non valido" });
    }
    await uploadBuffer(objectPath, req.file.buffer, "application/javascript");
    return res.json({ url: objectPath, filename });
  } catch (error) {
    console.error("[OTA] Upload error:", error);
    return res.status(500).json({ message: "Errore upload bundle" });
  }
});

router.post("/ota", async (req: Request, res: Response) => {
  try {
    const { version, bundlePath, releaseNotes, runtimeVersion } = req.body;
    if (!version || !bundlePath) return res.status(400).json({ message: "version e bundlePath obbligatori" });
    if (!runtimeVersion) return res.status(400).json({ message: "runtimeVersion obbligatorio" });
    // Task #1123: PRIMARY GATE — refuse to insert any release whose
    // bundle_path is not a legitimate `private/ota/<file>.js` produced by
    // /ota/upload. Without this an admin (or attacker with an admin session)
    // could pass `bundlePath: ".private/backups/db.sql"` and the unauth'd
    // /api/expo-updates/assets/:releaseId route would happily download it
    // through the privileged storage client. See objectStorage.ts.
    if (!isValidOtaBundlePath(bundlePath)) {
      return res.status(400).json({
        message: "bundlePath non valido: deve corrispondere a private/ota/<file>.js prodotto da /api/admin/ota/upload",
      });
    }
    const result = await db.execute(sql`
      INSERT INTO ota_releases (version, runtime_version, bundle_path, release_notes, status, created_by)
      VALUES (${version}, ${runtimeVersion}, ${bundlePath}, ${releaseNotes || null}, 'draft', ${req.session.userId ?? null})
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
    // Task #1355: Do NOT globally deactivate other active releases.
    // Multiple releases can be active simultaneously (one per slot).
    // Just activate this release. If the caller also wants to assign a slot,
    // they must call /api/admin/ota/assign-slot afterwards (or use assignSlot body param).
    const { assignSlot } = req.body ?? {};

    if (assignSlot && !/^(stable|previous-stable|test-\d+)$/.test(assignSlot)) {
      return res.status(400).json({ message: "assignSlot non valido. Formati ammessi: stable, test-1, test-2, ..." });
    }

    let result: { rows: unknown[] } = { rows: [] };
    try {
      result = await db.transaction(async (tx) => {
        if (assignSlot) {
          // Clear previous occupant of the target slot (set to archived)
          await tx.execute(sql`UPDATE ota_releases SET slot = 'archived', status = 'archived', updated_at = NOW() WHERE slot = ${assignSlot} AND id != ${id}`);
          return tx.execute(sql`UPDATE ota_releases SET status = 'active', slot = ${assignSlot}, published_at = NOW(), updated_at = NOW() WHERE id = ${id} RETURNING *`);
        } else {
          return tx.execute(sql`UPDATE ota_releases SET status = 'active', published_at = NOW(), updated_at = NOW() WHERE id = ${id} RETURNING *`);
        }
      });
    } catch (txErr) {
      throw txErr;
    }

    if (!result.rows.length) return res.status(404).json({ message: "Release non trovata" });
    // Invalida l'intera cache hash dei manifest /api/expo-updates: la release
    // appena pubblicata potrebbe avere lo stesso releaseId di una entry vecchia
    // (impossibile in pratica, UUID), ma soprattutto rimuove vecchie inactive
    // che restavano in cache occupando memoria. Best-effort.
    try {
      const inv = req.app.locals.invalidateExpoUpdateHash;
      if (typeof inv === "function") inv();
    } catch (e) {
      console.error("[OTA] cache invalidate failed:", e);
    }
    // Logga l'evento di publish nella timeline ota_events.
    try {
      const row = result.rows[0] as { id?: string; runtime_version?: string; version?: string };
      await db.insert(otaEvents).values({
        phase: "admin-publish",
        source: "admin",
        platform: "android",
        runtimeVersion: (row.runtime_version ?? "?").substring(0, 32),
        releaseId: row.id ? String(row.id).substring(0, 64) : undefined,
        error: `ok:published version=${row.version ?? "?"}`,
        failCount: 0,
      });
    } catch (e) {
      console.error("[OTA] event log on publish failed:", e);
    }
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

// ── OTA Publish Token management (Task #1770) ──────────────────────────────
// Tutti e tre gli endpoint richiedono sessione admin (requireAdmin globale).
// Il token generato viene restituito in plaintext UNA SOLA VOLTA.

// POST /api/admin/ota/token — genera un nuovo token OTA
router.post("/ota/token", async (req: Request, res: Response) => {
  try {
    const label = typeof req.body?.label === "string" ? req.body.label.substring(0, 100) : "default";
    const expiresInDays = typeof req.body?.expiresInDays === "number" ? req.body.expiresInDays : 365;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const [row] = await db.insert(otaPublishTokens).values({
      tokenHash,
      label,
      expiresAt,
    }).returning({
      id: otaPublishTokens.id,
      label: otaPublishTokens.label,
      createdAt: otaPublishTokens.createdAt,
      expiresAt: otaPublishTokens.expiresAt,
    });
    // Restituisce il token in chiaro UNA SOLA VOLTA — non viene mai risalvato
    return res.status(201).json({ ...row, token: rawToken });
  } catch (err) {
    console.error("[OTA-TOKEN] generate error:", err);
    return res.status(500).json({ message: "Errore generazione token" });
  }
});

// GET /api/admin/ota/tokens — lista token (senza hash, senza plaintext)
router.get("/ota/tokens", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: otaPublishTokens.id,
        label: otaPublishTokens.label,
        createdAt: otaPublishTokens.createdAt,
        expiresAt: otaPublishTokens.expiresAt,
        lastUsedAt: otaPublishTokens.lastUsedAt,
        revoked: otaPublishTokens.revoked,
      })
      .from(otaPublishTokens)
      .orderBy(desc(otaPublishTokens.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error("[OTA-TOKEN] list error:", err);
    return res.status(500).json({ message: "Errore lista token" });
  }
});

// DELETE /api/admin/ota/token/:id — revoca token
router.delete("/ota/token/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "id non valido" });
    const [updated] = await db
      .update(otaPublishTokens)
      .set({ revoked: true })
      .where(eq(otaPublishTokens.id, id))
      .returning({ id: otaPublishTokens.id });
    if (!updated) return res.status(404).json({ message: "Token non trovato" });
    return res.json({ ok: true, id: updated.id });
  } catch (err) {
    console.error("[OTA-TOKEN] revoke error:", err);
    return res.status(500).json({ message: "Errore revoca token" });
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

const ALLOWED_LANGS = new Set(["en", "de", "es", "fr", "el", "tr"]);

const LANG_FILE_MAP: Record<string, string> = {
  en: path.resolve(process.cwd(), "lib/i18n/en.ts"),
  de: path.resolve(process.cwd(), "lib/i18n/de.ts"),
  es: path.resolve(process.cwd(), "lib/i18n/es.ts"),
  fr: path.resolve(process.cwd(), "lib/i18n/fr.ts"),
  el: path.resolve(process.cwd(), "lib/i18n/el.ts"),
  tr: path.resolve(process.cwd(), "lib/i18n/tr.ts"),
};

const LANG_LABELS: Record<string, string> = {
  en: "Inglese (EN)",
  de: "Tedesco (DE)",
  es: "Spagnolo (ES)",
  fr: "Francese (FR)",
  el: "Greco (EL)",
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

router.get("/translations/download-docx", async (req: Request, res: Response) => {
  try {
    const langsParam = ((req.query.langs as string) || "").trim();
    const langs = langsParam
      ? langsParam.split(",").filter((l) => ALLOWED_LANGS.has(l.trim())).map((l) => l.trim())
      : Array.from(ALLOWED_LANGS);

    const { keyMap } = TRANSLATIONS_STAGING;
    if (Object.keys(keyMap).length === 0) {
      return res.status(400).json({ message: "Esegui prima 'Prepara generazione'" });
    }

    const ACCENT = "FF6600";
    const WHITE = "FFFFFF";
    const DARK = "1E1E1E";

    function makeHeaderCell(text: string): TableCell {
      return new TableCell({
        shading: { type: ShadingType.SOLID, color: ACCENT, fill: ACCENT },
        width: { size: 2000, type: WidthType.DXA },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text, bold: true, color: WHITE, size: 18 })],
          }),
        ],
      });
    }

    function makeCell(text: string): TableCell {
      return new TableCell({
        width: { size: 2000, type: WidthType.DXA },
        children: [
          new Paragraph({
            children: [new TextRun({ text, size: 16, color: DARK })],
          }),
        ],
      });
    }

    const headerRow = new TableRow({
      tableHeader: true,
      height: { value: 400, rule: HeightRule.ATLEAST },
      children: [
        makeHeaderCell("Chiave"),
        makeHeaderCell("Posizione"),
        makeHeaderCell("IT"),
        ...langs.map((l) => makeHeaderCell(l.toUpperCase())),
      ],
    });

    const dataRows = Object.entries(keyMap).map(([key, val]) =>
      new TableRow({
        children: [
          makeCell(key),
          makeCell(val.position),
          makeCell(val.it),
          ...langs.map(() => makeCell("")),
        ],
      })
    );

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: `BikerLink Traduzioni — ${new Date().toISOString().slice(0, 10)}`,
                  bold: true,
                  size: 28,
                  color: ACCENT,
                }),
              ],
            }),
            new Paragraph({ children: [new TextRun({ text: "" })] }),
            table,
          ],
        },
      ],
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const filename = `BikerLink_Traduzioni_${new Date().toISOString().slice(0, 10)}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(docxBuffer);
  } catch (error) {
    console.error("[translations/download-docx] error:", error);
    return res.status(500).json({ message: "Errore durante il download DOCX" });
  }
});


router.get("/translations/table", async (_req: Request, res: Response) => {
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
        keyMap[key] = { position: buildKeyPositionLabel(key), it: itText };
      }
    }

    const langValues: Record<string, Record<string, string>> = {};
    for (const lang of Array.from(ALLOWED_LANGS)) {
      langValues[lang] = {};
      try {
        const content = fs.readFileSync(LANG_FILE_MAP[lang], "utf-8");
        const kvRegex = /^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/gm;
        let m: RegExpExecArray | null;
        while ((m = kvRegex.exec(content)) !== null) {
          const val = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          langValues[lang][m[1]] = val;
        }
      } catch {
        // file missing or unreadable, leave empty
      }
    }

    const rows = Object.entries(keyMap).map(([key, val]) => ({
      key,
      position: val.position,
      it: val.it,
      en: langValues["en"][key] ?? "",
      de: langValues["de"][key] ?? "",
      es: langValues["es"][key] ?? "",
      fr: langValues["fr"][key] ?? "",
      el: langValues["el"][key] ?? "",
      tr: langValues["tr"][key] ?? "",
    }));

    return res.json(rows);
  } catch (error) {
    console.error("[translations/table] error:", error);
    return res.status(500).json({ message: "Errore durante il caricamento della tabella" });
  }
});

router.patch("/translations/key", async (req: Request, res: Response) => {
  try {
    const { key, lang, value } = req.body as { key?: string; lang?: string; value?: string };
    if (!key || typeof key !== "string") {
      return res.status(400).json({ message: "key mancante" });
    }
    if (!lang || !ALLOWED_LANGS.has(lang)) {
      return res.status(400).json({ message: "lang non valido (en, de, es, fr, el, tr)" });
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      return res.status(400).json({ message: "value mancante o vuoto" });
    }
    const filePath = LANG_FILE_MAP[lang];
    const changed = applyTranslationsToFile(filePath, { [key]: value.trim() });
    return res.json({ ok: true, changed });
  } catch (error) {
    console.error("[translations/key] error:", error);
    return res.status(500).json({ message: "Errore durante il salvataggio" });
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

router.post("/translations/ai-complete", async (_req: Request, res: Response) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: "OPENAI_API_KEY non configurata. Aggiungila nei Secrets di Replit." });
    }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

    const itPath = path.resolve(process.cwd(), "lib/i18n/it.ts");
    const itRaw = fs.readFileSync(itPath, "utf-8");
    const keyLineRegex = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/;

    const itMap: Record<string, string> = {};
    for (const line of itRaw.split("\n")) {
      const m = line.match(keyLineRegex);
      if (m) {
        itMap[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
    }

    const LANG_NAMES: Record<string, string> = {
      en: "English",
      de: "German",
      es: "Spanish",
      fr: "French",
      el: "Greek",
      tr: "Turkish",
    };

    const BATCH_SIZE = 80;
    const summary: Record<string, number> = {};

    for (const lang of Array.from(ALLOWED_LANGS)) {
      const filePath = LANG_FILE_MAP[lang];
      const existing: Record<string, string> = {};

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const kvRegex = /^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/gm;
        let m: RegExpExecArray | null;
        while ((m = kvRegex.exec(content)) !== null) {
          const val = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          existing[m[1]] = val;
        }
      }

      const missingKeys = Object.keys(itMap).filter((k) => !existing[k]?.trim());
      if (missingKeys.length === 0) {
        summary[lang] = 0;
        continue;
      }

      const allTranslations: Record<string, string> = {};

      for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
        const batch = missingKeys.slice(i, i + BATCH_SIZE);
        const payload: Record<string, string> = {};
        for (const k of batch) payload[k] = itMap[k];

        const systemPrompt = `You are a professional app translator. Translate the given key-value pairs from Italian to ${LANG_NAMES[lang]}. The values are UI strings for a motorcycle social app called BikerLink. Preserve any special markers like {name}, {count}, {brand} etc. Return ONLY a valid JSON object with the same keys and translated values. No explanation, no markdown, just the JSON object.`;
        const userPrompt = `Translate these Italian strings to ${LANG_NAMES[lang]}:\n${JSON.stringify(payload, null, 2)}`;

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
          });

          const raw = completion.choices[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(raw) as Record<string, string>;
          for (const k of batch) {
            if (parsed[k] && typeof parsed[k] === "string" && parsed[k].trim()) {
              allTranslations[k] = parsed[k].trim();
            }
          }
        } catch (batchErr) {
          console.error(`[translations/ai-complete] batch error for ${lang}:`, batchErr);
        }
      }

      const changed = applyTranslationsToFile(filePath, allTranslations);
      summary[lang] = changed;
    }

    const totalChanged = Object.values(summary).reduce((a, b) => a + b, 0);
    const summaryText = Object.entries(summary)
      .map(([l, n]) => `${l.toUpperCase()}: ${n}`)
      .join(", ");

    return res.json({
      ok: true,
      summary,
      totalChanged,
      message: totalChanged > 0
        ? `Completate ${totalChanged} traduzioni → ${summaryText}`
        : "Nessuna traduzione mancante trovata",
    });
  } catch (error: any) {
    console.error("[translations/ai-complete] error:", error);
    return res.status(500).json({ message: error?.message || "Errore durante il completamento AI" });
  }
});

const docxImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime =
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "application/zip";
    const okExt = /\.docx$/i.test(file.originalname || "");
    if (okMime || okExt) cb(null, true);
    else cb(new Error("Formato file non valido: serve .docx"));
  },
});

function escapeI18nValue(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n");
}

function applyTranslationsToFile(filePath: string, updates: Record<string, string>): number {
  if (!fs.existsSync(filePath)) return 0;
  const original = fs.readFileSync(filePath, "utf-8");
  const lines = original.split("\n");
  let changed = 0;
  const lineRegex = /^(\s*")([^"]+)("\s*:\s*")((?:[^"\\]|\\.)*)("\s*,?\s*)$/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(lineRegex);
    if (!m) continue;
    const key = m[2];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
    const newValRaw = updates[key];
    if (typeof newValRaw !== "string" || newValRaw.length === 0) continue;
    const newValEsc = escapeI18nValue(newValRaw);
    if (newValEsc === m[4]) continue;
    lines[i] = `${m[1]}${m[2]}${m[3]}${newValEsc}${m[5]}`;
    changed++;
  }

  if (changed > 0) {
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  }
  return changed;
}

type ParsedDocxRow = string[];

async function parseDocxTable(buffer: Buffer): Promise<ParsedDocxRow[]> {
  const JSZip = (await import("jszip")).default;
  const { XMLParser } = await import("fast-xml-parser");

  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("DOCX non valido: word/document.xml mancante");
  const xml = await docFile.async("string");

  const parser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: false,
    parseTagValue: false,
    trimValues: false,
    isArray: (name) => ["w:tbl", "w:tr", "w:tc", "w:p", "w:r", "w:t"].includes(name),
  });
  const parsed = parser.parse(xml);

  const body = parsed?.["w:document"]?.["w:body"];
  if (!body) throw new Error("DOCX non valido: body mancante");
  const tables = body["w:tbl"];
  if (!Array.isArray(tables) || tables.length === 0) {
    throw new Error("Nessuna tabella trovata nel DOCX");
  }

  const tbl = tables[0];
  const rows = tbl["w:tr"] || [];
  const out: ParsedDocxRow[] = [];

  function extractCellText(cell: any): string {
    const paragraphs = cell["w:p"] || [];
    const paraTexts: string[] = [];
    for (const p of paragraphs) {
      const runs = p["w:r"] || [];
      let runText = "";
      for (const r of runs) {
        const ts = r["w:t"] || [];
        for (const t of ts) {
          if (typeof t === "string") runText += t;
          else if (t && typeof t === "object" && "#text" in t) runText += String(t["#text"] ?? "");
        }
      }
      paraTexts.push(runText);
    }
    return paraTexts.join("\n");
  }

  for (const row of rows) {
    const cells = row["w:tc"] || [];
    out.push(cells.map(extractCellText));
  }
  return out;
}

router.post(
  "/translations/import-docx",
  (req: Request, res: Response, next) => {
    docxImportUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "File non valido";
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: "File DOCX mancante" });

      let rows: ParsedDocxRow[];
      try {
        rows = await parseDocxTable(req.file.buffer);
      } catch (e: any) {
        return res.status(400).json({ message: e?.message || "Impossibile leggere il file DOCX" });
      }

      if (rows.length < 2) {
        return res.status(400).json({ message: "Tabella vuota o priva di righe dati" });
      }

      const header = rows[0].map((h) => (h || "").trim());
      const langColumns: { lang: string; col: number }[] = [];
      for (let i = 0; i < header.length; i++) {
        const code = header[i].toLowerCase().slice(0, 2);
        if (ALLOWED_LANGS.has(code)) {
          langColumns.push({ lang: code, col: i });
        }
      }
      if (langColumns.length === 0) {
        return res.status(400).json({
          message: "Header tabella non riconosciuto: nessuna colonna lingua valida (EN, DE, ES, FR, EL, TR)",
        });
      }

      const keyCol = 0;
      const updatesByLang: Record<string, Record<string, string>> = {};
      for (const { lang } of langColumns) updatesByLang[lang] = {};

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const key = (row[keyCol] || "").trim();
        if (!key) continue;
        for (const { lang, col } of langColumns) {
          const cell = row[col];
          if (typeof cell !== "string") continue;
          const val = cell.replace(/\r\n/g, "\n").trim();
          if (!val) continue;
          updatesByLang[lang][key] = val;
        }
      }

      const langCounts: Record<string, number> = {};
      for (const lang of Array.from(ALLOWED_LANGS)) {
        langCounts[lang] = 0;
      }
      for (const { lang } of langColumns) {
        const filePath = LANG_FILE_MAP[lang];
        const count = applyTranslationsToFile(filePath, updatesByLang[lang]);
        langCounts[lang] = count;
      }

      const summary = Object.entries(langCounts)
        .map(([l, n]) => `${l.toUpperCase()}: ${n}`)
        .join(", ");

      return res.json({
        ok: true,
        langCounts,
        message: `Stringhe aggiornate → ${summary}`,
      });
    } catch (error: any) {
      console.error("[translations/import-docx] error:", error);
      return res.status(500).json({ message: error?.message || "Errore durante l'import DOCX" });
    }
  }
);

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


router.get("/settings/show-distance-counter", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("show_distance_in_online_counter");
    return res.json({ enabled: setting?.value !== "false" });
  } catch (error) {
    console.error("Get show-distance-counter error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.patch("/settings/show-distance-counter", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled deve essere un booleano" });
    }
    await storage.upsertAppSetting("show_distance_in_online_counter", enabled ? "true" : "false");
    return res.json({ enabled });
  } catch (error) {
    console.error("Update show-distance-counter error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// Privacy rules (admin-controlled global toggles)
// - show_distance_in_online_counter: also exposed via /settings/show-distance-counter
// - offline_position_randomize_default: global kill-switch; when false, offline coords are NOT fuzzed
// - map_visibility_filter: "all" | "online_only" | "available_only" — filters map results
router.get("/privacy-rules", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [distance, offlineRandom, mapFilter] = await Promise.all([
      storage.getAppSetting("show_distance_in_online_counter"),
      storage.getAppSetting("offline_position_randomize_default"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    return res.json({
      showDistanceInCounter: distance?.value !== "false",
      offlinePositionRandomize: offlineRandom?.value !== "false",
      mapVisibilityFilter: (mapFilter?.value as "all" | "online_only" | "available_only") || "all",
    });
  } catch (error) {
    console.error("Get privacy-rules error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.patch("/privacy-rules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { showDistanceInCounter, offlinePositionRandomize, mapVisibilityFilter } = req.body as {
      showDistanceInCounter?: boolean;
      offlinePositionRandomize?: boolean;
      mapVisibilityFilter?: string;
    };
    const validFilters = ["all", "online_only", "available_only"];
    if (showDistanceInCounter !== undefined) {
      if (typeof showDistanceInCounter !== "boolean") {
        return res.status(400).json({ message: "showDistanceInCounter deve essere un booleano" });
      }
      await storage.upsertAppSetting("show_distance_in_online_counter", showDistanceInCounter ? "true" : "false");
    }
    if (offlinePositionRandomize !== undefined) {
      if (typeof offlinePositionRandomize !== "boolean") {
        return res.status(400).json({ message: "offlinePositionRandomize deve essere un booleano" });
      }
      await storage.upsertAppSetting("offline_position_randomize_default", offlinePositionRandomize ? "true" : "false");
    }
    if (mapVisibilityFilter !== undefined) {
      if (!validFilters.includes(mapVisibilityFilter)) {
        return res.status(400).json({ message: "mapVisibilityFilter non valido" });
      }
      await storage.upsertAppSetting("map_visibility_filter", mapVisibilityFilter);
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "setting",
      targetId: "privacy_rules",
      details: "Regole di privacy aggiornate",
    });
    return res.json({ message: "Regole di privacy aggiornate" });
  } catch (error) {
    console.error("Update privacy-rules error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/native-version", async (req: Request, res: Response) => {
  try {
    const { android, ios } = req.body as {
      android: { latestVersion: string; minVersion: string; storeUrl: string };
      ios: { latestVersion: string; minVersion: string; storeUrl: string };
    };
    if (!android || !ios) {
      return res.status(400).json({ message: "Payload non valido: android e ios richiesti" });
    }
    const semverRe = /^\d+\.\d+\.\d+$/;
    const urlRe = /^https:\/\/.+/;
    const validate = (p: typeof android, name: string) => {
      if (!semverRe.test(p.latestVersion)) throw new Error(`${name}.latestVersion non valido (formato X.Y.Z richiesto)`);
      if (!semverRe.test(p.minVersion)) throw new Error(`${name}.minVersion non valido (formato X.Y.Z richiesto)`);
      if (!urlRe.test(p.storeUrl)) throw new Error(`${name}.storeUrl non valido (URL https:// richiesto)`);
    };
    try {
      validate(android, "android");
      validate(ios, "ios");
    } catch (e: unknown) {
      return res.status(400).json({ message: e instanceof Error ? e.message : "Payload non valido" });
    }
    await Promise.all([
      storage.upsertAppSetting("native_android_latest", android.latestVersion),
      storage.upsertAppSetting("native_android_min", android.minVersion),
      storage.upsertAppSetting("native_android_store_url", android.storeUrl),
      storage.upsertAppSetting("native_ios_latest", ios.latestVersion),
      storage.upsertAppSetting("native_ios_min", ios.minVersion),
      storage.upsertAppSetting("native_ios_store_url", ios.storeUrl),
    ]);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "native_version_config",
      details: `Android ${android.latestVersion}/${android.minVersion}, iOS ${ios.latestVersion}/${ios.minVersion}`,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("Admin native-version update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// Protected by router.use(requireAdmin) above — only admins can access
router.get("/settings/version-distribution", async (_req: Request, res: Response) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [androidLatest, androidMin, iosLatest, iosMin] = await Promise.all([
      storage.getAppSetting("native_android_latest"),
      storage.getAppSetting("native_android_min"),
      storage.getAppSetting("native_ios_latest"),
      storage.getAppSetting("native_ios_min"),
    ]);
    const config = {
      android: {
        latestVersion: androidLatest?.value || "1.0.0",
        minVersion: androidMin?.value || "1.0.0",
      },
      ios: {
        latestVersion: iosLatest?.value || "1.0.0",
        minVersion: iosMin?.value || "1.0.0",
      },
    };

    const rows = await db
      .select({
        platform: users.lastPlatform,
        version: users.lastAppVersion,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(users)
      .where(
        and(
          sql`${users.lastLoginAt} IS NOT NULL`,
          sql`${users.lastLoginAt} >= ${sevenDaysAgo}`,
          sql`${users.lastAppVersion} IS NOT NULL`,
          sql`${users.lastPlatform} IS NOT NULL`,
        ),
      )
      .groupBy(users.lastPlatform, users.lastAppVersion);

    const compareSemver = (a: string, b: string): number => {
      const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
      const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
      const [aMaj = 0, aMin = 0, aPatch = 0] = pa;
      const [bMaj = 0, bMin = 0, bPatch = 0] = pb;
      if (aMaj !== bMaj) return aMaj - bMaj;
      if (aMin !== bMin) return aMin - bMin;
      return aPatch - bPatch;
    };
    const semverRe = /^\d+\.\d+\.\d+$/;

    let totalTracked = 0;
    let underMin = 0;
    let underLatest = 0;
    const byPlatformVersion = rows
      .filter((r) => r.platform && r.version)
      .map((r) => {
        const platform = String(r.platform);
        const version = String(r.version);
        const count = Number(r.count) || 0;
        totalTracked += count;
        if (semverRe.test(version) && (platform === "android" || platform === "ios")) {
          const cfg = platform === "android" ? config.android : config.ios;
          if (compareSemver(version, cfg.minVersion) < 0) underMin += count;
          else if (compareSemver(version, cfg.latestVersion) < 0) underLatest += count;
        }
        return { platform, version, count };
      })
      .sort((a, b) => {
        if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
        return compareSemver(b.version, a.version);
      });

    return res.json({
      totalTracked,
      underMin,
      underLatest,
      config,
      byPlatformVersion,
      windowDays: 7,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("version-distribution error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/gps-rejections", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const minCount = Math.max(Number(req.query.min_count) || 1, 1);
    const [rows, thresholdSetting] = await Promise.all([
      db
        .select({
          userId: gpsRejectionStats.userId,
          deviceId: gpsRejectionStats.deviceId,
          platform: gpsRejectionStats.platform,
          nickname: users.nickname,
          email: users.email,
          lastOtaNumber: gpsRejectionStats.lastOtaNumber,
          rejectionCount: gpsRejectionStats.rejectionCount,
          lastRejectedPayload: gpsRejectionStats.lastRejectedPayload,
          lastRejectedAt: gpsRejectionStats.lastRejectedAt,
          lastSource: gpsRejectionStats.lastSource,
        })
        .from(gpsRejectionStats)
        .leftJoin(users, eq(gpsRejectionStats.userId, users.id))
        .where(sql`${gpsRejectionStats.rejectionCount} >= ${minCount}`)
        .orderBy(desc(gpsRejectionStats.rejectionCount))
        .limit(limit),
      storage.getAppSetting("gps_rejection_alert_threshold"),
    ]);
    const alertThreshold = thresholdSetting?.value ? Number(thresholdSetting.value) : 100;
    return res.json({ stats: rows, total: rows.length, alertThreshold: Number.isNaN(alertThreshold) ? 100 : alertThreshold });
  } catch (error) {
    console.error("GPS rejections fetch error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

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

let cacheCleanupRunning = false;

// POST /admin/cache/cleanup — avvia scripts/cleanup-cache.sh in background
router.post("/cache/cleanup", async (_req: Request, res: Response) => {
  try {
    if (cacheCleanupRunning) {
      return res.status(409).json({ error: "cleanup_already_running" });
    }
    cacheCleanupRunning = true;
    const { spawn } = await import("child_process");
    const scriptPath = path.join(process.cwd(), "scripts", "cleanup-cache.sh");
    const child = spawn("bash", [scriptPath], { detached: true, stdio: "ignore" });
    child.on("close", () => {
      cacheCleanupRunning = false;
    });
    child.on("error", (err) => {
      console.error("[CACHE-CLEANUP] Errore avvio script:", err);
      cacheCleanupRunning = false;
    });
    child.unref();
    return res.json({ started: true });
  } catch (error) {
    cacheCleanupRunning = false;
    console.error("Admin cache cleanup error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/db/table-sizes", async (_req: Request, res: Response) => {
  try {
    const { VACUUM_TABLES, isVacuumRunning, VACUUM_LAST_RUN_SETTING_KEY, VACUUM_DETAIL_SETTING_KEY } = await import("../vacuum-service");
    const valuesClause = sql.join(VACUUM_TABLES.map((t) => sql`(${t})`), sql`, `);
    const result = await db.execute(sql`
      SELECT
        t.name,
        COALESCE(pg_relation_size(to_regclass(t.name)), 0)       AS relation_size,
        COALESCE(pg_total_relation_size(to_regclass(t.name)), 0) AS total_size
      FROM (VALUES ${valuesClause}) AS t(name)
    `);
    const rows = (result.rows as { name: string; relation_size: string | number; total_size: string | number }[]).map((r) => ({
      name: r.name,
      sizeBytes: typeof r.relation_size === "number" ? r.relation_size : parseInt(String(r.relation_size ?? "0"), 10),
      totalSizeBytes: typeof r.total_size === "number" ? r.total_size : parseInt(String(r.total_size ?? "0"), 10),
    }));
    const orderedRows = VACUUM_TABLES.map((t) => rows.find((r) => r.name === t) ?? { name: t, sizeBytes: 0, totalSizeBytes: 0 });
    const [lastVacuumSetting, detailSetting] = await Promise.all([
      storage.getAppSetting(VACUUM_LAST_RUN_SETTING_KEY),
      storage.getAppSetting(VACUUM_DETAIL_SETTING_KEY),
    ]);
    let lastVacuumDetail: { table: string; bytesBefore: number; bytesAfter: number }[] | null = null;
    if (detailSetting?.value) {
      try {
        lastVacuumDetail = JSON.parse(detailSetting.value);
      } catch {
        lastVacuumDetail = null;
      }
    }
    return res.json({
      tables: orderedRows,
      isRunning: isVacuumRunning(),
      lastVacuum: lastVacuumSetting?.value ?? null,
      lastVacuumDetail,
    });
  } catch (error) {
    console.error("Admin db/table-sizes error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/db/vacuum-full", async (_req: Request, res: Response) => {
  try {
    const { isVacuumRunning, runVacuumFullAll } = await import("../vacuum-service");
    if (isVacuumRunning()) {
      return res.status(409).json({ error: "vacuum_already_running" });
    }
    runVacuumFullAll().catch((err) => {
      console.error("[VACUUM] Errore nel giro manuale da endpoint admin:", err);
    });
    return res.json({ started: true });
  } catch (error) {
    console.error("Admin vacuum-full error:", error);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// GET /api/admin/blocks?search=&page=1&limit=20
// Lista di tutti i blocchi tra utenti. Supporta ricerca per nickname e paginazione.
router.get("/blocks", async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const pageRaw = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const page = Math.max(1, isNaN(pageRaw) ? 1 : pageRaw);
    const limit = Math.max(1, Math.min(isNaN(limitRaw) ? 20 : limitRaw, 100));
    const result = await storage.getAdminBlocks({ search, page, limit });
    return res.json(result);
  } catch (err) {
    console.error("[ADMIN BLOCKS] get error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// DELETE /api/admin/blocks/:id
// Rimuove un blocco specifico per ID.
router.delete("/blocks/:id", async (req: Request, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    if (id === null) return res.status(400).json({ message: "ID blocco mancante" });
    const deleted = await storage.deleteBlockById(id);
    if (!deleted) return res.status(404).json({ message: "Blocco non trovato" });
    return res.json({ deleted: true });
  } catch (err) {
    console.error("[ADMIN BLOCKS] delete error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── GET /api/admin/newsletter/subscribers ─────────────────────────────────
// Lista iscritti alla newsletter con paginazione. Admin-only.
router.get("/newsletter/subscribers", async (req: Request, res: Response) => {
  try {
    const pageRaw = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const page = Math.max(1, isNaN(pageRaw) ? 1 : pageRaw);
    const limit = Math.max(1, Math.min(isNaN(limitRaw) ? 50 : limitRaw, 200));
    const offset = (page - 1) * limit;

    const countResult = await db.execute(sql`SELECT COUNT(*) AS cnt FROM newsletter_subscribers`);
    const total = Number((countResult.rows[0] as { cnt: string }).cnt);

    const rows = await db.execute(sql`
      SELECT id, email, notify_rides, created_at
      FROM newsletter_subscribers
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return res.json({
      total,
      page,
      limit,
      subscribers: rows.rows.map((r) => ({
        id: r.id as number,
        email: r.email as string,
        notifyRides: r.notify_rides as boolean,
        createdAt: r.created_at as string,
      })),
    });
  } catch (err) {
    console.error("[ADMIN NEWSLETTER] list error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── GET /api/admin/newsletter/subscribers/export ───────────────────────────
// Esporta la lista iscritti come CSV. Admin-only.
router.get("/newsletter/subscribers/export", async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT email, notify_rides, created_at
      FROM newsletter_subscribers
      ORDER BY created_at DESC
    `);

    const lines: string[] = ["email,notify_rides,created_at"];
    for (const r of rows.rows) {
      const email = String(r.email ?? "").replace(/"/g, '""');
      const notifyRides = r.notify_rides ? "true" : "false";
      const createdAt = r.created_at ? new Date(String(r.created_at)).toISOString() : "";
      lines.push(`"${email}",${notifyRides},${createdAt}`);
    }

    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="newsletter_subscribers_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("[ADMIN NEWSLETTER] export error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// GET /api/admin/match-settings
// Restituisce la visibilità globale delle preferenze di matching + statistiche aggregate per tipo
router.get("/match-settings", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("match_preferences_visible");
    const visible = setting?.value === "true";

    // Aggregate stats per match type
    const totalUsersRow = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM users WHERE is_fake = false AND role != 'admin' AND status = 'active'
    `);
    const totalUsers = parseInt(String((totalUsersRow.rows[0] as { cnt: string }).cnt ?? "0"), 10);

    const prefCountsRow = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE mp.biker_biker_brand = false) as bb_brand_off,
        COUNT(*) FILTER (WHERE mp.biker_zavorrina_brand = false) as bz_brand_off,
        COUNT(*) FILTER (WHERE mp.biker_club_brand = false) as biker_club_off,
        COUNT(*) FILTER (WHERE mp.zavorrina_club_brand = false) as zav_club_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_type_style = false) as bb_type_off,
        COUNT(*) FILTER (WHERE mp.biker_zavorrina_type_style = false) as bz_type_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_distance = false) as bb_dist_off,
        COUNT(*) FILTER (WHERE mp.biker_zavorrina_distance = false) as bz_dist_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_music = false) as bb_music_off,
        COUNT(*) FILTER (WHERE mp.biker_zavorrina_music = false) as bz_music_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_lean_angle = false) as bb_lean_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_route_type_zone = false) as bb_zone_off,
        COUNT(*) FILTER (WHERE mp.biker_zavorrina_route_type_zone = false) as bz_zone_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_avg_speed = false) as bb_speed_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_avg_duration = false) as bb_dur_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_day_time = false) as bb_day_off,
        COUNT(*) FILTER (WHERE mp.biker_biker_events = false) as bb_events_off
      FROM match_preferences mp
      JOIN users u ON u.id = mp.user_id
      WHERE u.is_fake = false AND u.role != 'admin' AND u.status = 'active'
    `);
    const pc = prefCountsRow.rows[0] as Record<string, string>;
    const activeOf = (offKey: string) => totalUsers - parseInt(String(pc[offKey] ?? "0"), 10);

    const bbMatchCountsRow = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE motorcycle_brand NOT LIKE 'tipo%' AND motorcycle_brand NOT LIKE 'club%' AND motorcycle_brand NOT LIKE 'distanza%' AND motorcycle_brand NOT LIKE 'musica%' AND motorcycle_brand NOT LIKE 'gps%' AND motorcycle_brand NOT LIKE 'zona%' AND motorcycle_brand NOT LIKE 'eventi%') as brand_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'club:%') as biker_club_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'club_zav:%') as zav_club_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'tipo:%') as bb_type_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'tipo_zav:%') as bz_type_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand = 'distanza') as bb_dist_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand = 'distanza_zav') as bz_dist_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand = 'musica') as bb_music_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand = 'musica_zav') as bz_music_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand = 'gps_tilt') as bb_lean_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'zona_bb:%') as bb_zone_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'zona_zav:%') as bz_zone_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand IN ('gps_speed','gps_full')) as bb_speed_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand IN ('gps_speed','gps_full')) as bb_dur_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand = 'gps_day') as bb_day_cnt,
        COUNT(*) FILTER (WHERE motorcycle_brand = 'eventi') as bb_events_cnt
      FROM biker_biker_matches
    `);
    const bbc = bbMatchCountsRow.rows[0] as Record<string, string>;

    const bzTotalRow = await db.execute(sql`SELECT COUNT(*) as cnt FROM biker_zavorrina_matches`);
    const bzTotal = parseInt(String((bzTotalRow.rows[0] as { cnt: string }).cnt ?? "0"), 10);

    const stats = [
      { typeKey: "bikerBikerBrand", typeName: "Biker-Biker Brand", usersActive: activeOf("bb_brand_off"), totalMatches: parseInt(bbc.brand_cnt ?? "0", 10) },
      { typeKey: "bikerZavorrinaBrand", typeName: "Biker-Zavarrina Brand", usersActive: activeOf("bz_brand_off"), totalMatches: bzTotal },
      { typeKey: "bikerClubBrand", typeName: "Biker-Club Brand", usersActive: activeOf("biker_club_off"), totalMatches: parseInt(bbc.biker_club_cnt ?? "0", 10) },
      { typeKey: "zavarrinaClubBrand", typeName: "Zavarrina-Club Brand", usersActive: activeOf("zav_club_off"), totalMatches: parseInt(bbc.zav_club_cnt ?? "0", 10) },
      { typeKey: "bikerBikerTypeStyle", typeName: "Biker-Biker Tipo+Stile", usersActive: activeOf("bb_type_off"), totalMatches: parseInt(bbc.bb_type_cnt ?? "0", 10) },
      { typeKey: "bikerZavarrinaTypeStyle", typeName: "Biker-Zavarrina Tipo+Stile", usersActive: activeOf("bz_type_off"), totalMatches: parseInt(bbc.bz_type_cnt ?? "0", 10) },
      { typeKey: "bikerBikerDistance", typeName: "Biker-Biker Distanza GPS", usersActive: activeOf("bb_dist_off"), totalMatches: parseInt(bbc.bb_dist_cnt ?? "0", 10) },
      { typeKey: "bikerZavarrinaDistance", typeName: "Biker-Zavarrina Distanza GPS", usersActive: activeOf("bz_dist_off"), totalMatches: parseInt(bbc.bz_dist_cnt ?? "0", 10) },
      { typeKey: "bikerBikerMusic", typeName: "Biker-Biker Musica", usersActive: activeOf("bb_music_off"), totalMatches: parseInt(bbc.bb_music_cnt ?? "0", 10) },
      { typeKey: "bikerZavarrinaMusic", typeName: "Biker-Zavarrina Musica", usersActive: activeOf("bz_music_off"), totalMatches: parseInt(bbc.bz_music_cnt ?? "0", 10) },
      { typeKey: "bikerBikerLeanAngle", typeName: "Biker-Biker Angolo Piega", usersActive: activeOf("bb_lean_off"), totalMatches: parseInt(bbc.bb_lean_cnt ?? "0", 10) },
      { typeKey: "bikerBikerRouteTypeZone", typeName: "Biker-Biker Zona+Tipo Percorso", usersActive: activeOf("bb_zone_off"), totalMatches: parseInt(bbc.bb_zone_cnt ?? "0", 10) },
      { typeKey: "bikerZavarrinaRouteTypeZone", typeName: "Biker-Zavarrina Zona+Tipo", usersActive: activeOf("bz_zone_off"), totalMatches: parseInt(bbc.bz_zone_cnt ?? "0", 10) },
      { typeKey: "bikerBikerAvgSpeed", typeName: "Biker-Biker Velocità Media", usersActive: activeOf("bb_speed_off"), totalMatches: parseInt(bbc.bb_speed_cnt ?? "0", 10) },
      { typeKey: "bikerBikerAvgDuration", typeName: "Biker-Biker Durata Media", usersActive: activeOf("bb_dur_off"), totalMatches: parseInt(bbc.bb_dur_cnt ?? "0", 10) },
      { typeKey: "bikerBikerDayTime", typeName: "Biker-Biker Orario Giorno", usersActive: activeOf("bb_day_off"), totalMatches: parseInt(bbc.bb_day_cnt ?? "0", 10) },
      { typeKey: "bikerBikerEvents", typeName: "Biker-Biker Eventi", usersActive: activeOf("bb_events_off"), totalMatches: parseInt(bbc.bb_events_cnt ?? "0", 10) },
    ].map(s => ({ ...s, isAnomaly: s.totalMatches === 0 }));

    return res.json({ visible, stats });
  } catch (err) {
    console.error("[ADMIN match-settings] GET error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// GET /api/admin/match-health
// Esegue un controllo completo della salute del motore di matching
router.get("/match-health", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { captureSchemaSnapshot, loadSchemaSnapshot, diffSchemas, saveSchemaSnapshot } = await import("../scripts/snapshot-schema");

    const MATCH_TYPES = [
      { id: 1,  key: "bikerBikerBrand",           label: "Biker-Biker Brand",             prefColumn: "biker_biker_brand",             countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand NOT LIKE '%:%' AND motorcycle_brand NOT IN ('musica','musica_zav','distanza','distanza_zav','eventi') AND motorcycle_brand NOT LIKE 'gps_%' AND motorcycle_brand NOT LIKE 'zona_%'` },
      { id: 2,  key: "bikerZavorrinaBrand",        label: "Biker-Zavarrina Brand",          prefColumn: "biker_zavorrina_brand",         countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_zavarrina_matches WHERE 1=1` },
      { id: 3,  key: "bikerClubBrand",             label: "Biker-Club Brand",               prefColumn: "biker_club_brand",              countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand LIKE 'club:%' AND motorcycle_brand NOT LIKE 'club_zav:%'` },
      { id: 4,  key: "zavarrinaClubBrand",         label: "Zavarrina-Club Brand",           prefColumn: "zavorrina_club_brand",          countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand LIKE 'club_zav:%'` },
      { id: 5,  key: "bikerBikerTypeStyle",        label: "Biker-Biker Type+Style",         prefColumn: "biker_biker_type_style",        countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand LIKE 'tipo:%' AND motorcycle_brand NOT LIKE 'tipo_zav:%'` },
      { id: 6,  key: "bikerZavarrinaTypeStyle",    label: "Biker-Zavarrina Type+Style",     prefColumn: "biker_zavorrina_type_style",    countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand LIKE 'tipo_zav:%'` },
      { id: 7,  key: "bikerBikerDistance",         label: "Biker-Biker Distance",           prefColumn: "biker_biker_distance",          countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand = 'distanza'` },
      { id: 8,  key: "bikerZavarrinaDistance",     label: "Biker-Zavarrina Distance",       prefColumn: "biker_zavorrina_distance",      countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand = 'distanza_zav'` },
      { id: 9,  key: "bikerBikerMusic",            label: "Biker-Biker Music",              prefColumn: "biker_biker_music",             countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand = 'musica'` },
      { id: 10, key: "bikerZavarrinaMusic",        label: "Biker-Zavarrina Music",          prefColumn: "biker_zavorrina_music",         countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand = 'musica_zav'` },
      { id: 11, key: "bikerBikerLeanAngle",        label: "Biker-Biker Lean Angle (GPS)",  prefColumn: "biker_biker_lean_angle",        countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand IN ('gps_tilt', 'gps_full')` },
      { id: 12, key: "bikerBikerRouteTypeZone",    label: "Biker-Biker Route+Zone",         prefColumn: "biker_biker_route_type_zone",   countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand LIKE 'zona_bb:%'` },
      { id: 13, key: "bikerZavarrinaRouteTypeZone",label: "Biker-Zavarrina Route+Zone",     prefColumn: "biker_zavorrina_route_type_zone", countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand LIKE 'zona_zav:%'` },
      { id: 14, key: "bikerBikerAvgSpeed",         label: "Biker-Biker Avg Speed (GPS)",   prefColumn: "biker_biker_avg_speed",         countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand IN ('gps_speed', 'gps_full')` },
      { id: 15, key: "bikerBikerAvgDuration",      label: "Biker-Biker Avg Duration (GPS)",prefColumn: "biker_biker_avg_duration",      countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand IN ('gps_speed', 'gps_full')` },
      { id: 16, key: "bikerBikerDayTime",          label: "Biker-Biker Day+Time (GPS)",    prefColumn: "biker_biker_day_time",          countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand IN ('gps_day', 'gps_full')` },
      { id: 17, key: "bikerBikerEvents",           label: "Biker-Biker Events",            prefColumn: "biker_biker_events",            countSql: sql<{cnt: string}>`SELECT COUNT(*) AS cnt FROM biker_biker_matches WHERE motorcycle_brand = 'eventi'` },
    ];

    const { pool } = await import("../db");
    const client = await pool.connect();

    try {
      // 1. Schema diff
      const currentSnapshot = await captureSchemaSnapshot();
      const previousSnapshot = loadSchemaSnapshot();
      let schemaCheck: Record<string, unknown>;

      if (!previousSnapshot) {
        schemaCheck = { status: "WARN", message: "Nessuno snapshot precedente trovato — verrà creato ora", diff: null };
      } else {
        const diff = diffSchemas(previousSnapshot, currentSnapshot);
        const hasChanges = diff.addedTables.length > 0 || diff.removedTables.length > 0 || diff.modifiedTables.length > 0;
        schemaCheck = {
          status: hasChanges ? "WARN" : "OK",
          previousSnapshotAt: previousSnapshot.capturedAt,
          diff: hasChanges ? diff : null,
          message: hasChanges ? "Schema modificato dall'ultima esecuzione" : "Schema invariato",
        };
      }

      // 2. Match type counts
      const matchCounts: Array<{ id: number; key: string; label: string; count: number; status: "OK" | "WARN" }> = [];
      for (const mt of MATCH_TYPES) {
        const res = await db.execute(mt.countSql);
        const count = parseInt((res.rows[0] as { cnt?: string })?.cnt ?? "0", 10);
        matchCounts.push({ id: mt.id, key: mt.key, label: mt.label, count, status: count === 0 ? "WARN" : "OK" });
      }

      // 3. Match preferences alignment
      const prefCols = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='match_preferences'
        AND column_name NOT IN ('id','user_id','updated_at','direct_match')
        ORDER BY ordinal_position
      `);
      const dbPrefCols = new Set(prefCols.rows.map(r => r.column_name));
      const expectedPrefColumns = MATCH_TYPES.map(mt => mt.prefColumn);
      const missingFromDb = expectedPrefColumns.filter(col => !dbPrefCols.has(col));
      const unknownInDb = [...dbPrefCols].filter(col => !expectedPrefColumns.includes(col));
      const prefsCheck = {
        status: missingFromDb.length > 0 ? "ERROR" : unknownInDb.length > 0 ? "WARN" : "OK",
        missingFromDb,
        unknownInDb,
        message: missingFromDb.length > 0
          ? `Colonne mancanti: ${missingFromDb.join(", ")}`
          : unknownInDb.length > 0
          ? `Colonne extra: ${unknownInDb.join(", ")}`
          : "match_preferences allineata con i 17 tipi",
      };

      // 4. Distance sample — 5 random biker-biker matches with GPS coordinates
      const sampleRes = await client.query<{ b1lat: number | null; b1lng: number | null; b2lat: number | null; b2lng: number | null }>(`
        SELECT up1.latitude AS b1lat, up1.longitude AS b1lng,
               up2.latitude AS b2lat, up2.longitude AS b2lng
        FROM biker_biker_matches m
        JOIN user_profiles up1 ON up1.user_id = m.biker1_id
        JOIN user_profiles up2 ON up2.user_id = m.biker2_id
        WHERE up1.latitude IS NOT NULL AND up1.longitude IS NOT NULL
          AND up2.latitude IS NOT NULL AND up2.longitude IS NOT NULL
        ORDER BY RANDOM()
        LIMIT 5
      `);

      const distances = sampleRes.rows
        .filter(r => r.b1lat != null && r.b1lng != null && r.b2lat != null && r.b2lng != null)
        .map(r => Math.round(haversineKm(r.b1lat!, r.b1lng!, r.b2lat!, r.b2lng!)));

      const distanceCheck = {
        status: sampleRes.rows.length === 0 ? "WARN" : distances.every(d => d > 0) ? "OK" : "WARN",
        sampleCount: sampleRes.rows.length,
        distancesKm: distances,
        message: sampleRes.rows.length === 0
          ? "Nessun match con coordinate GPS trovato"
          : `${distances.length} campioni verificati (Haversine): ${distances.map(d => d + "km").join(", ")}`,
      };

      // 5. Admin gate
      const gateRes = await client.query<{ value: string | null }>(
        `SELECT value FROM app_settings WHERE key = 'auto_matching_enabled' LIMIT 1`
      );
      const adminGateCheck = {
        status: gateRes.rows.length === 0 ? "WARN" : "OK",
        key: "auto_matching_enabled",
        value: gateRes.rows[0]?.value ?? null,
        message: gateRes.rows.length === 0
          ? "Chiave 'auto_matching_enabled' non trovata in app_settings"
          : `auto_matching_enabled = ${gateRes.rows[0].value ?? "true (default)"}`,
      };

      // Save updated snapshot
      await saveSchemaSnapshot();

      // Aggregate overall status
      const allChecks = [
        schemaCheck.status,
        ...matchCounts.map(m => m.status),
        prefsCheck.status,
        distanceCheck.status,
        adminGateCheck.status,
      ];
      const overallStatus = allChecks.includes("ERROR") ? "ERROR" : allChecks.includes("WARN") ? "WARN" : "OK";

      const typesWithZero = matchCounts.filter(m => m.count === 0).length;

      return res.json({
        overallStatus,
        checkedAt: new Date().toISOString(),
        summary: {
          totalMatchTypes: MATCH_TYPES.length,
          typesWithZeroResults: typesWithZero,
          schemaStatus: schemaCheck.status,
          prefsStatus: prefsCheck.status,
          distanceStatus: distanceCheck.status,
          adminGateStatus: adminGateCheck.status,
        },
        checks: {
          schema: schemaCheck,
          matchCounts,
          preferences: prefsCheck,
          distanceSample: distanceCheck,
          adminGate: adminGateCheck,
        },
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[ADMIN match-health] error:", err);
    return res.status(500).json({ message: "Errore durante il health check", error: String(err) });
  }
});

// ── MATCH INSPECTOR ───────────────────────────────────────────────────────────

function classifyBBBrand(brand: string): string {
  if (brand.startsWith("tipo_zav:")) return "bikerZavarrinaTypeStyle";
  if (brand.startsWith("tipo:")) return "bikerBikerTypeStyle";
  if (brand.startsWith("club_zav:")) return "zavarrinaClubBrand";
  if (brand.startsWith("club:")) return "bikerClubBrand";
  if (brand === "distanza") return "bikerBikerDistance";
  if (brand === "distanza_zav") return "bikerZavarrinaDistance";
  if (brand === "musica") return "bikerBikerMusic";
  if (brand === "musica_zav") return "bikerZavarrinaMusic";
  if (brand === "gps_tilt") return "bikerBikerLeanAngle";
  if (brand.startsWith("zona_bb:")) return "bikerBikerRouteTypeZone";
  if (brand.startsWith("zona_zav:")) return "bikerZavarrinaRouteTypeZone";
  if (brand === "gps_speed" || brand === "gps_full") return "bikerBikerAvgSpeed";
  if (brand === "gps_day") return "bikerBikerDayTime";
  if (brand === "eventi") return "bikerBikerEvents";
  return "bikerBikerBrand";
}

// Explicit map typeKey → DB column name (accounts for schema naming inconsistencies
// where TypeScript fields use "Zavarrina" but DB columns use "zavorrina")
const TYPE_KEY_TO_PREF_COL: Record<string, string> = {
  bikerBikerBrand: "biker_biker_brand",
  bikerZavorrinaBrand: "biker_zavorrina_brand",
  bikerClubBrand: "biker_club_brand",
  zavarrinaClubBrand: "zavorrina_club_brand",
  bikerBikerTypeStyle: "biker_biker_type_style",
  bikerZavarrinaTypeStyle: "biker_zavorrina_type_style",
  bikerBikerDistance: "biker_biker_distance",
  bikerZavarrinaDistance: "biker_zavorrina_distance",
  bikerBikerMusic: "biker_biker_music",
  bikerZavarrinaMusic: "biker_zavorrina_music",
  bikerBikerLeanAngle: "biker_biker_lean_angle",
  bikerBikerRouteTypeZone: "biker_biker_route_type_zone",
  bikerZavarrinaRouteTypeZone: "biker_zavorrina_route_type_zone",
  bikerBikerAvgSpeed: "biker_biker_avg_speed",
  bikerBikerAvgDuration: "biker_biker_avg_duration",
  bikerBikerDayTime: "biker_biker_day_time",
  bikerBikerEvents: "biker_biker_events",
};

const MI_TYPE_NAMES: Record<string, string> = {
  bikerBikerBrand: "B-B Brand",
  bikerZavorrinaBrand: "B-Z Brand",
  bikerClubBrand: "B-Club Brand",
  zavarrinaClubBrand: "Z-Club Brand",
  bikerBikerTypeStyle: "B-B Tipo+Stile",
  bikerZavarrinaTypeStyle: "B-Z Tipo+Stile",
  bikerBikerDistance: "B-B Distanza GPS",
  bikerZavarrinaDistance: "B-Z Distanza GPS",
  bikerBikerMusic: "B-B Musica",
  bikerZavarrinaMusic: "B-Z Musica",
  bikerBikerLeanAngle: "B-B Angolo Piega",
  bikerBikerRouteTypeZone: "B-B Zona+Tipo",
  bikerZavarrinaRouteTypeZone: "B-Z Zona+Tipo",
  bikerBikerAvgSpeed: "B-B Velocità Media",
  bikerBikerAvgDuration: "B-B Durata Media",
  bikerBikerDayTime: "B-B Orario Giorno",
  bikerBikerEvents: "B-B Eventi",
};

const MI_ALL_TYPE_KEYS = Object.keys(MI_TYPE_NAMES);

const MI_GPS_TYPES = new Set([
  "bikerBikerDistance", "bikerZavarrinaDistance", "bikerBikerLeanAngle",
  "bikerBikerRouteTypeZone", "bikerZavarrinaRouteTypeZone",
  "bikerBikerAvgSpeed", "bikerBikerAvgDuration", "bikerBikerDayTime",
]);

// Handler: GET /api/admin/users/match-summary  (also: /api/admin/match-inspector/users)
// Paginated list of users with total + per-type match counts
// Handler for GET /api/admin/users/match-summary and GET /api/admin/match-inspector/users.
// Returns a paginated list of real (non-fake) non-admin users for the match inspector panel.
//
// INTENTIONAL EXCEPTION — map_visibility_filter does NOT apply here.
// This is an admin-only endpoint (protected by requireAdmin). The filter
// is a user-facing privacy feature for the public map; admins must always
// see all users to audit match quality regardless of online/available status.
async function handleMatchInspectorUsers(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const search = String(req.query.search ?? "").trim();
    const offset = (page - 1) * limit;

    const searchClause = search
      ? sql`AND LOWER(u.nickname) LIKE ${"%" + search.toLowerCase() + "%"}`
      : sql``;

    const totalRow = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM users u
      WHERE u.is_fake = false AND u.role != 'admin'
      ${searchClause}
    `);
    const total = parseInt(String((totalRow.rows[0] as { cnt: string }).cnt ?? "0"), 10);

    const rows = await db.execute(sql`
      SELECT
        u.id, u.nickname, u.avatar_url, u.user_type, u.role, u.status,
        (SELECT COUNT(*) FROM biker_biker_matches bbm WHERE bbm.biker1_id = u.id OR bbm.biker2_id = u.id) AS bb_count,
        (SELECT COUNT(*) FROM biker_zavorrina_matches bzm WHERE bzm.biker_id = u.id OR bzm.zavorrina_id = u.id) AS bz_count,
        (
          SELECT json_build_object(
            'bbBrand', COUNT(*) FILTER (WHERE motorcycle_brand NOT LIKE 'tipo%' AND motorcycle_brand NOT LIKE 'club%' AND motorcycle_brand NOT LIKE 'distanza%' AND motorcycle_brand NOT LIKE 'musica%' AND motorcycle_brand NOT LIKE 'gps%' AND motorcycle_brand NOT LIKE 'zona%' AND motorcycle_brand != 'eventi'),
            'bikerClub', COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'club:%'),
            'zavClub', COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'club_zav:%'),
            'bbType', COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'tipo:%'),
            'bzType', COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'tipo_zav:%'),
            'bbDist', COUNT(*) FILTER (WHERE motorcycle_brand = 'distanza'),
            'bzDist', COUNT(*) FILTER (WHERE motorcycle_brand = 'distanza_zav'),
            'bbMusic', COUNT(*) FILTER (WHERE motorcycle_brand = 'musica'),
            'bzMusic', COUNT(*) FILTER (WHERE motorcycle_brand = 'musica_zav'),
            'bbLean', COUNT(*) FILTER (WHERE motorcycle_brand = 'gps_tilt'),
            'bbZone', COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'zona_bb:%'),
            'bzZone', COUNT(*) FILTER (WHERE motorcycle_brand LIKE 'zona_zav:%'),
            'bbSpeed', COUNT(*) FILTER (WHERE motorcycle_brand IN ('gps_speed', 'gps_full')),
            'bbDur', COUNT(*) FILTER (WHERE motorcycle_brand IN ('gps_speed', 'gps_full')),
            'bbDay', COUNT(*) FILTER (WHERE motorcycle_brand = 'gps_day'),
            'bbEvents', COUNT(*) FILTER (WHERE motorcycle_brand = 'eventi')
          )
          FROM biker_biker_matches WHERE biker1_id = u.id OR biker2_id = u.id
        ) AS bb_counts
      FROM users u
      WHERE u.is_fake = false AND u.role != 'admin'
      ${searchClause}
      ORDER BY (bb_count + bz_count) DESC, u.nickname ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const n = (v: number | string | undefined | null) => typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
    const users2 = rows.rows.map((r) => {
      const bb = (r.bb_counts as Record<string, number> | null) ?? {};
      const bbCount = r.bb_count as string | number | null;
      const bzCount = r.bz_count as string | number | null;
      return {
        id: r.id as string, nickname: r.nickname as string, avatarUrl: r.avatar_url as string | null,
        userType: r.user_type as string, role: r.role as string, status: r.status as string,
        totalMatches: n(bbCount) + n(bzCount),
        bbMatches: n(bbCount),
        bzMatches: n(bzCount),
        matchCounts: {
          bikerBikerBrand: n(bb.bbBrand),
          bikerZavorrinaBrand: n(bzCount),
          bikerClubBrand: n(bb.bikerClub),
          zavarrinaClubBrand: n(bb.zavClub),
          bikerBikerTypeStyle: n(bb.bbType),
          bikerZavarrinaTypeStyle: n(bb.bzType),
          bikerBikerDistance: n(bb.bbDist),
          bikerZavarrinaDistance: n(bb.bzDist),
          bikerBikerMusic: n(bb.bbMusic),
          bikerZavarrinaMusic: n(bb.bzMusic),
          bikerBikerLeanAngle: n(bb.bbLean),
          bikerBikerRouteTypeZone: n(bb.bbZone),
          bikerZavarrinaRouteTypeZone: n(bb.bzZone),
          bikerBikerAvgSpeed: n(bb.bbSpeed),
          bikerBikerAvgDuration: n(bb.bbDur),
          bikerBikerDayTime: n(bb.bbDay),
          bikerBikerEvents: n(bb.bbEvents),
        },
      };
    });

    res.json({ users: users2, total, page, limit, hasMore: offset + users2.length < total });
  } catch (err) {
    console.error("[ADMIN match-inspector users] error:", err);
    res.status(500).json({ message: "Errore interno" });
  }
}

// Handler: GET /api/admin/users/:userId/matches  (also: /api/admin/match-inspector/users/:userId)
// Detailed match inspection for a single user, grouped by all 17 match types
async function handleMatchInspectorUserDetail(req: Request, res: Response): Promise<void> {
  try {
    const userId = paramStr(req.params.userId);
    if (userId === null) { res.status(400).json({ message: "ID utente non valido" }); return; }
    const user = await storage.getUser(userId);
    if (!user) { res.status(404).json({ message: "Utente non trovato" }); return; }

    const profile = await storage.getUserProfile(userId);
    const prefRows = await db.execute(sql`SELECT * FROM match_preferences WHERE user_id = ${userId}`);
    const prefs = (prefRows.rows[0] ?? {}) as Record<string, boolean | null>;
    const gpsCountRow = await db.execute(sql`SELECT COUNT(*) as cnt FROM routes WHERE user_id = ${userId} AND duration_seconds > 0`);
    const gpsRouteCount = parseInt(String((gpsCountRow.rows[0] as { cnt: string })?.cnt ?? "0"), 10);

    const bbRows = await db.execute(sql`
      SELECT bbm.id, bbm.motorcycle_brand, bbm.status, bbm.is_supermatch, bbm.created_at,
        CASE WHEN bbm.biker1_id = ${userId} THEN bbm.biker2_id ELSE bbm.biker1_id END AS other_id,
        u.nickname AS other_nickname, u.avatar_url AS other_avatar,
        up.latitude AS other_lat, up.longitude AS other_lng
      FROM biker_biker_matches bbm
      JOIN users u ON u.id = CASE WHEN bbm.biker1_id = ${userId} THEN bbm.biker2_id ELSE bbm.biker1_id END
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE bbm.biker1_id = ${userId} OR bbm.biker2_id = ${userId}
      ORDER BY bbm.created_at DESC
    `);

    const bzRows = await db.execute(sql`
      SELECT bzm.id, bzm.status, bzm.is_supermatch, bzm.created_at,
        CASE WHEN bzm.biker_id = ${userId} THEN bzm.zavorrina_id ELSE bzm.biker_id END AS other_id,
        u.nickname AS other_nickname, u.avatar_url AS other_avatar,
        up.latitude AS other_lat, up.longitude AS other_lng
      FROM biker_zavorrina_matches bzm
      JOIN users u ON u.id = CASE WHEN bzm.biker_id = ${userId} THEN bzm.zavorrina_id ELSE bzm.biker_id END
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE bzm.biker_id = ${userId} OR bzm.zavorrina_id = ${userId}
      ORDER BY bzm.created_at DESC
    `);

    const userLat = profile?.latitude ?? null;
    const userLng = profile?.longitude ?? null;

    const toMatchItem = (otherId: string, otherNickname: string, otherAvatar: string | null, otherLat: number | null, otherLng: number | null, id: string, status: string, isSupermatch: boolean, createdAt: string) => ({
      id, matchedUserId: otherId, matchedNickname: otherNickname, matchedAvatarUrl: otherAvatar,
      distanceKm: (userLat != null && userLng != null && otherLat != null && otherLng != null)
        ? Math.round(haversineKm(userLat, userLng, otherLat, otherLng) * 10) / 10 : null,
      status, isSupermatch, createdAt,
    });

    const typeGroups: Record<string, ReturnType<typeof toMatchItem>[]> = {};

    for (const _row of bbRows.rows) {
      const row = _row as Record<string, unknown>;
      const brand = row.motorcycle_brand as string;
      const typeKey = classifyBBBrand(brand);
      if (!typeGroups[typeKey]) typeGroups[typeKey] = [];
      typeGroups[typeKey].push(toMatchItem(row.other_id as string, row.other_nickname as string, row.other_avatar as string | null, row.other_lat as number | null, row.other_lng as number | null, row.id as string, row.status as string, row.is_supermatch as boolean, row.created_at as string));
      if (typeKey === "bikerBikerAvgSpeed") {
        if (!typeGroups["bikerBikerAvgDuration"]) typeGroups["bikerBikerAvgDuration"] = [];
        typeGroups["bikerBikerAvgDuration"].push(toMatchItem(row.other_id as string, row.other_nickname as string, row.other_avatar as string | null, row.other_lat as number | null, row.other_lng as number | null, row.id as string, row.status as string, row.is_supermatch as boolean, row.created_at as string));
      }
      if (brand === "gps_full") {
        for (const extra of ["bikerBikerLeanAngle", "bikerBikerDayTime"] as const) {
          if (typeKey !== extra) {
            if (!typeGroups[extra]) typeGroups[extra] = [];
            typeGroups[extra].push(toMatchItem(row.other_id as string, row.other_nickname as string, row.other_avatar as string | null, row.other_lat as number | null, row.other_lng as number | null, row.id as string, row.status as string, row.is_supermatch as boolean, row.created_at as string));
          }
        }
      }
    }

    for (const _row of bzRows.rows) {
      const row = _row as Record<string, unknown>;
      if (!typeGroups["bikerZavorrinaBrand"]) typeGroups["bikerZavorrinaBrand"] = [];
      typeGroups["bikerZavorrinaBrand"].push(toMatchItem(row.other_id as string, row.other_nickname as string, row.other_avatar as string | null, row.other_lat as number | null, row.other_lng as number | null, row.id as string, row.status as string, row.is_supermatch as boolean, row.created_at as string));
    }

    const matchesByType = MI_ALL_TYPE_KEYS.map((typeKey) => {
      const matches = typeGroups[typeKey] ?? [];
      const prefCol = TYPE_KEY_TO_PREF_COL[typeKey];
      const disabled = prefCol ? prefs[prefCol] === false : false;
      const insufficientData = MI_GPS_TYPES.has(typeKey) && gpsRouteCount === 0;
      return { typeKey, typeName: MI_TYPE_NAMES[typeKey], count: matches.length, disabled, insufficientData, matches: matches.slice(0, 50) };
    });

    res.json({
      user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType, role: user.role, status: user.status },
      gpsRouteCount,
      matchesByType,
    });
  } catch (err) {
    console.error("[ADMIN match-inspector user detail] error:", err);
    res.status(500).json({ message: "Errore interno" });
  }
}

// Handler: POST /api/admin/users/:userId/matches/recalculate  (also: /api/admin/match-inspector/users/:userId/recalculate)
async function handleMatchInspectorRecalculate(req: Request, res: Response): Promise<void> {
  try {
    const userId = paramStr(req.params.userId);
    if (userId === null) { res.status(400).json({ message: "ID utente non valido" }); return; }
    const user = await storage.getUser(userId);
    if (!user) { res.status(404).json({ message: "Utente non trovato" }); return; }
    const result = await runMatchingForUser(userId);
    res.json({ ok: true, bikerBiker: result.bikerBiker, zavarrina: result.zavarrina });
  } catch (err) {
    console.error("[ADMIN match-inspector recalculate] error:", err);
    res.status(500).json({ message: "Errore interno" });
  }
}

// Route registrations — spec-required paths
router.get("/users/match-summary", handleMatchInspectorUsers);
router.get("/users/:userId/matches", handleMatchInspectorUserDetail);
router.post("/users/:userId/matches/recalculate", handleMatchInspectorRecalculate);

// GET /api/admin/users/:userId/match-preferences
// Returns the match preferences for a specific user (admin only).
router.get("/users/:userId/match-preferences", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const [row] = await db
      .select()
      .from(matchPreferences)
      .where(eq(matchPreferences.userId, userId))
      .limit(1);

    if (!row) {
      return res.json({ preferences: DEFAULT_PREFS });
    }

    return res.json({
      preferences: {
        bikerBikerBrand: row.bikerBikerBrand,
        bikerZavorrinaBrand: row.bikerZavorrinaBrand,
        bikerClubBrand: row.bikerClubBrand,
        zavarrinaClubBrand: row.zavarrinaClubBrand,
        bikerBikerTypeStyle: row.bikerBikerTypeStyle,
        bikerZavarrinaTypeStyle: row.bikerZavarrinaTypeStyle,
        bikerBikerDistance: row.bikerBikerDistance,
        bikerZavarrinaDistance: row.bikerZavarrinaDistance,
        bikerBikerMusic: row.bikerBikerMusic,
        bikerZavarrinaMusic: row.bikerZavarrinaMusic,
        bikerBikerLeanAngle: row.bikerBikerLeanAngle,
        bikerBikerRouteTypeZone: row.bikerBikerRouteTypeZone,
        bikerZavarrinaRouteTypeZone: row.bikerZavarrinaRouteTypeZone,
        bikerBikerAvgSpeed: row.bikerBikerAvgSpeed,
        bikerBikerAvgDuration: row.bikerBikerAvgDuration,
        bikerBikerDayTime: row.bikerBikerDayTime,
        bikerBikerEvents: row.bikerBikerEvents,
        directMatch: row.directMatch,
      },
    });
  } catch (err) {
    console.error("[ADMIN match-preferences GET] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// PUT /api/admin/users/:userId/match-preferences
// Updates the match preferences for a specific user (admin only).
router.put("/users/:userId/match-preferences", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const body = req.body as Partial<typeof DEFAULT_PREFS>;

    const updates: Record<string, boolean> = Object.fromEntries(
      (Object.keys(DEFAULT_PREFS) as Array<keyof typeof DEFAULT_PREFS>)
        .filter((key) => typeof body[key] === "boolean")
        .map((key) => [key, body[key] as boolean])
    );

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nessun campo valido fornito" });
    }

    const [existing] = await db
      .select({ id: matchPreferences.id })
      .from(matchPreferences)
      .where(eq(matchPreferences.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(matchPreferences)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(matchPreferences.userId, userId));
    } else {
      await db.insert(matchPreferences).values({
        userId,
        ...DEFAULT_PREFS,
        ...updates,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[ADMIN match-preferences PUT] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// DELETE /api/admin/users/:userId/match-preferences
// Cancella la riga match_preferences per un singolo utente, ripristinando i valori di default.
router.delete("/users/:userId/match-preferences", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await db
      .delete(matchPreferences)
      .where(eq(matchPreferences.userId, userId));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ADMIN match-preferences DELETE] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// Route registrations — legacy alias paths (backward compat)
router.get("/match-inspector/users", handleMatchInspectorUsers);
router.get("/match-inspector/users/:userId", handleMatchInspectorUserDetail);
router.post("/match-inspector/users/:userId/recalculate", handleMatchInspectorRecalculate);

// POST /api/admin/match-settings/reset-all
// Resetta TUTTE le preferenze di matching degli utenti ai valori di default (tutto attivo).
// Utile dopo aver aggiunto nuovi tipi di match.
router.post("/match-settings/reset-all", async (_req: Request, res: Response) => {
  try {
    // Use drizzle to derive column updates from the canonical DEFAULT_PREFS map
    // — this keeps the reset in sync with new preference columns automatically.
    const updates: Record<string, boolean | Date> = { ...DEFAULT_PREFS, updatedAt: new Date() };
    const result = await db.update(matchPreferences).set(updates as never);
    const affected = (result as { rowCount?: number }).rowCount ?? 0;
    return res.json({ ok: true, affected });
  } catch (err) {
    console.error("[ADMIN match-settings reset-all] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// POST /api/admin/matches/recalculate-all
router.post("/matches/recalculate-all", async (_req: Request, res: Response) => {
  try {
    const result = triggerMatchingRun();
    res.json({ ok: true, started: result.started, reason: result.reason ?? null });
  } catch (err) {
    console.error("[ADMIN matches recalculate-all] error:", err);
    res.status(500).json({ message: "Errore interno" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #1355: Sistema OTA Modulare — endpoint admin per slot + heartbeat + revert
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/ota/releases — lista OTA con slot, stato, successCount, ultimo heartbeat
router.get("/ota/releases", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        r.id, r.version, r.runtime_version, r.bundle_path, r.release_notes,
        r.status, r.slot, r.promoted_at, r.promoted_by, r.success_count,
        r.published_at, r.created_at, r.updated_at,
        (
          SELECT e.created_at FROM ota_events e
          WHERE e.release_id = r.id AND e.phase = 'loaded'
          ORDER BY e.created_at DESC LIMIT 1
        ) AS last_heartbeat_at
      FROM ota_releases r
      ORDER BY r.created_at DESC
      LIMIT 50
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("[ADMIN ota/releases] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// POST /api/admin/ota/assign-slot — assegna un OTA a uno slot (un solo occupante per slot)
// Transazione: rimuove l'occupante precedente dello slot, poi assegna il nuovo.
// body: { releaseId: string, slot: string }
router.post("/ota/assign-slot", async (req: Request, res: Response) => {
  try {
    const { releaseId, slot } = req.body ?? {};
    if (!releaseId || !slot) return res.status(400).json({ message: "releaseId e slot obbligatori" });
    // Accetta: stable, previous-stable, test-N (N intero ≥1) — N configurable
    if (!/^(stable|previous-stable|test-\d+)$/.test(slot)) {
      return res.status(400).json({ message: "slot non valido. Formati ammessi: stable, previous-stable, test-1, test-2, ..." });
    }

    // Transazione: garantisce un solo occupante per slot
    let assignedRow: Record<string, unknown> | null = null;
    try {
      assignedRow = await db.transaction(async (tx) => {
        // Evict previous occupant of this slot → archived (not slot=NULL, to keep legacy fallback clean)
        await tx.execute(sql`UPDATE ota_releases SET slot = 'archived', status = 'archived', updated_at = NOW() WHERE slot = ${slot} AND id != ${releaseId}`);
        // Assign the new occupant and activate it so it can be served
        const result = await tx.execute(sql`UPDATE ota_releases SET slot = ${slot}, status = 'active', published_at = COALESCE(published_at, NOW()), updated_at = NOW() WHERE id = ${releaseId} RETURNING id, version, slot, status`);
        if (!result.rows.length) {
          const err = new Error("Release non trovata");
          (err as NodeJS.ErrnoException).code = "NOT_FOUND";
          throw err;
        }
        return result.rows[0] as Record<string, unknown>;
      });
    } catch (txErr: unknown) {
      if (txErr instanceof Error && (txErr as NodeJS.ErrnoException).code === "NOT_FOUND") {
        return res.status(404).json({ message: "Release non trovata" });
      }
      throw txErr;
    }

    // Log evento (best-effort, fuori dalla transazione)
    try {
      await db.insert(otaEvents).values({
        phase: "admin-assign-slot",
        source: "admin",
        platform: "android",
        releaseId: String(releaseId).substring(0, 64),
        error: `slot=${slot}`,
        failCount: 0,
      });
    } catch { /* best-effort */ }
    // Invalida cache hash manifest
    try {
      const inv = req.app.locals.invalidateExpoUpdateHash;
      if (typeof inv === "function") inv();
    } catch { /* best-effort */ }
    return res.json({ ok: true, release: assignedRow });
  } catch (err) {
    console.error("[ADMIN ota/assign-slot] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// POST /api/admin/ota/assign-device — assegna un device a uno slot (con scadenza opzionale)
// body: { deviceId: string, slot: string, expiresAt?: string (ISO date) }
router.post("/ota/assign-device", async (req: Request, res: Response) => {
  try {
    const { deviceId, slot, expiresAt } = req.body ?? {};
    if (!deviceId || !slot) return res.status(400).json({ message: "deviceId e slot obbligatori" });
    // Accetta: stable, test-N (N intero ≥1) — N configurable; previous-stable non usabile per device
    if (!/^(stable|test-\d+)$/.test(slot)) {
      return res.status(400).json({ message: "slot non valido. Formati ammessi: stable, test-1, test-2, ..." });
    }
    const safeDeviceId = String(deviceId).substring(0, 128);
    const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

    await db.execute(sql`
      INSERT INTO device_ota_assignments (device_id, slot, assigned_at, assigned_by, expires_at)
      VALUES (${safeDeviceId}, ${slot}, NOW(), ${"admin"}, ${expiresAtDate})
      ON CONFLICT (device_id) DO UPDATE
        SET slot = EXCLUDED.slot,
            assigned_at = NOW(),
            assigned_by = 'admin',
            expires_at = EXCLUDED.expires_at
    `);
    // Log evento
    try {
      await db.insert(otaEvents).values({
        phase: "admin-assign-device",
        source: "admin",
        platform: "android",
        currentUpdateId: safeDeviceId.substring(0, 64),
        error: `slot=${slot}${expiresAtDate ? ` expires=${expiresAtDate.toISOString()}` : ""}`,
        failCount: 0,
      });
    } catch { /* best-effort */ }
    return res.json({ ok: true, deviceId: safeDeviceId, slot, expiresAt: expiresAtDate });
  } catch (err) {
    console.error("[ADMIN ota/assign-device] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// GET /api/admin/ota/device-assignments — lista tutte le assegnazioni device
router.get("/ota/device-assignments", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT device_id, slot, assigned_at, assigned_by, expires_at
      FROM device_ota_assignments
      ORDER BY assigned_at DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("[ADMIN ota/device-assignments] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// DELETE /api/admin/ota/device-assignments/:deviceId — rimuove assegnazione di un device
router.delete("/ota/device-assignments/:deviceId", async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    await db.execute(sql`DELETE FROM device_ota_assignments WHERE device_id = ${deviceId}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ADMIN ota/device-assignments DELETE] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// POST /api/admin/ota/promote — promuove OTA di uno slot test a STABLE
// Transazione atomica:
//   1. Trova il candidato nel fromSlot (ORDER BY published_at DESC — deterministico)
//   2. Sposta il previous-stable corrente a slot=NULL (storico)
//   3. Sposta lo stable corrente a previous-stable
//   4. Sposta il candidato a stable
// body: { fromSlot: string }
router.post("/ota/promote", async (req: Request, res: Response) => {
  try {
    const { fromSlot } = req.body ?? {};
    if (!fromSlot) return res.status(400).json({ message: "fromSlot obbligatorio" });
    // Accetta qualsiasi test-N (N intero ≥1) — N configurable
    if (!/^test-\d+$/.test(fromSlot)) {
      return res.status(400).json({ message: "fromSlot deve essere un test slot: test-1, test-2, ..." });
    }

    // Leggi candidato prima di aprire la transazione (read-only)
    const testOta = await db.execute(sql`SELECT id, version FROM ota_releases WHERE slot = ${fromSlot} AND status = 'active' ORDER BY published_at DESC LIMIT 1`);
    if (!testOta.rows.length) {
      return res.status(400).json({ message: `Nessun OTA attivo nello slot ${fromSlot}` });
    }
    const testRow = testOta.rows[0] as { id: string; version: string };

    // Transazione atomica
    await db.transaction(async (tx) => {
      // Il previous-stable corrente → archived (non slot=NULL: riserviamo NULL ai record pre-slot-system)
      await tx.execute(sql`UPDATE ota_releases SET slot = 'archived', status = 'archived', updated_at = NOW() WHERE slot = 'previous-stable'`);
      // Lo stable corrente → previous-stable (resta active: è il candidato al revert)
      await tx.execute(sql`UPDATE ota_releases SET slot = 'previous-stable', updated_at = NOW() WHERE slot = 'stable'`);
      // Il candidato → stable
      await tx.execute(sql`UPDATE ota_releases SET slot = 'stable', promoted_at = NOW(), promoted_by = 'admin', updated_at = NOW() WHERE id = ${testRow.id}`);
    });

    // Log evento (best-effort, fuori dalla transazione)
    try {
      await db.insert(otaEvents).values({
        phase: "admin-promote",
        source: "admin",
        platform: "android",
        releaseId: String(testRow.id).substring(0, 64),
        error: `promoted from ${fromSlot} to stable version=${testRow.version}`,
        failCount: 0,
      });
    } catch { /* best-effort */ }
    // Invalida cache hash manifest
    try {
      const inv = req.app.locals.invalidateExpoUpdateHash;
      if (typeof inv === "function") inv();
    } catch { /* best-effort */ }
    return res.json({ ok: true, promotedReleaseId: testRow.id, promotedVersion: testRow.version });
  } catch (err) {
    console.error("[ADMIN ota/promote] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// POST /api/admin/ota/revert — annulla l'ultima promozione: previous-stable → stable
// Transazione atomica:
//   1. Trova il previous-stable (ORDER BY updated_at DESC — il più recentemente mosso lì)
//   2. Sposta lo stable corrente a slot=NULL
//   3. Sposta il previous-stable a stable
router.post("/ota/revert", async (req: Request, res: Response) => {
  try {
    // Trova il previous-stable deterministicamente (il più recentemente promosso lì)
    const prevStableResult = await db.execute(sql`SELECT id, version FROM ota_releases WHERE slot = 'previous-stable' AND status = 'active' ORDER BY updated_at DESC LIMIT 1`);
    if (!prevStableResult.rows.length) {
      return res.status(400).json({ message: "Nessun previous-stable disponibile per il revert" });
    }
    const prevRow = prevStableResult.rows[0] as { id: string; version: string };

    // Transazione atomica — SWAP: stable ↔ previous-stable
    // Preserva il history chain: lo stable che viene spostato va a previous-stable,
    // non viene archiviato, così può essere ri-ripristinato in futuro.
    await db.transaction(async (tx) => {
      // Passo 1: lo stable corrente → slot temporaneo per evitare conflitti di unique
      await tx.execute(sql`UPDATE ota_releases SET slot = '_revert_tmp', updated_at = NOW() WHERE slot = 'stable'`);
      // Passo 2: il previous-stable → stable (resta active)
      await tx.execute(sql`UPDATE ota_releases SET slot = 'stable', promoted_at = NOW(), promoted_by = 'admin-revert', updated_at = NOW() WHERE id = ${prevRow.id}`);
      // Passo 3: il vecchio stable → previous-stable (ora può essere ri-ripristinato)
      await tx.execute(sql`UPDATE ota_releases SET slot = 'previous-stable', updated_at = NOW() WHERE slot = '_revert_tmp'`);
    });

    // Log evento (best-effort)
    try {
      await db.insert(otaEvents).values({
        phase: "admin-revert",
        source: "admin",
        platform: "android",
        releaseId: String(prevRow.id).substring(0, 64),
        error: `reverted to version=${prevRow.version}`,
        failCount: 0,
      });
    } catch { /* best-effort */ }
    // Invalida cache hash manifest
    try {
      const inv = req.app.locals.invalidateExpoUpdateHash;
      if (typeof inv === "function") inv();
    } catch { /* best-effort */ }
    return res.json({ ok: true, revertedToReleaseId: prevRow.id, revertedToVersion: prevRow.version });
  } catch (err) {
    console.error("[ADMIN ota/revert] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// POST /api/admin/ota/mark-broken — marca OTA come broken; i device che lo ricevono
// torneranno automaticamente allo stable al prossimo check (slot-fallback logic)
// body: { releaseId: string }
router.post("/ota/mark-broken", async (req: Request, res: Response) => {
  try {
    const { releaseId } = req.body ?? {};
    if (!releaseId) return res.status(400).json({ message: "releaseId obbligatorio" });
    const result = await db.execute(sql`
      UPDATE ota_releases SET status = 'broken', updated_at = NOW()
      WHERE id = ${releaseId}
      RETURNING id, version, slot, status
    `);
    if (!result.rows.length) return res.status(404).json({ message: "Release non trovata" });
    // Log evento
    try {
      await db.insert(otaEvents).values({
        phase: "admin-mark-broken",
        source: "admin",
        platform: "android",
        releaseId: String(releaseId).substring(0, 64),
        error: "marked broken by admin",
        failCount: 0,
      });
    } catch { /* best-effort */ }
    // Invalida cache hash manifest
    try {
      const inv = req.app.locals.invalidateExpoUpdateHash;
      if (typeof inv === "function") inv();
    } catch { /* best-effort */ }
    return res.json({ ok: true, release: result.rows[0] });
  } catch (err) {
    console.error("[ADMIN ota/mark-broken] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// GET /api/admin/ota/events — ultimi N eventi ota_events filtrabili per releaseId/phase/deviceId
// query: ?releaseId=&phase=&deviceId=&limit=50
// deviceId filtra per source (dove è salvato l'ID del device negli eventi heartbeat)
router.get("/ota/events", async (req: Request, res: Response) => {
  try {
    const releaseId = req.query.releaseId ? String(req.query.releaseId) : null;
    const phase = req.query.phase ? String(req.query.phase) : null;
    const deviceId = req.query.deviceId ? String(req.query.deviceId).substring(0, 128) : null;
    const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 50;

    // Build dynamic WHERE clause using Drizzle sql template fragments
    const conditions: ReturnType<typeof sql>[] = [];
    if (releaseId) conditions.push(sql`release_id = ${releaseId}`);
    if (phase)     conditions.push(sql`phase = ${phase}`);
    if (deviceId)  conditions.push(sql`source = ${deviceId}`);

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`SELECT * FROM ota_events ${whereClause} ORDER BY created_at DESC LIMIT ${limit}`);
    return res.json(result.rows);
  } catch (err) {
    console.error("[ADMIN ota/events] error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// POST /api/admin/sync/trigger — trigger immediato sync prod→dev
router.post("/sync/trigger", async (_req: Request, res: Response) => {
  try {
    const { isSyncAvailable, syncProdToDev } = await import("../sync-service");
    if (!isSyncAvailable()) {
      return res.status(400).json({ ok: false, error: "Sync non disponibile in questo ambiente" });
    }
    const result = await syncProdToDev();
    return res.json(result);
  } catch (err: any) {
    console.error("[ADMIN sync/trigger] error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Errore interno" });
  }
});

// GET /api/admin/sync/status — stato sync prod→dev
router.get("/sync/status", async (_req: Request, res: Response) => {
  try {
    const { getSyncStatus } = await import("../sync-service");
    const status = await getSyncStatus();
    return res.json(status);
  } catch (err: any) {
    console.error("[ADMIN sync/status] error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Errore interno" });
  }
});

// ── GET /api/admin/settings/apk-url ───────────────────────────────────────
// Restituisce l'URL APK corrente (DB ha priorità sull'env var).
router.get("/settings/apk-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("apk_download_url");
    const dbUrl = setting?.value?.trim() || null;
    const envUrl = process.env.APK_DOWNLOAD_URL || null;
    return res.json({
      url: dbUrl || envUrl || null,
      source: dbUrl ? "db" : envUrl ? "env" : "none",
    });
  } catch (err) {
    console.error("[ADMIN apk-url] get error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── PUT /api/admin/settings/apk-url ───────────────────────────────────────
// Aggiorna o svuota l'URL APK nel DB (non tocca l'env var).
router.put("/settings/apk-url", async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    const trimmed = typeof url === "string" ? url.trim() : "";
    await storage.upsertAppSetting("apk_download_url", trimmed || "", undefined);
    return res.json({ ok: true, url: trimmed || null });
  } catch (err) {
    console.error("[ADMIN apk-url] put error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── GET /api/admin/settings/play-store-url ────────────────────────────────
router.get("/settings/play-store-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("play_store_url");
    return res.json({ url: setting?.value?.trim() || null });
  } catch (err) {
    console.error("[ADMIN play-store-url] get error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── PUT /api/admin/settings/play-store-url ────────────────────────────────
router.put("/settings/play-store-url", async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (trimmed && trimmed.length > 2048) {
      return res.status(400).json({ message: "URL troppo lungo (max 2048 caratteri)" });
    }
    if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      return res.status(400).json({ message: "L'URL deve iniziare con http:// o https://" });
    }
    await storage.upsertAppSetting("play_store_url", trimmed, undefined);
    return res.json({ ok: true, url: trimmed || null });
  } catch (err) {
    console.error("[ADMIN play-store-url] put error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── GET /api/admin/settings/website-url ───────────────────────────────────
router.get("/settings/website-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("website_url");
    return res.json({ url: setting?.value?.trim() || null });
  } catch (err) {
    console.error("[ADMIN website-url] get error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── PUT /api/admin/settings/website-url ───────────────────────────────────
router.put("/settings/website-url", async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (trimmed && trimmed.length > 2048) {
      return res.status(400).json({ message: "URL troppo lungo (max 2048 caratteri)" });
    }
    if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      return res.status(400).json({ message: "L'URL deve iniziare con http:// o https://" });
    }
    await storage.upsertAppSetting("website_url", trimmed, undefined);
    return res.json({ ok: true, url: trimmed || null });
  } catch (err) {
    console.error("[ADMIN website-url] put error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── GET /api/admin/settings/maintenance ───────────────────────────────────
// Restituisce lo stato manutenzione (enabled + messaggio).
router.get("/settings/maintenance", async (_req: Request, res: Response) => {
  try {
    const [enabledSetting, messageSetting] = await Promise.all([
      storage.getAppSetting("maintenance_enabled"),
      storage.getAppSetting("maintenance_message"),
    ]);
    return res.json({
      enabled: enabledSetting?.value === "true",
      message: messageSetting?.value?.trim() || "",
    });
  } catch (err) {
    console.error("[ADMIN maintenance] get error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── PUT /api/admin/settings/maintenance ───────────────────────────────────
// Aggiorna lo stato manutenzione e il messaggio.
router.put("/settings/maintenance", async (req: Request, res: Response) => {
  try {
    const { enabled, message } = req.body as { enabled?: boolean; message?: string };
    await Promise.all([
      storage.upsertAppSetting("maintenance_enabled", enabled ? "true" : "false", undefined),
      storage.upsertAppSetting("maintenance_message", typeof message === "string" ? message.trim() : "", undefined),
    ]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ADMIN maintenance] put error:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

// ── SITE VISITS (Counter Visitatori Sito — Task #1524) ─────────────────────
// Endpoint admin-only (protetti da router.use(requireAdmin) sopra).
void siteVisits;

router.get("/site-visits/summary", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [row] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE event = 'view') AS total_views,
        COUNT(*) FILTER (WHERE event = 'view' AND created_at >= ${startToday}) AS views_today,
        COUNT(*) FILTER (WHERE event = 'view' AND created_at >= ${start7d}) AS views_7d,
        COUNT(*) FILTER (WHERE event = 'view' AND created_at >= ${start30d}) AS views_30d,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'view') AS unique_total,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'view' AND created_at >= ${startToday}) AS unique_today,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'view' AND created_at >= ${start7d}) AS unique_7d,
        COUNT(DISTINCT visitor_id) FILTER (WHERE event = 'view' AND created_at >= ${start30d}) AS unique_30d,
        COUNT(*) FILTER (WHERE event = 'register') AS registrations_total,
        COUNT(*) FILTER (WHERE event = 'register' AND created_at >= ${start30d}) AS registrations_30d,
        COUNT(*) FILTER (WHERE event = 'login') AS logins_total,
        COUNT(*) FILTER (WHERE event = 'login' AND created_at >= ${start30d}) AS logins_30d
      FROM site_visits
    `).then((r: any) => (Array.isArray(r) ? r : (r?.rows ?? [])));

    const num = (v: unknown) => Number(v ?? 0) || 0;
    return res.json({
      views: {
        today: num(row?.views_today),
        last7d: num(row?.views_7d),
        last30d: num(row?.views_30d),
        total: num(row?.total_views),
      },
      uniqueVisitors: {
        today: num(row?.unique_today),
        last7d: num(row?.unique_7d),
        last30d: num(row?.unique_30d),
        total: num(row?.unique_total),
      },
      registrations: {
        last30d: num(row?.registrations_30d),
        total: num(row?.registrations_total),
      },
      logins: {
        last30d: num(row?.logins_30d),
        total: num(row?.logins_total),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin/site-visits/summary] error:", err);
    return res.status(500).json({ message: "Errore caricamento summary visite" });
  }
});

router.get("/site-visits", async (req: Request, res: Response) => {
  try {
    const fromStr = paramStr(req.query.from as any);
    const toStr = paramStr(req.query.to as any);
    const eventFilter = paramStr(req.query.event as any);
    const loggedOnly = String(req.query.loggedOnly ?? "") === "1" || String(req.query.loggedOnly ?? "") === "true";
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "100"), 10) || 100));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);

    const conditions: any[] = [];
    if (fromStr) {
      const d = new Date(fromStr);
      if (!isNaN(d.getTime())) conditions.push(sql`sv.created_at >= ${d}`);
    }
    if (toStr) {
      const d = new Date(toStr);
      if (!isNaN(d.getTime())) conditions.push(sql`sv.created_at < ${d}`);
    }
    if (eventFilter && ["view", "register", "login"].includes(eventFilter)) {
      conditions.push(sql`sv.event = ${eventFilter}`);
    }
    if (loggedOnly) {
      conditions.push(sql`sv.user_id IS NOT NULL`);
    }
    const whereSql = conditions.length
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const rowsRaw = await db.execute(sql`
      SELECT sv.id, sv.visitor_id, sv.user_id, sv.event, sv.path, sv.referrer,
             sv.user_agent, sv.ip_prefix, sv.lang, sv.country, sv.created_at,
             u.nickname AS user_nickname
      FROM site_visits sv
      LEFT JOIN users u ON u.id = sv.user_id
      ${whereSql}
      ORDER BY sv.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const rows = (Array.isArray(rowsRaw) ? rowsRaw : (rowsRaw as any)?.rows ?? []) as any[];

    const countRaw = await db.execute(sql`SELECT COUNT(*) AS c FROM site_visits sv ${whereSql}`);
    const countArr = (Array.isArray(countRaw) ? countRaw : (countRaw as any)?.rows ?? []) as any[];
    const total = Number(countArr[0]?.c ?? 0) || 0;

    return res.json({
      total,
      limit,
      offset,
      visits: rows.map((r: any) => ({
        id: r.id,
        visitorId: r.visitor_id,
        userId: r.user_id,
        userNickname: r.user_nickname,
        event: r.event,
        path: r.path,
        referrer: r.referrer,
        userAgent: r.user_agent,
        ipPrefix: r.ip_prefix,
        lang: r.lang,
        country: r.country,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[admin/site-visits] error:", err);
    return res.status(500).json({ message: "Errore caricamento visite" });
  }
});

router.get("/telemetry/stats", async (_req: Request, res: Response) => {
  try {
    const [samplesResult, usersResult, kmResult, latestResult] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) AS total FROM ride_telemetry`),
      db.execute(sql`SELECT COUNT(DISTINCT user_id) AS total FROM ride_telemetry`),
      db.execute(sql`
        WITH ordered AS (
          SELECT
            lat, lon, ts, session_id,
            LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
            LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
          FROM ride_telemetry
        ),
        distances AS (
          SELECT
            2 * 6371 * ASIN(
              SQRT(
                POWER(SIN(RADIANS(lat - prev_lat) / 2), 2)
                + COS(RADIANS(prev_lat)) * COS(RADIANS(lat))
                * POWER(SIN(RADIANS(lon - prev_lon) / 2), 2)
              )
            ) AS dist_km
          FROM ordered
          WHERE prev_lat IS NOT NULL AND prev_lon IS NOT NULL
            AND ABS(lat - prev_lat) < 0.5
            AND ABS(lon - prev_lon) < 0.5
        )
        SELECT COALESCE(SUM(dist_km), 0) AS km_collected
        FROM distances
      `),
      db.execute(sql`SELECT MAX(created_at) AS latest FROM ride_telemetry`),
    ]);

    const totalSamples = parseInt((samplesResult.rows[0] as { total: string } | undefined)?.total ?? "0", 10);
    const activeUsers = parseInt((usersResult.rows[0] as { total: string } | undefined)?.total ?? "0", 10);
    const kmCollected = Math.round(parseFloat((kmResult.rows[0] as { km_collected: string } | undefined)?.km_collected ?? "0") * 10) / 10;
    const latestSample = (latestResult.rows[0] as { latest: string | null } | undefined)?.latest ?? null;

    return res.json({ totalSamples, activeUsers, kmCollected, latestSample });
  } catch (err) {
    console.error("[admin/telemetry/stats] error:", err);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

// ─── Map Matching monitor ──────────────────────────────────────────────────────

router.get("/map-matching-stats", async (_req: Request, res: Response) => {
  try {
    const { getMapMatchingStats } = await import("../map-matching-job");
    const stats = await getMapMatchingStats();
    return res.json(stats);
  } catch (err) {
    console.error("[admin/map-matching-stats] error:", err);
    return res.status(500).json({ message: "Errore caricamento stats map matching" });
  }
});

router.post("/map-matching/run", async (req: Request, res: Response) => {
  try {
    const { runMapMatchingJob, isMapMatchingRunning } = await import("../map-matching-job");
    if (isMapMatchingRunning()) {
      return res.status(409).json({ message: "Job già in esecuzione" });
    }
    // Avvia il job in background senza bloccare la risposta HTTP
    runMapMatchingJob()
      .then((result) => {
        console.log("[MAP-MATCH] Esecuzione manuale completata:", result);
      })
      .catch((err) => {
        console.error("[MAP-MATCH] Errore esecuzione manuale:", err);
      });
    return res.json({ message: "Job avviato", started: true });
  } catch (err) {
    console.error("[admin/map-matching/run] error:", err);
    return res.status(500).json({ message: "Errore avvio job" });
  }
});

// ─── Curvy Score Fase 3 ────────────────────────────────────────────────────────

router.get("/curvy-score-stats", async (_req: Request, res: Response) => {
  try {
    const { getCurvyScoreStats } = await import("../curvy-score-job");
    const stats = await getCurvyScoreStats();
    return res.json(stats);
  } catch (err) {
    console.error("[admin/curvy-score-stats] error:", err);
    return res.status(500).json({ message: "Errore caricamento stats curvy score" });
  }
});

router.post("/curvy-score/run", async (req: Request, res: Response) => {
  try {
    const { runCurvyScoreJob, isCurvyScoreJobRunning } = await import("../curvy-score-job");
    if (isCurvyScoreJobRunning()) {
      return res.status(409).json({ message: "Job già in esecuzione" });
    }
    runCurvyScoreJob()
      .then((result) => {
        console.log("[CURVY-SCORE] Esecuzione manuale completata:", result);
      })
      .catch((err) => {
        console.error("[CURVY-SCORE] Errore esecuzione manuale:", err);
      });
    return res.json({ message: "Job avviato", started: true });
  } catch (err) {
    console.error("[admin/curvy-score/run] error:", err);
    return res.status(500).json({ message: "Errore avvio job" });
  }
});

router.put("/curvy-score/weights", async (req: Request, res: Response) => {
  try {
    const { weight_lean, weight_gforce, min_samples } = req.body as {
      weight_lean?: number;
      weight_gforce?: number;
      min_samples?: number;
    };
    if (weight_lean !== undefined) {
      if (typeof weight_lean !== "number" || weight_lean <= 0 || weight_lean > 1) {
        return res.status(400).json({ message: "weight_lean deve essere tra 0 e 1" });
      }
      process.env.CURVY_SCORE_WEIGHT_LEAN = String(weight_lean);
    }
    if (weight_gforce !== undefined) {
      if (typeof weight_gforce !== "number" || weight_gforce <= 0 || weight_gforce > 1) {
        return res.status(400).json({ message: "weight_gforce deve essere tra 0 e 1" });
      }
      process.env.CURVY_SCORE_WEIGHT_GFORCE = String(weight_gforce);
    }
    if (min_samples !== undefined) {
      if (typeof min_samples !== "number" || min_samples < 1) {
        return res.status(400).json({ message: "min_samples deve essere >= 1" });
      }
      process.env.CURVY_SCORE_MIN_SAMPLES = String(Math.round(min_samples));
    }
    const { getCurvyScoreWeights } = await import("../curvy-score-job");
    return res.json({ message: "Pesi aggiornati", weights: getCurvyScoreWeights() });
  } catch (err) {
    console.error("[admin/curvy-score/weights] error:", err);
    return res.status(500).json({ message: "Errore aggiornamento pesi" });
  }
});

router.put("/telemetry-target-km", async (req: Request, res: Response) => {
  try {
    const { target_km } = req.body;
    const parsed = parseInt(String(target_km), 10);
    if (!Number.isFinite(parsed) || parsed < 10 || parsed > 100000) {
      return res.status(400).json({ message: "Valore non valido (10–100000 km)" });
    }
    await storage.upsertAppSetting("telemetry_target_km", String(parsed), null);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: "telemetry_target_km",
      details: `Target telemetria aggiornato: ${parsed} km`,
    });
    return res.json({ target_km: parsed });
  } catch (error) {
    console.error("Admin telemetry-target-km error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/users/:userId/sessions", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: "userId richiesto" });
    const rows = await db.execute(
      sql`SELECT sid, sess->>'sessionType' AS session_type, expire FROM session WHERE sess->>'userId' = ${userId}`
    );
    const sessions = (rows.rows as any[]).map((r) => ({
      sid: r.sid ? `…${String(r.sid).slice(-8)}` : "?",
      sessionType: r.session_type ?? "unknown",
      expiry: r.expire ? new Date(r.expire).toISOString() : null,
    }));
    const webCount = sessions.filter((s) => s.sessionType === "web").length;
    const mobileCount = sessions.filter((s) => s.sessionType === "mobile").length;
    return res.json({ sessions, webCount, mobileCount, total: sessions.length });
  } catch (error) {
    console.error("Admin user sessions error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/users/:userId/sessions/:sid", async (req: Request, res: Response) => {
  try {
    const { userId, sid } = req.params;
    if (!userId || !sid) return res.status(400).json({ message: "Parametri mancanti" });
    const result = await db.execute(
      sql`DELETE FROM session WHERE sess->>'userId' = ${userId} AND sid LIKE ${'%' + sid}`
    );
    const affected = result.rowCount ?? 0;
    if (affected === 0) {
      return res.status(404).json({ ok: false, message: "Sessione non trovata o già scaduta" });
    }
    return res.json({ ok: true, deleted: affected });
  } catch (error) {
    console.error("Admin revoke session error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
