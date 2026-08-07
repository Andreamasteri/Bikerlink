import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { sendSuccess, sendError } from "../lib/api-response";
import { storage } from "../storage";
import { db } from "../db";
import { motoClubs, motoClubMembers, appSettings } from "@shared/db";
import { clientErrorSchema, startupBeaconSchema } from "@shared/validators";
import { eq } from "drizzle-orm";
import { symbolicateStack } from "../lib/symbolicate";
import { getOrFetchAdminCached, deleteAdminCached } from "../lib/admin-auth-cache";


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
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "Too many startup beacons");
  },
});


const clientErrorJson = express.json({ limit: "16kb" });
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ received: true });
  },
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

async function _requireAdmin(req: Request, res: Response, next: Function) {
  const path = req.originalUrl || req.url;
  // Ultimi 6 char del sessionId per la diagnostica (no PII, no leak completo).
  const sid = req.sessionID ? `…${req.sessionID.slice(-6)}` : "none";
  // Task #2694 — bypass per il self-check watchdog interno (solo loopback +
  // token in-memory generato a runtime). Necessario per probare l'API reale
  // senza una sessione admin live.
  try {
    const mod = require("../ai/watchdog/internal-token") as typeof import("../ai/watchdog/internal-token");
    const hdr = req.headers[mod.getInternalProbeHeaderName()];
    const tokenHeader = Array.isArray(hdr) ? hdr[0] : hdr;
    if (tokenHeader && tokenHeader === mod.getInternalProbeToken() && mod.isLoopback(req.ip)) {
      (req as Request & { currentUser?: unknown }).currentUser = {
        id: "__watchdog__", role: "admin", status: "active",
      };
      // Niente DB lookup: il middleware globale di gating non si applica al
      // pseudo-utente, e nessuna scrittura attribuita a un user reale.
      return next();
    }
  } catch {/* token module non disponibile: ignora bypass */}
  if (!req.session?.userId) {
    console.warn(`[admin-auth] 401 reason=no-session path=${path} sid=${sid}`);
    return sendError(res, 401, "Sessione scaduta. Effettua di nuovo l'accesso.");
  }
  const cacheKey = req.session.userId;
  // Task #397 — shared cache: tutti i middleware admin usano lo stesso Map così
  // invalidateAdminAuthCache() li svuota tutti in un colpo solo.
  // Task #770 — in-flight dedup: getOrFetchAdminCached previene N SELECT users
  // quando N richieste parallele arrivano con cache fredda.
  let user: Awaited<ReturnType<typeof storage.getUser>>;
  try {
    const result = await getOrFetchAdminCached(cacheKey, () => storage.getUser(cacheKey));
    user = result as typeof user;
  } catch (err) {
    console.error(`[admin-auth] 500 reason=db-error path=${path} sid=${sid} userId=${cacheKey}`, err);
    return sendError(res, 500, "Errore autenticazione admin");
  }
  if (!user) {
    console.warn(`[admin-auth] 403 reason=user-not-found path=${path} sid=${sid} userId=${cacheKey}`);
    return sendError(res, 403, "Account non trovato.");
  }
  if (user.role !== "admin") {
    console.warn(`[admin-auth] 403 reason=not-admin path=${path} sid=${sid} userId=${user.id} role=${user.role}`);
    deleteAdminCached(cacheKey);
    return sendError(res, 403, "Accesso riservato agli amministratori.");
  }
  // Task #1078: defense-in-depth — admin sospeso/bloccato non deve continuare
  // a chiamare endpoint privilegiati anche se la sessione è ancora viva.
  // (Il middleware globale in routes.ts dovrebbe già averla distrutta.)
  if (user.status !== "active") {
    console.warn(`[admin-auth] 403 reason=not-active path=${path} sid=${sid} userId=${user.id} status=${user.status}`);
    deleteAdminCached(cacheKey);
    return sendError(res, 403, "Account non attivo.");
  }
  (req as Request & { currentUser?: unknown }).currentUser = user;
  next();
}



// Cache breve del flag BootGuard: evita una query DB su OGNI client-error.
// Quando il BootGuard è attivo persistiamo l'ultimo errore di boot in app_settings
// (boot_gate_latest_error) così l'agente lo legge in tempo reale via dump-boot-log.
let _bootGuardFlagCache: { value: boolean; expiresAt: number } | null = null;
const _BOOTGUARD_CACHE_TTL_MS = 30_000;

async function isBootGuardActive(): Promise<boolean> {
  if (_bootGuardFlagCache && _bootGuardFlagCache.expiresAt > Date.now()) {
    return _bootGuardFlagCache.value;
  }
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "boot_gate_enabled"))
      .limit(1);
    const value = row?.value === "true";
    _bootGuardFlagCache = { value, expiresAt: Date.now() + _BOOTGUARD_CACHE_TTL_MS };
    return value;
  } catch {
    return false;
  }
}

router.post("/client-error", clientErrorLimiter, clientErrorJson, async (req: Request, res: Response) => {
  try {
    const parsedCe = clientErrorSchema.safeParse(req.body || {});
    const { message, stack, componentStack, platform, appVersion, isFatal } = parsedCe.success ? parsedCe.data : {};

    let resolvedStack = stack || "";
    if (resolvedStack && appVersion) {
      try {
        resolvedStack = await symbolicateStack(resolvedStack, appVersion);
      } catch { /* fallback allo stack originale */ }
    }

    // GDPR/CCPA compliance: do NOT log req.ip — client IP must not appear in error logs
    const csText = (componentStack || "").substring(0, 3000);
    console.error("[CLIENT-ERROR]", JSON.stringify({
      message: message || "unknown",
      stack: resolvedStack.substring(0, 2000),
      platform: platform || "unknown",
      appVersion: appVersion || "unknown",
      isFatal: !!isFatal,
      timestamp: new Date().toISOString()
    }));
    // Log componentStack su riga separata per evitare troncamento nel tool di deployment logs
    if (csText) {
      console.error("[CLIENT-ERROR-CS]", csText);
    }

    // BootGuard attivo → persisti l'errore così dump-boot-log lo mostra in tempo reale.
    if (await isBootGuardActive()) {
      const errSnapshot = JSON.stringify({
        message: (message || "unknown").substring(0, 500),
        stack: resolvedStack.substring(0, 2000),
        componentStack: csText,
        platform: platform || "unknown",
        appVersion: appVersion || "unknown",
        isFatal: !!isFatal,
        ts: Date.now(),
      });
      storage.upsertAppSetting("boot_gate_latest_error", errSnapshot)
        .catch(() => {/* best-effort: non blocchiamo il report */});
    }

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
import usersNextRouter from './admin/users.next';
import usersNextDetailRouter from './admin/users.next-detail';
import usersNextMatchSummaryRouter from './admin/users.next-match-summary';
import usersExtraRouter from './admin/users-extra';
import settingsRouter from './admin/settings';
import emailRouter from './admin/email';
import adsRouter from './admin/advertisements';
import adsNextRouter from './admin/advertisements.next';
import analyticsRouter from './admin/analytics';
import stregattiRouter from './admin/stregatti';
import miscRouter from './admin/misc';
import miscNextRouter from './admin/misc.next';
import businessRouter from './admin/business';
import reportsHubRouter from './admin/reports-hub';
import matchingRouter from './admin/matching';
import abRouter from './admin/ab';
import embeddingsRouter from './admin/embeddings';
import nadirRouter from './admin/nadir';
import aresJobsRouter from './admin/ares-jobs';
import horusScanRouter from './admin/horus-scan';
import otaRouter from './admin/ota';
import otaAssistantRouter from './admin/ota-assistant';
import mapsAdminRouter from './admin/maps/index';
import routingAdminRouter from './admin/routing/index';
import routingAreasAdminRouter from './admin/routing-areas/index';
import telemetryAdminRouter from './admin/telemetry';
import drCorrectionAdminRouter from './admin/dr-correction';
import dbAdminRouter from './admin/db';
import translationsRouter from './admin/translations';
import tagsRouter from './admin/tags';
import textAliasesRouter from './admin/text-aliases';
import aiModerationRouter from './admin/ai-moderation';
import aiModerationNextRouter from './admin/ai-moderation.next';
import aiWatchdogRouter from './admin/ai-watchdog';
import dbIntegrityRouter from './admin/db-integrity';
import appIntegrityRouter from './admin/app-integrity';
import aiConsoleRouter from './admin/ai-console';
import aiConsoleNextRouter from './admin/ai-console.next';
import aiCoordinatorRouter from './admin/ai-coordinator';
import matchingCoordinatorRouter from './admin/matching-coordinator';
import aiCoordinatorGovernanceRouter from './admin/ai-coordinator-governance';
// Task #10 (Quebracho c) — registry job coordinatore + monitor unificato 4 AI.
import coordinatorJobsRouter from './admin/coordinator-jobs';
import aiMonitorRouter from './admin/ai-monitor';
import metricsRouter from './admin/metrics';
// Task #2698 — AI Assistant per utenti normali (admin config/telemetria).
import aiAssistantAdminRouter from './admin/ai-assistant';
import backupPreviewRouter from './admin/backup-preview';
import exportsRouter from './admin/exports';
import legalRouter from './admin/legal';
import legalNextRouter from './admin/legal.next';
// Task #2852 — Test stato server Ollama (provider AI primario).
import aiTestOllamaRouter from './admin/ai/test-ollama';
// Task #2932 — Configurazione provider AI resolver percorsi (Ollama/Groq/Gemini).
import aiRouteProvidersRouter from './admin/ai/route-providers';
// Task #3017 — Metriche chiamate AI (provider usage, latenza, token, costo, degraded, repair).
import aiMetricsRouter from './admin/ai/metrics';
import bowieStandaloneRouter from './admin/bowie-standalone';
// Task #51 — Conversazione osservabile a più agenti (Horus/Bowie/Quebracho).
import aiGroupChatRouter from './admin/ai-group-chat';
// Salute unificata servizi self-hosted ThinkCentre (GraphHopper/Ollama/Photon).
import thinkcentreHealthRouter from './admin/thinkcentre-health';
// Metriche hardware ThinkCentre (CPU/RAM/uptime via agente Node.js sul mini-PC).
import thinkcentreMetricsRouter from './admin/thinkcentre-metrics';
// Lightweight System Health probe — returns cached dot statuses updated by the heavy endpoints.
import systemProbeRouter from './admin/system-probe';
// Task #3894 — Raccolta bug consolidata per il FAB admin.
import bugReportRouter from './admin/bug-report';
import resourceMonitorRouter from './admin/resource-monitor';
// Task #64 — Database Monitor: storia carico DB + backend, retention 30+g, download.
import dbMonitorRouter from './admin/db-monitor';
import diagnosticAdminRouter from './admin/diagnostic';
import pipelineCheckRouter from './admin/pipeline-check';
import healthCheckRouter from './admin/health-check';
import diagnosticsStreamRouter from './admin/diagnostics-stream';
import bootLogAdminRouter from './admin/boot-log';
import metroCrashRouter from './admin/metro-crash';
import coordinateHistoryAdminRouter from './admin/coordinate-history';
// Task #997 — Sync prod→dev (trigger manuale + status).
import dbSyncRouter from './sync';
import secretVaultRouter from './admin/secret-vault';

router.post('/maps/osm-updated', async (req: Request, res: Response) => {
  try {
    const secret = process.env.OSM_UPDATE_SECRET;
    const provided = req.headers["x-osm-update-secret"];
    if (!secret || !provided || provided !== secret) {
      return sendError(res, 401, "Non autorizzato");
    }
    const { updatedAt } = req.body as { updatedAt?: string };
    const ts = updatedAt ?? new Date().toISOString();
    await storage.upsertAppSetting("osm_last_updated_at", ts);
    console.log(`[osm-updated] osm_last_updated_at aggiornato a ${ts}`);
    return res.json({ ok: true, osm_last_updated_at: ts });
  } catch (err) {
    console.error("[osm-updated] error:", err);
    return sendError(res, 500, "Errore aggiornamento data OSM");
  }
});

router.get('/privacy-rules', _requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [showDistance, offlineRandomize, mapFilter] = await Promise.all([
      storage.getAppSetting("show_distance_counter"),
      storage.getAppSetting("offline_position_randomize"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    return res.json({
      showDistanceInCounter: showDistance?.valueJson === true || showDistance?.value === "true" || (showDistance == null ? true : false),
      offlinePositionRandomize: offlineRandomize?.valueJson === true || offlineRandomize?.value === "true" || (offlineRandomize == null ? true : false),
      mapVisibilityFilter: (mapFilter?.value as string) || "all",
    });
  } catch (_error) {
    console.error("[admin] GET /privacy-rules error:", _error);
    return sendError(res, 500, "Errore lettura regole privacy");
  }
});

router.patch('/privacy-rules', _requireAdmin, async (req: Request, res: Response) => {
  try {
    const { showDistanceInCounter, offlinePositionRandomize, mapVisibilityFilter } = req.body as {
      showDistanceInCounter?: boolean;
      offlinePositionRandomize?: boolean;
      mapVisibilityFilter?: string;
    };
    const updates: Promise<unknown>[] = [];
    if (typeof showDistanceInCounter === "boolean") {
      updates.push(storage.upsertAppSetting("show_distance_counter", undefined, showDistanceInCounter));
    }
    if (typeof offlinePositionRandomize === "boolean") {
      updates.push(storage.upsertAppSetting("offline_position_randomize", undefined, offlinePositionRandomize));
    }
    if (typeof mapVisibilityFilter === "string" && ["all", "online_only", "available_only"].includes(mapVisibilityFilter)) {
      updates.push(storage.upsertAppSetting("map_visibility_filter", mapVisibilityFilter));
    }
    await Promise.all(updates);
    const [showDistance, offlineRandomize, mapFilter] = await Promise.all([
      storage.getAppSetting("show_distance_counter"),
      storage.getAppSetting("offline_position_randomize"),
      storage.getAppSetting("map_visibility_filter"),
    ]);
    return res.json({
      showDistanceInCounter: showDistance?.valueJson === true || showDistance?.value === "true" || (showDistance == null ? true : false),
      offlinePositionRandomize: offlineRandomize?.valueJson === true || offlineRandomize?.value === "true" || (offlineRandomize == null ? true : false),
      mapVisibilityFilter: (mapFilter?.value as string) || "all",
    });
  } catch (_error) {
    console.error("[admin] PATCH /privacy-rules error:", _error);
    return sendError(res, 500, "Errore aggiornamento regole privacy");
  }
});

router.post('/restart', _requireAdmin, (_req: Request, res: Response) => {
  res.json({ ok: true, message: "Backend in riavvio…" });
  setTimeout(() => {
    console.log("[admin] restart: processo terminato per riavvio backend");
    process.exit(0);
  }, 200);
});

router.use('/translations', _requireAdmin, translationsRouter);
router.use('/tags', _requireAdmin, tagsRouter);
router.use('/', _requireAdmin, textAliasesRouter);
router.use('/users', _requireAdmin, usersRouter);
router.use('/users', _requireAdmin, usersNextRouter);
router.use('/users', _requireAdmin, usersNextDetailRouter);
router.use('/users', _requireAdmin, usersNextMatchSummaryRouter);
router.use('/users', _requireAdmin, usersExtraRouter);
router.use('/settings', _requireAdmin, settingsRouter);
router.use('/', _requireAdmin, emailRouter);
router.use('/advertisements', _requireAdmin, adsRouter);
router.use('/advertisements', _requireAdmin, adsNextRouter);
router.use('/analytics', _requireAdmin, analyticsRouter);
router.use('/stregatti', _requireAdmin, stregattiRouter);
// L'ordine importa: il sub-router /ota/assistant deve essere registrato PRIMA di /ota
// per evitare che le rotte come /:id/approve di otaRouter catturino "assistant" come id.
router.use('/ota/assistant', _requireAdmin, otaAssistantRouter);
router.use('/ota', _requireAdmin, otaRouter);
router.use('/maps', _requireAdmin, mapsAdminRouter);
router.use('/ai', _requireAdmin, aiTestOllamaRouter);
router.use('/ai', _requireAdmin, aiRouteProvidersRouter);
router.use('/ai', _requireAdmin, aiMetricsRouter);
router.use('/bowie-standalone', _requireAdmin, bowieStandaloneRouter);
router.use('/ai', _requireAdmin, aiGroupChatRouter);
router.use('/', _requireAdmin, thinkcentreHealthRouter);
router.use('/', _requireAdmin, thinkcentreMetricsRouter);
router.use('/', _requireAdmin, systemProbeRouter);
router.use('/routing', _requireAdmin, routingAdminRouter);
router.use('/routing-areas', _requireAdmin, routingAreasAdminRouter);
router.use('/', _requireAdmin, dbAdminRouter);
router.use('/', _requireAdmin, telemetryAdminRouter);
router.use('/', _requireAdmin, drCorrectionAdminRouter);
router.use('/', _requireAdmin, reportsHubRouter);
router.use('/', _requireAdmin, miscRouter);
router.use('/', _requireAdmin, miscNextRouter);
router.use('/', _requireAdmin, businessRouter);
router.use('/', _requireAdmin, matchingRouter);
router.use('/', _requireAdmin, abRouter);
router.use('/embeddings', _requireAdmin, embeddingsRouter);
router.use('/nadir', _requireAdmin, nadirRouter);
router.use('/ares', _requireAdmin, aresJobsRouter);
router.use('/horus-scan', _requireAdmin, horusScanRouter);
// Task #2532 — Co-Pilot AI Moderazione.
router.use('/', _requireAdmin, aiModerationRouter);
router.use('/', _requireAdmin, aiModerationNextRouter);
// Task #2533 — AI System Watchdog.
router.use('/', _requireAdmin, aiWatchdogRouter);
// Task #2536 — AI Database Integrity.
router.use('/', _requireAdmin, dbIntegrityRouter);
router.use('/', _requireAdmin, appIntegrityRouter);
// Task #5318 — Matching Coordinator (control plane unificato, autorità Horus).
router.use('/', _requireAdmin, matchingCoordinatorRouter);
// Task #10 — registry job coordinatore Quebracho + monitor unificato 4 AI.
router.use('/', _requireAdmin, coordinatorJobsRouter);
router.use('/', _requireAdmin, aiMonitorRouter);
router.use('/', aiConsoleRouter);
router.use('/', aiConsoleNextRouter);
// Task #2649 — Layer AI Coordinato (auth interno: requireConsoleRole).
router.use('/', aiCoordinatorRouter);
router.use('/', aiCoordinatorGovernanceRouter);
router.use('/', _requireAdmin, metricsRouter);
// Task #2698 — config + telemetria AI Assistant utente (admin only).
router.use('/', _requireAdmin, aiAssistantAdminRouter);
router.use('/', _requireAdmin, backupPreviewRouter);
router.use('/', _requireAdmin, exportsRouter);
router.use('/legal', _requireAdmin, legalRouter);
router.use('/legal', _requireAdmin, legalNextRouter);
// Task #3894 — Raccolta bug FAB.
router.use('/', _requireAdmin, bugReportRouter);
router.use('/', _requireAdmin, resourceMonitorRouter);
router.use('/', _requireAdmin, dbMonitorRouter);
router.use('/', _requireAdmin, diagnosticAdminRouter);
router.use('/', _requireAdmin, pipelineCheckRouter);
router.use('/', _requireAdmin, healthCheckRouter);
router.use('/', _requireAdmin, diagnosticsStreamRouter);
router.use('/boot-log', _requireAdmin, bootLogAdminRouter);
router.use('/', _requireAdmin, metroCrashRouter);
router.use('/coordinate-history', _requireAdmin, coordinateHistoryAdminRouter);
// Task #997 — Sync prod→dev: trigger manuale e status.
router.use('/', _requireAdmin, dbSyncRouter);
// Secret Vault: metadata-only reads; encrypted relay on writes.
router.use('/', _requireAdmin, secretVaultRouter);

export default router;
