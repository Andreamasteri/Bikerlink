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
import { motoClubs, motoClubRequests, motoClubMembers, motoClubInvites, zavarrinaWishlists, zavarrinaWishlistMotos, conversations, conversationParticipants, messages, feedbackTickets, moderatorLogs, users, userProfiles, userMotorcycles, bikerZavarrinaMatches, bikerBikerMatches, serverRestarts, appSettings, userMusicTracks, userLastfmSessions, userPlaylistSnapshots, otaEvents, adCampaigns as adCampaignsTable, matchPreferences, gpsRejectionStats, siteVisits, rideTelemetry, routes, otaPublishTokens, otaErrorSchema, createAdCampaignSchema, createInviteCodeSchema, upsertSettingSchema, emailConfigSchema, disableFeatureSchema, toggleProtectedSchema, publishWithSlotSchema, createOtaTokenSchema, assignOtaSlotSchema, publishOtaReleaseSchema, booleanSettingValueSchema, stringSettingValueSchema, mapsProviderSchema, clientErrorSchema, startupBeaconSchema, verifyPasswordSchema, userStatusSchema, userRoleSchema, userEmailAdminSchema, adminSetPasswordSchema, primalSchema, workshopSchema, easterEggSchema, easterEggBatchSchema, reportResolveSchema, emailTestSchema, emailRateLimitResetSchema, themeDefaultSchema, matchingCountriesSchema, coordinatesMaxAgeSchema, genericSettingSchema, adsBulkSchema, adsCreateSchema, adsUpdateSchema, adsBulkDeleteSchema, adsGroupUpdateSchema, stregattaSchema, stregattaToggleSchema, rejectNoteSchema, simulateActivitySchema, updateInvitationCodeAdminSchema, enabledSchema, backupFrequencySchema, reconcileClubInvitesSchema, translationKeySchema, coordinateHistorySettingsSchema, bgLocationSettingsSchema, privacyRulesSchema, nativeVersionSchema, otaAssignDeviceSchema, otaPromoteSchema, otaMarkBrokenSchema, urlSettingSchema, maintenanceSettingsSchema, curvyScoreWeightsSchema, telemetryTargetKmSchema } from "@shared/schema";
import { DEFAULT_PREFS } from "./match-preferences";
import { createClubInvitesForMoto } from "./motoclubs";
import { eq, and, ne, desc, sql, count, notExists, inArray, notInArray, lte, isNull, or, ilike } from "drizzle-orm";
import { sendEmail, sendEmailDetailed, getEmailDiagnostics } from "../email";
import { sendOtaPendingApprovalPushToAdmins } from "../push-notifications";
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
import { bustLandingImagesCache } from "../site/routes";

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
    const parsedOtaErr = otaErrorSchema.safeParse(req.body);
    if (!parsedOtaErr.success) {
      return res.status(400).json({ message: parsedOtaErr.error.issues[0].message });
    }
    const {
      error, failCount, updateId, runtimeVersion, phase, source, platform,
      // Task #1625: stable device fingerprint (replaces IP-based tracking).
      deviceId,
      // Task #1148: nuovi campi diagnostici opzionali (tutti troncati sotto).
      errorCode, errorCause, errorUserInfo, nativeStack, updateUrl, channel, networkInfo, probe,
    } = parsedOtaErr.data;

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
      timestamp: new Date().toISOString(),
    }));
    return res.json({ received: true });
  } catch {
    return res.status(200).json({ received: true });
  }
});

router.post("/startup-beacon", startupBeaconLimiter, startupBeaconJson, (req: Request, res: Response) => {
  try {
    const parsedSb = startupBeaconSchema.safeParse(req.body ?? {});
    if (!parsedSb.success) return res.status(400).json({ message: parsedSb.error.issues[0].message });
    const { step, ts, recovered, platform, ...rest } = parsedSb.data;
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

import otaRouter from './admin/ota';
import usersRouter from './admin/users';
import settingsRouter from './admin/settings';
import adsRouter from './admin/advertisements';
import analyticsRouter from './admin/analytics';
import stregattiRouter from './admin/stregatti';
import miscRouter from './admin/misc';
import matchingRouter from './admin/matching';

router.use('/', otaRouter);
router.use('/users', usersRouter);
router.use('/settings', settingsRouter);
router.use('/advertisements', adsRouter);
router.use('/analytics', analyticsRouter);
router.use('/stregatti', stregattiRouter);
router.use('/', miscRouter);
router.use('/', matchingRouter);

export default router;
