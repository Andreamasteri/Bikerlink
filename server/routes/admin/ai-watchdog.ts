// LARGE-FILE-ALLOW: route admin monolitica con ~20 endpoint watchdog — split crea accoppiamento inutile.
// Task #2533 — Endpoint admin AI System Watchdog.
import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { db } from "../../db";
import { storage } from "../../storage";
import { aiWatchdogLog, weeklySystemReports, systemSignals } from "@shared/db";
import { desc, eq, sql, and, gte, or } from "drizzle-orm";
import { isHubConfigured, isHubAvailable, hasHubBeenProbed } from "../../lib/ai-hub-client";
import { z } from "zod";
import { getLatestSnapshot, runAggregatorCycle, getRecentSnapshots, isAggregatorCycleInFlight, getSnoozedUntil, setSnoozedUntil } from "../../ai/watchdog/aggregator";
import { resetState as resetDbCollector } from "../../ai/watchdog/collectors/db-collector";
import { resetState as resetPoolCollector } from "../../ai/watchdog/collectors/pool-collector";
import { resetState as resetOverloadCollector } from "../../ai/watchdog/collectors/overload-collector";
import { resetState as resetErrorCollector } from "../../ai/watchdog/collectors/error-collector";
import { resetState as resetCrashSignalsCollector } from "../../ai/watchdog/collectors/crash-signals-collector";
import { streamWatchdogChat } from "../../ai/watchdog/chat";
import { isWatchdogEnabled, setWatchdogEnabled } from "../../ai/watchdog/kill-switch";
import { getWatchdogStats } from "../../ai/watchdog/scheduler";
import { runAutoFix } from "../../ai/watchdog/auto-fix";
import { runProposer } from "../../ai/watchdog/proposer";
import { runHorusRoutingProposer } from "../../ai/watchdog/horus-proposer";
import { markProposalAccepted, markProposalRejected } from "../../ai/watchdog/log";
import { runWeeklyReport } from "../../ai/watchdog/weekly-report";
import {
  type MapsKillSwitchKey,
  getAllMapsFlags, setMapsFlag,
} from "../../ai/watchdog/maps-kill-switch";

const MAPS_FLAGS: readonly MapsKillSwitchKey[] = ["telemetry", "collector", "llm", "alerts"] as const;
import { getMapsTelemetryBuckets, aggregateMapsTelemetry, getMapsSummaryTelemetry, getDistinctAppVersions } from "../../ai/watchdog/maps-telemetry-store";
import { getLastHealthCheckResults, runMapsHealthChecks } from "../../ai/watchdog/maps-health-checks";
import { getRoutingCounters } from "../../routing/routing-metrics";
import { getAiTokenAuditStatus, clearAuditError } from "../../ai/audit";
import { getProposerSettings, setProposerModel } from "../../ai/watchdog/proposer";
import { getGroqTpdStatus, resetGroqTpd, setGroqTpdSoftCap } from "../../ai/groq-quota";

const router = Router();

router.get("/watchdog/snapshot", async (_req, res) => {
  const enabled = await isWatchdogEnabled();
  const snap = getLatestSnapshot();
  const stats = getWatchdogStats();
  // Task #157 — ultimo heartbeat del loop scheduler matching (liveness 60s),
  // mostrato in system-health come "X secondi fa".
  let schedulerLastHeartbeat: string | null = null;
  try {
    const row = await storage.getAppSetting("matching_scheduler_state");
    const parsed = row?.valueJson as { lastTickAt?: string | null } | null;
    schedulerLastHeartbeat = parsed?.lastTickAt ?? null;
  } catch { /* non-fatal: campo opzionale */ }
  // Task #567 — snooze attivo: esponiamo snoozedUntil (ISO string) così il
  // frontend può mostrare il countdown e il pulsante "Riattiva ora".
  const snoozedUntil = getSnoozedUntil()?.toISOString() ?? null;
  return res.json({ enabled, snapshot: snap, stats, schedulerLastHeartbeat, snoozedUntil });
});

router.get("/watchdog/snapshots", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 60)));
  const rows = await getRecentSnapshots(limit);
  return res.json({ snapshots: rows });
});

router.post("/watchdog/run-now", async (_req, res) => {
  if (!(await isWatchdogEnabled())) return sendError(res, 409, "Watchdog disabilitato (kill-switch)");
  try {
    const snap = await runAggregatorCycle();
    const fixes = await runAutoFix(snap);
    return res.json({ snapshot: snap, autoFixes: fixes });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// Task #154 — Svuota lista errori watchdog: azzera i contatori/latch interni dei
// collector (che possono restare "appiccicati" dopo un incidente rientrato) e
// rigenera subito uno snapshot pulito. Protetto dalla stessa guardia admin delle
// altre route watchdog (montaggio del router).
router.post("/watchdog/reset-state", async (_req, res) => {
  try {
    // Guardia anti-race: se un ciclo aggregator è in corso i collector stanno
    // leggendo il loro stato; attendiamo fino a 2s che finisca (poll ogni 100ms)
    // per evitare di azzerare a metà lettura. Se non rientra procediamo comunque
    // loggando un warning: il ciclo successivo ripartirà comunque pulito.
    const cycleWasRunning = isAggregatorCycleInFlight();
    if (cycleWasRunning) {
      const deadline = Date.now() + 2000;
      while (isAggregatorCycleInFlight() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (isAggregatorCycleInFlight()) {
        console.warn("[watchdog] reset-state: ciclo aggregator ancora in corso dopo 2s, procedo comunque");
      }
    }

    // Azzera lo stato in-process di ogni collector che ne mantiene.
    resetDbCollector();
    resetPoolCollector();
    resetOverloadCollector();
    resetErrorCollector();
    resetCrashSignalsCollector();

    const resetAt = new Date().toISOString();

    // Task #567 — Snooze: imposta un silenzio di 10 minuti in modo che i problemi
    // DB-persistenti (vacuum.last_attempt, matching.last_run_h, ecc.) non
    // ricompaiano immediatamente al prossimo tick. I CRITICAL tornano visibili
    // dopo 2 minuti come rete di sicurezza.
    const SNOOZE_MS = 10 * 60 * 1000;
    setSnoozedUntil(new Date(Date.now() + SNOOZE_MS));
    const snoozedUntil = getSnoozedUntil()!.toISOString();

    // Rigenera subito uno snapshot pulito così il pannello si aggiorna senza
    // attendere il prossimo tick (~60s).
    try {
      await runAggregatorCycle();
    } catch (err) {
      console.warn("[watchdog] reset-state: rigenerazione snapshot fallita (non-fatale):", (err as Error).message);
    }

    return res.json({ ok: true, resetAt, cycleWasRunning, snoozedUntil });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// Task #567 — Cancella lo snooze manualmente ("Riattiva ora"): ripristina
// immediatamente il monitoraggio pieno senza attendere i 10 minuti.
router.post("/watchdog/snooze/cancel", (_req, res) => {
  setSnoozedUntil(null);
  return res.json({ ok: true, snoozedUntil: null });
});

router.post("/watchdog/enabled", async (req, res) => {
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  await setWatchdogEnabled(parsed.data.enabled);
  return res.json({ enabled: parsed.data.enabled });
});

router.get("/watchdog/logs", async (req, res) => {
  const kind = String(req.query.kind ?? "");
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const rows = await (kind
    ? db.select().from(aiWatchdogLog).where(eq(aiWatchdogLog.kind, kind))
        .orderBy(desc(aiWatchdogLog.createdAt)).limit(limit)
    : db.select().from(aiWatchdogLog).orderBy(desc(aiWatchdogLog.createdAt)).limit(limit));
  return res.json({ logs: rows.map((r) => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    acceptedAt: r.acceptedAt instanceof Date ? r.acceptedAt.toISOString() : r.acceptedAt,
    rejectedAt: r.rejectedAt instanceof Date ? r.rejectedAt.toISOString() : r.rejectedAt,
  })) });
});

router.post("/watchdog/propose-now", async (_req, res) => {
  if (!(await isWatchdogEnabled())) return sendError(res, 409, "Watchdog disabilitato");
  const snap = getLatestSnapshot();
  if (!snap) return sendError(res, 503, "Nessun snapshot ancora generato");
  // Task #25 — genera sia le proposte generiche sia quelle di routing (namespace
  // "horus", gestito dal proposer dedicato di Horus). Le eseguiamo in serie:
  // condividono budget/quota AI e restano poche chiamate.
  // Task #890 — force:true bypassa il fingerprint check così premendo "Proponi"
  // nell'header admin si ottengono sempre nuove proposte, indipendentemente da
  // quante volte è stato premuto di recente.
  const out = await runProposer(snap, { force: true });
  // Task #892 — force:true bypassa anche il fingerprint check del proposer di
  // routing Horus, così "Proponi" genera sempre nuove proposte routing come fa
  // già il proposer generico.
  const horusOut = await runHorusRoutingProposer(snap, { force: true });
  const proposals = [...(out?.proposals ?? []), ...(horusOut?.proposals ?? [])];
  return res.json({ proposals, meta: out?.meta ?? horusOut?.meta ?? null });
});

router.post("/watchdog/proposals/:id/accept", async (req, res) => {
  const id = String(req.params.id ?? "");
  const adminId = req.session?.userId as string | undefined;
  if (!id) return sendError(res, 400, "id mancante");
  if (!adminId) return sendError(res, 401, "Sessione scaduta");
  await markProposalAccepted(id, adminId);

  // Task #2554 — dispatcher: se la proposta indica un'azione automatizzabile
  // (releaseLockZombie / clearCacheDegraded / resetErrorWindow) la eseguiamo
  // qui dopo l'accept. Per azioni non mappate o riskLevel="high" restiamo
  // manual-only e ritorniamo dispatch=null.
  let dispatch: { action: string; applied: boolean; autoApplied: boolean; summary: string; message: string } | null = null;
  try {
    const [row] = await db.select().from(aiWatchdogLog).where(eq(aiWatchdogLog.id, id)).limit(1);
    const details = (row?.details ?? {}) as Record<string, unknown>;
    // Proposal logs store `action` as an object { kind, target, params } (Proposal type).
    // Legacy logs may store it as a plain string. Support both.
    const rawAction = details.action;
    const action =
      rawAction && typeof rawAction === "object" && typeof (rawAction as Record<string, unknown>).kind === "string"
        ? (rawAction as Record<string, unknown>).kind as string
        : typeof rawAction === "string"
          ? rawAction
          : null;
    const riskLevel = typeof details.riskLevel === "string" ? details.riskLevel : null;
    if (action && riskLevel !== "high") {
      const snap = getLatestSnapshot();
      if (snap) {
        // Usa il registro PROPOSAL_DISPATCH_RULES (solo accept-time) — NON
        // AUTO_FIX_RULES (scheduler-driven) — per evitare esecuzione autonoma
        // di operazioni ad alto impatto fuori dal controllo dell'admin.
        const { PROPOSAL_DISPATCH_RULES } = await import("../../ai/watchdog/auto-fix");
        const rule = PROPOSAL_DISPATCH_RULES[action];
        if (rule) {
          const out = await rule.run(snap);
          const autoApplied = out.applied;
          const summary = out.applied ? out.summary : out.reason;
          dispatch = {
            action,
            applied: out.applied,
            autoApplied,
            summary,
            message: autoApplied ? `Fix applicato automaticamente: ${summary}` : "Azione manuale richiesta",
          };
        }
      }
    }
    // Azioni non mappate a nessuna regola o manual_only: dispatch null → frontend mostra messaggio manuale.
  } catch (err) {
    console.warn("[watchdog] dispatch error (non-fatal):", err);
  }
  return res.json({ id, status: "accepted", dispatch });
});

router.post("/watchdog/proposals/:id/reject", async (req, res) => {
  const id = String(req.params.id ?? "");
  const adminId = req.session?.userId as string | undefined;
  if (!id) return sendError(res, 400, "id mancante");
  if (!adminId) return sendError(res, 401, "Sessione scaduta");
  const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
  await markProposalRejected(id, adminId, reason);
  return res.json({ id, status: "rejected" });
});

router.get("/watchdog/weekly-reports", async (req, res) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit ?? 8)));
  const rows = await db.select().from(weeklySystemReports)
    .orderBy(desc(weeklySystemReports.createdAt)).limit(limit);
  return res.json({ reports: rows.map((r) => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  })) });
});

router.post("/watchdog/weekly-reports/run", async (_req, res) => {
  const id = await runWeeklyReport();
  return res.json({ id });
});

// Chat SSE (stesso pattern di ai-moderation.ts)
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000),
  })).min(1).max(40),
});

router.post("/watchdog/chat", async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const adminId = req.session?.userId as string | undefined;
  if (!adminId) return sendError(res, 401, "Sessione scaduta");

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const { result } = await streamWatchdogChat({ messages: parsed.data.messages, adminId });
    for await (const chunk of result.textStream) {
      res.write(`data: ${JSON.stringify({ type: "text", chunk })}\n\n`);
    }
    const final = await result.text;
    res.write(`event: done\ndata: ${JSON.stringify({ final })}\n\n`);
    res.end();
  } catch (err) {
    const message = (err as Error).message ?? "errore AI";
    const code = message.startsWith("AI_BUDGET_EXCEEDED") ? "budget_exceeded"
      : message.startsWith("AI_WATCHDOG_DISABLED") ? "disabled"
      : message.startsWith("AI_PROVIDER_UNAVAILABLE") ? "provider_unavailable"
      : "error";
    res.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
    res.end();
  }
});

// === Task #2686 — Maps watchdog admin endpoints ===

router.get("/watchdog/maps/flags", async (_req, res) => {
  const flags = await getAllMapsFlags();
  return res.json({ flags });
});

router.post("/watchdog/maps/flags", async (req, res) => {
  const schema = z.object({
    flag: z.enum(MAPS_FLAGS as unknown as [MapsKillSwitchKey, ...MapsKillSwitchKey[]]),
    enabled: z.boolean(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  await setMapsFlag(parsed.data.flag, parsed.data.enabled);
  return res.json({ flag: parsed.data.flag, enabled: parsed.data.enabled });
});

router.get("/watchdog/maps/buckets", async (req, res) => {
  const minutes = Math.min(1440, Math.max(15, Number(req.query.minutes ?? 60)));
  const hours = Math.max(1, Math.ceil(minutes / 60));
  const eventType = typeof req.query.eventType === "string" && req.query.eventType ? req.query.eventType : undefined;
  const appVersion = typeof req.query.appVersion === "string" && req.query.appVersion ? req.query.appVersion : undefined;
  const [buckets, versions] = await Promise.all([
    getMapsTelemetryBuckets(hours, 60, eventType, appVersion),
    getDistinctAppVersions(),
  ]);
  return res.json({ minutes, buckets, versions });
});

router.get("/watchdog/maps/summary", async (_req, res) => {
  const [telemetry, agg, healthResults, routing, flags] = await Promise.all([
    getMapsSummaryTelemetry(5 * 60_000),
    aggregateMapsTelemetry(5 * 60_000),
    Promise.resolve(getLastHealthCheckResults()),
    Promise.resolve(getRoutingCounters(5 * 60_000)),
    getAllMapsFlags(),
  ]);
  return res.json({
    telemetry,
    aggregate: agg,
    health: healthResults ?? { at: Date.now(), results: [] },
    routing,
    flags,
  });
});

router.post("/watchdog/maps/health/run", async (_req, res) => {
  const results = await runMapsHealthChecks(true);
  return res.json({ results });
});

// === AI Token Audit ===

router.get("/ai/token-audit", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const status = await getAiTokenAuditStatus(date);
  return res.json({
    date: date ?? new Date().toISOString().slice(0, 10),
    audit: status.audit,
    stale: status.stale,
    lastError: status.lastError,
  });
});

router.delete("/ai/token-audit/error", async (_req, res) => {
  await clearAuditError();
  return res.json({ ok: true });
});

// === Groq quota management ===

router.get("/ai/groq-quota", (_req, res) => {
  return res.json(getGroqTpdStatus());
});

router.post("/ai/groq-quota/reset", async (_req, res) => {
  const result = await resetGroqTpd();
  return res.json({ ok: true, ...result });
});

router.post("/ai/groq-quota/soft-cap", async (req, res) => {
  const schema = z.object({ cap: z.number().int().min(1000).max(1_000_000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  await setGroqTpdSoftCap(parsed.data.cap);
  return res.json({ ok: true, cap: parsed.data.cap });
});

// === Proposer settings (modello configurabile) ===

router.get("/watchdog/proposer/settings", async (_req, res) => {
  const settings = await getProposerSettings();
  return res.json(settings);
});

router.post("/watchdog/proposer/settings", async (req, res) => {
  const schema = z.object({ model: z.string().min(3).max(120) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  await setProposerModel(parsed.data.model);
  return res.json({ model: parsed.data.model });
});

// === Signal Thresholds ===

const DEFAULT_SIGNAL_CONFIG_BACKEND = {
  js_thread_freeze:      { warnCount: 10,  warnUsers: 2, highCount: 50,  highUsers: 3, label: "JS thread freeze" },
  gps_flood:             { warnCount: 15,  warnUsers: 2, highCount: 60,  highUsers: 3, label: "GPS flood" },
  memory_pressure:       { warnCount: 5,   warnUsers: 2, highCount: 20,  highUsers: 3, label: "pressione RAM" },
  native_module_missing: { warnCount: 3,   warnUsers: 1, highCount: 999, highUsers: 999, label: "modulo nativo mancante" },
} as const;

router.get("/watchdog/signal-thresholds", async (_req, res) => {
  try {
    const setting = await storage.getAppSetting("watchdog_signal_thresholds");
    const overrides = (setting?.valueJson ?? {}) as Record<string, Partial<{ warnCount: number; warnUsers: number; highCount: number; highUsers: number }>>;
    const effective: Record<string, { warnCount: number; warnUsers: number; highCount: number; highUsers: number; label: string }> = {};
    for (const [key, defaults] of Object.entries(DEFAULT_SIGNAL_CONFIG_BACKEND)) {
      const ov = overrides[key] ?? {};
      effective[key] = {
        label: defaults.label,
        warnCount:  typeof ov.warnCount  === "number" ? Math.max(1, ov.warnCount)  : defaults.warnCount,
        warnUsers:  typeof ov.warnUsers  === "number" ? Math.max(1, ov.warnUsers)  : defaults.warnUsers,
        highCount:  typeof ov.highCount  === "number" ? Math.max(1, ov.highCount)  : defaults.highCount,
        highUsers:  typeof ov.highUsers  === "number" ? Math.max(1, ov.highUsers)  : defaults.highUsers,
      };
    }
    return res.json({
      defaults: DEFAULT_SIGNAL_CONFIG_BACKEND,
      overrides,
      effective,
    });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

const signalThresholdSchema = z.object({
  signal: z.enum(["js_thread_freeze", "gps_flood", "memory_pressure", "native_module_missing"]),
  warnCount:  z.number().int().min(1).max(10_000).optional(),
  warnUsers:  z.number().int().min(1).max(10_000).optional(),
  highCount:  z.number().int().min(1).max(10_000).optional(),
  highUsers:  z.number().int().min(1).max(10_000).optional(),
});

router.put("/watchdog/signal-thresholds", async (req, res) => {
  const parsed = signalThresholdSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const { signal, warnCount, warnUsers, highCount, highUsers } = parsed.data;
  try {
    const setting = await storage.getAppSetting("watchdog_signal_thresholds");
    const current = (setting?.valueJson ?? {}) as Record<string, Partial<{ warnCount: number; warnUsers: number; highCount: number; highUsers: number }>>;
    const prev = current[signal] ?? {};
    const next: Record<string, number> = { ...prev };
    if (typeof warnCount === "number") next.warnCount = warnCount;
    if (typeof warnUsers === "number") next.warnUsers = warnUsers;
    if (typeof highCount === "number") next.highCount = highCount;
    if (typeof highUsers === "number") next.highUsers = highUsers;

    // Cross-field validation: warn thresholds must not exceed high thresholds.
    // Resolve effective values merging the new override with signal defaults.
    const sigDefaults = DEFAULT_SIGNAL_CONFIG_BACKEND[signal];
    const effWarnCount = typeof next.warnCount === "number" ? next.warnCount : sigDefaults.warnCount;
    const effHighCount = typeof next.highCount === "number" ? next.highCount : sigDefaults.highCount;
    const effWarnUsers = typeof next.warnUsers === "number" ? next.warnUsers : sigDefaults.warnUsers;
    const effHighUsers = typeof next.highUsers === "number" ? next.highUsers : sigDefaults.highUsers;
    if (effWarnCount > effHighCount) {
      return sendError(res, 422, `warnCount (${effWarnCount}) deve essere ≤ highCount (${effHighCount})`);
    }
    if (effWarnUsers > effHighUsers) {
      return sendError(res, 422, `warnUsers (${effWarnUsers}) deve essere ≤ highUsers (${effHighUsers})`);
    }

    const updated = { ...current, [signal]: next };
    await storage.upsertAppSetting("watchdog_signal_thresholds", undefined, updated);
    return res.json({ ok: true, signal, thresholds: next });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

router.delete("/watchdog/signal-thresholds/:signal", async (req, res) => {
  const signal = req.params.signal;
  if (!(signal in DEFAULT_SIGNAL_CONFIG_BACKEND)) return sendError(res, 400, "Segnale non valido");
  try {
    const setting = await storage.getAppSetting("watchdog_signal_thresholds");
    const current = (setting?.valueJson ?? {}) as Record<string, unknown>;
    const updated = { ...current };
    delete updated[signal];
    await storage.upsertAppSetting("watchdog_signal_thresholds", undefined, updated);
    return res.json({ ok: true, signal, reset: true });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// === Crash Breakdown ===

// === AI Hub health (Task #162) ===
// Legge le ultime probe ai_hub dalla tabella system_signals + stato in-process.
router.get("/watchdog/ai-hub-health", async (_req, res) => {
  try {
    const configured = isHubConfigured();
    const reachable  = isHubAvailable();
    const probeRan   = hasHubBeenProbed();

    if (!configured) {
      return res.json({
        configured: false,
        reachable: false,
        probeRan: false,
        lastProbeAt: null,
        latencyMs: null,
        consecutiveFailures: 0,
        error: null,
        message: null,
      });
    }

    // Leggi le ultime probe ai_hub dalle ultime 6 ore.
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(systemSignals)
      .where(
        and(
          eq(systemSignals.source, "ai_hub"),
          or(
            eq(systemSignals.metric, "ai_hub.unreachable"),
            eq(systemSignals.metric, "ai_hub.ping_ms"),
          ),
          gte(systemSignals.createdAt, since),
        ),
      )
      .orderBy(desc(systemSignals.createdAt))
      .limit(20);

    const latest = rows[0] ?? null;
    const lastProbeAt = latest?.createdAt instanceof Date
      ? latest.createdAt.toISOString()
      : (latest?.createdAt ? String(latest.createdAt) : null);

    // Ultima ping latency (se OK)
    const latencyRow = rows.find((r) => r.metric === "ai_hub.ping_ms");
    const latencyMs = latencyRow?.value != null ? Math.round(latencyRow.value) : null;

    // Fallimenti consecutivi dall'ultimo segnale di unreachable
    const unreachableRow = rows.find((r) => r.metric === "ai_hub.unreachable");
    const consecutiveFailures =
      (unreachableRow?.details as { consecutiveFailures?: number } | null)
        ?.consecutiveFailures ?? 0;
    const error =
      (unreachableRow?.details as { error?: string } | null)?.error ?? null;

    // Se nessuna probe è mai girata (es. TC spento dal boot), segnala
    // esplicitamente "nessuna probe eseguita" così il tile non mostra un
    // flag reachable ottimistico fuorviante.
    const message = !probeRan ? "Nessuna probe ancora eseguita" : null;

    return res.json({
      configured,
      reachable,
      probeRan,
      lastProbeAt,
      latencyMs: reachable ? latencyMs : null,
      consecutiveFailures,
      error: reachable ? null : error,
      message,
    });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

router.get("/watchdog/crash-breakdown", async (req, res) => {
  const days = Math.min(30, Math.max(1, Number(req.query.days ?? 7)));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 15)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const result = await db.execute(sql`
      SELECT
        crash_type,
        app_version,
        LEFT(error_message, 200) AS error_summary,
        COUNT(*)::int                AS total,
        MAX(reported_at)             AS last_seen
      FROM app_crash_logs
      WHERE reported_at >= ${since}
        AND crash_type IN ('crash_system', 'crash_js')
      GROUP BY crash_type, app_version, LEFT(error_message, 200)
      ORDER BY total DESC
      LIMIT ${limit}
    `);
    return res.json({
      days,
      groups: (result.rows as Record<string, unknown>[]).map((r) => ({
        crashType: r.crash_type,
        appVersion: r.app_version ?? null,
        errorSummary: r.error_summary ?? null,
        total: Number(r.total),
        lastSeen: r.last_seen instanceof Date ? r.last_seen.toISOString() : String(r.last_seen ?? ""),
      })),
    });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

router.get("/watchdog/crash-breakdown/samples", async (req, res) => {
  const crashType = typeof req.query.crashType === "string" ? req.query.crashType : null;
  const appVersion = typeof req.query.appVersion === "string" ? req.query.appVersion : null;
  const errorSummary = typeof req.query.errorSummary === "string" ? req.query.errorSummary : null;
  const limit = Math.min(20, Math.max(1, Number(req.query.limit ?? 5)));
  const days = Math.min(30, Math.max(1, Number(req.query.days ?? 7)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const result = await db.execute(sql`
      SELECT
        id, crash_type, app_version, platform, os_version, device_model, device_brand,
        error_message, stack_trace, reported_at, user_id
      FROM app_crash_logs
      WHERE reported_at >= ${since}
        AND crash_type = ${crashType ?? "crash_js"}
        AND (${appVersion ?? null} IS NULL OR app_version = ${appVersion ?? null})
        AND (${errorSummary ?? null} IS NULL OR LEFT(error_message, 200) = ${errorSummary ?? null})
      ORDER BY reported_at DESC
      LIMIT ${limit}
    `);
    return res.json({
      samples: (result.rows as Record<string, unknown>[]).map((r) => ({
        id: r.id,
        crashType: r.crash_type,
        appVersion: r.app_version ?? null,
        platform: r.platform ?? null,
        osVersion: r.os_version ?? null,
        deviceModel: r.device_model ?? null,
        deviceBrand: r.device_brand ?? null,
        errorMessage: r.error_message ?? null,
        stackTrace: r.stack_trace ?? null,
        reportedAt: r.reported_at instanceof Date ? r.reported_at.toISOString() : String(r.reported_at ?? ""),
        userId: r.user_id ?? null,
      })),
    });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

export default router;
