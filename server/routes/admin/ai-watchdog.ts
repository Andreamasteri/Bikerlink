// Task #2533 — Endpoint admin AI System Watchdog.
import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { db } from "../../db";
import { aiWatchdogLog, weeklySystemReports } from "@shared/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getLatestSnapshot, runAggregatorCycle, getRecentSnapshots } from "../../ai/watchdog/aggregator";
import { streamWatchdogChat } from "../../ai/watchdog/chat";
import { isWatchdogEnabled, setWatchdogEnabled } from "../../ai/watchdog/kill-switch";
import { getWatchdogStats } from "../../ai/watchdog/scheduler";
import { runAutoFix } from "../../ai/watchdog/auto-fix";
import { runProposer } from "../../ai/watchdog/proposer";
import { markProposalAccepted, markProposalRejected } from "../../ai/watchdog/log";
import { runWeeklyReport } from "../../ai/watchdog/weekly-report";
import {
  type MapsKillSwitchKey,
  getAllMapsFlags, setMapsFlag,
} from "../../ai/watchdog/maps-kill-switch";

const MAPS_FLAGS: readonly MapsKillSwitchKey[] = ["telemetry", "collector", "llm", "alerts"] as const;
import { getMapsTelemetryBuckets, aggregateMapsTelemetry, getMapsSummaryTelemetry } from "../../ai/watchdog/maps-telemetry-store";
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
  return res.json({ enabled, snapshot: snap, stats });
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
  const out = await runProposer(snap);
  return res.json({ proposals: out?.proposals ?? [], meta: out?.meta ?? null });
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
  let dispatch: { action: string; applied: boolean; summary: string } | null = null;
  try {
    const [row] = await db.select().from(aiWatchdogLog).where(eq(aiWatchdogLog.id, id)).limit(1);
    const details = (row?.details ?? {}) as Record<string, unknown>;
    const action = typeof details.action === "string" ? details.action : null;
    const riskLevel = typeof details.riskLevel === "string" ? details.riskLevel : null;
    if (action && riskLevel !== "high") {
      const snap = getLatestSnapshot();
      if (snap) {
        const { AUTO_FIX_RULES } = await import("../../ai/watchdog/auto-fix");
        const rule = AUTO_FIX_RULES.find((r) => r.id === action);
        if (rule) {
          const out = await rule.run(snap);
          dispatch = {
            action,
            applied: out.applied,
            summary: out.applied ? out.summary : out.reason,
          };
        }
      }
    }
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
  const buckets = await getMapsTelemetryBuckets(hours);
  return res.json({ minutes, buckets });
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

export default router;
