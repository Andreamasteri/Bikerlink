// Task #2603 — estratto da server/routes/admin/ota-assistant.ts (mechanical split)
// Helpers READ-ONLY e MUTANTI per l'assistente OTA. Caratteri identici al file
// originale; solo `export` aggiunto a function/const per renderli importabili.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "../../../db";
import { otaReleases, otaBootEvents, otaAssistantRuns, otaWatchdogReports, users } from "@shared/db";
import { eq, desc, and, inArray, or, like } from "drizzle-orm";
import { syncProductionUpdates } from "../ota";
import { shouldDelayForCoordinator, recordOtaDecision } from "../../../ai/coordinator/integrations/ota";

const execFileAsync = promisify(execFile);

// Soglie AI per proposta di rollback (distinte dal deterministico ota-auto-rollback.ts).
export const AI_ROLLBACK_PROPOSAL_THRESHOLD = Number(process.env.OTA_ASSISTANT_ROLLBACK_THRESHOLD ?? "85");
export const AI_ROLLBACK_PROPOSAL_MIN_DOWNLOADS = Number(process.env.OTA_ASSISTANT_ROLLBACK_MIN_DOWNLOADS ?? "5");

export const LOG_DIR = path.resolve(process.cwd(), "logs", "ota-assistant");
export function ensureLogDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }
}

// ── Tools READ-ONLY ──────────────────────────────────────────────────────────

export async function toolQueryReleases(args: { status?: string; limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const rows = await db.select().from(otaReleases).orderBy(desc(otaReleases.publishedAt)).limit(limit);
  const filtered = args.status ? rows.filter((r) => r.status === args.status) : rows;
  return filtered.map((r) => ({
    id: r.id,
    otaVersion: r.otaVersion,
    easUpdateId: r.easUpdateId,
    status: r.status,
    channel: r.channel,
    runtimeVersion: r.runtimeVersion,
    message: r.message,
    publishedAt: r.publishedAt,
    downloads: r.downloadCount,
    bootSuccess: r.bootSuccessCount,
    bootFailure: r.bootFailureCount,
    successRate: r.downloadCount > 0 ? Math.round((r.bootSuccessCount / r.downloadCount) * 100) : null,
    autoRolledBackAt: r.autoRolledBackAt,
  }));
}

export async function toolQueryBootEvents(args: { releaseId?: string; eventType?: string; limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 50);
  const conds = [] as ReturnType<typeof eq>[];
  if (args.releaseId) conds.push(eq(otaBootEvents.releaseId, args.releaseId));
  if (args.eventType) conds.push(eq(otaBootEvents.eventType, args.eventType));
  const rows = await db
    .select()
    .from(otaBootEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(otaBootEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    releaseId: r.releaseId,
    userId: r.userId,
    deviceId: r.deviceId,
    eventType: r.eventType,
    platform: r.platform,
    appVersion: r.appVersion,
    createdAt: r.createdAt,
  }));
}

export async function toolQueryDeviceVersion(args: { userId: string }) {
  const events = await db
    .select()
    .from(otaBootEvents)
    .where(eq(otaBootEvents.userId, args.userId))
    .orderBy(desc(otaBootEvents.createdAt))
    .limit(10);
  return events.map((e) => ({
    releaseId: e.releaseId,
    eventType: e.eventType,
    appVersion: e.appVersion,
    platform: e.platform,
    createdAt: e.createdAt,
  }));
}

export async function toolDiagnoseDeliveryFailure(args: { userId: string; otaVersion?: string }) {
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, args.userId)).limit(1);
  if (!user) return { ok: false, reason: "Utente non trovato" };

  // Release attiva (la più recente approved, o pending+approved se admin)
  const statuses = user.role === "admin" ? ["pending", "approved"] : ["approved"];
  const [activeRelease] = await db
    .select()
    .from(otaReleases)
    .where(inArray(otaReleases.status, statuses))
    .orderBy(desc(otaReleases.publishedAt))
    .limit(1);

  // Target release richiesta (se otaVersion specificato)
  let targetRelease: typeof activeRelease | undefined;
  if (args.otaVersion) {
    [targetRelease] = await db
      .select()
      .from(otaReleases)
      .where(eq(otaReleases.otaVersion, args.otaVersion))
      .limit(1);
  }

  // Ultimo evento boot dell'utente
  const [lastEvent] = await db
    .select()
    .from(otaBootEvents)
    .where(eq(otaBootEvents.userId, args.userId))
    .orderBy(desc(otaBootEvents.createdAt))
    .limit(1);

  const findings: string[] = [];
  if (!activeRelease) findings.push("Nessuna release attiva sul canale dell'utente.");
  if (args.otaVersion && !targetRelease) findings.push(`Release ${args.otaVersion} non esiste nel DB.`);
  if (targetRelease && targetRelease.status === "rejected") findings.push(`Release ${args.otaVersion} è rejected (non distribuita).`);
  if (targetRelease && targetRelease.status === "pending" && user.role !== "admin") findings.push(`Release ${args.otaVersion} è in pending: solo admin la riceve.`);
  if (activeRelease && targetRelease && activeRelease.runtimeVersion !== targetRelease.runtimeVersion) {
    findings.push(`Runtime mismatch: release runtime=${targetRelease.runtimeVersion} vs attiva=${activeRelease.runtimeVersion}.`);
  }
  if (!lastEvent) findings.push("Nessun evento OTA registrato per questo utente: l'app non ha mai chiamato /api/ota/event (sessione mai attiva al boot?).");

  return {
    ok: true,
    user: { id: user.id, role: user.role },
    activeRelease: activeRelease ? {
      id: activeRelease.id,
      otaVersion: activeRelease.otaVersion,
      status: activeRelease.status,
      runtimeVersion: activeRelease.runtimeVersion,
    } : null,
    targetRelease: targetRelease ? {
      id: targetRelease.id,
      otaVersion: targetRelease.otaVersion,
      status: targetRelease.status,
      runtimeVersion: targetRelease.runtimeVersion,
    } : null,
    lastBootEvent: lastEvent ? {
      releaseId: lastEvent.releaseId,
      eventType: lastEvent.eventType,
      appVersion: lastEvent.appVersion,
      createdAt: lastEvent.createdAt,
    } : null,
    findings,
  };
}

export async function toolProposeRollback(triggeredBy: string | null) {
  // Cerca release approved recenti con success rate basso ma NON ancora sotto soglia deterministica.
  const candidates = await db
    .select()
    .from(otaReleases)
    .where(and(eq(otaReleases.status, "approved")))
    .orderBy(desc(otaReleases.publishedAt))
    .limit(10);

  const proposals = [] as Array<{
    releaseId: string;
    otaVersion: string | null;
    downloads: number;
    successRate: number;
    reason: string;
  }>;

  for (const r of candidates) {
    if (r.autoRolledBackAt) continue;
    const downloads = r.downloadCount ?? 0;
    if (downloads < AI_ROLLBACK_PROPOSAL_MIN_DOWNLOADS) continue;
    const successes = r.bootSuccessCount ?? 0;
    const rate = downloads > 0 ? Math.round((successes / downloads) * 100) : 100;
    if (rate >= AI_ROLLBACK_PROPOSAL_THRESHOLD) continue;
    if (rate < (r.autoRollbackThreshold ?? 70)) continue;
    proposals.push({
      releaseId: r.id,
      otaVersion: r.otaVersion,
      downloads,
      successRate: rate,
      reason: `Boot success rate ${rate}% sotto soglia AI ${AI_ROLLBACK_PROPOSAL_THRESHOLD}% (deterministica: ${r.autoRollbackThreshold ?? 70}%).`,
    });
  }

  const generatedAt = new Date().toISOString();
  // Persisti uno snapshot per audit/storico interrogabile indipendente dalla chat.
  try {
    await db.insert(otaWatchdogReports).values({
      triggeredBy: triggeredBy ?? null,
      candidateCount: proposals.length,
      payload: JSON.stringify(proposals),
      threshold: AI_ROLLBACK_PROPOSAL_THRESHOLD,
      minDownloads: AI_ROLLBACK_PROPOSAL_MIN_DOWNLOADS,
    });
  } catch (err) {
    console.error("[ota-assistant] watchdog report persist failed:", err);
  }

  return { proposals, generatedAt };
}

export async function toolQueryWatchdogReports(args: { limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
  const rows = await db
    .select()
    .from(otaWatchdogReports)
    .orderBy(desc(otaWatchdogReports.generatedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    generatedAt: r.generatedAt,
    candidateCount: r.candidateCount,
    threshold: r.threshold,
    minDownloads: r.minDownloads,
    candidates: (() => { try { return JSON.parse(r.payload); } catch { return []; } })(),
  }));
}

export async function toolQueryAssistantHistory(args: {
  adminId?: string;
  status?: "completed" | "error";
  search?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const conds = [] as ReturnType<typeof eq>[];
  if (args.adminId) conds.push(eq(otaAssistantRuns.adminId, args.adminId));
  if (args.status) conds.push(eq(otaAssistantRuns.status, args.status));
  if (args.search) {
    const pat = `%${args.search}%`;
    conds.push(or(like(otaAssistantRuns.prompt, pat), like(otaAssistantRuns.response, pat))!);
  }
  const rows = await db
    .select({
      id: otaAssistantRuns.id,
      adminId: otaAssistantRuns.adminId,
      prompt: otaAssistantRuns.prompt,
      response: otaAssistantRuns.response,
      status: otaAssistantRuns.status,
      error: otaAssistantRuns.error,
      startedAt: otaAssistantRuns.startedAt,
      finishedAt: otaAssistantRuns.finishedAt,
    })
    .from(otaAssistantRuns)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(otaAssistantRuns.startedAt))
    .limit(limit);
  return rows;
}

export async function toolProposeNextPublish() {
  // Strategia semplice: leggi ultima release approved + telemetria.
  const [last] = await db
    .select()
    .from(otaReleases)
    .where(eq(otaReleases.status, "approved"))
    .orderBy(desc(otaReleases.publishedAt))
    .limit(1);

  const now = new Date();
  const hour = now.getHours();

  if (!last) {
    return { recommendation: "publish", reason: "Nessuna release approved presente: pubblica appena pronto." };
  }

  const ageHours = (now.getTime() - new Date(last.publishedAt).getTime()) / 3_600_000;
  const downloads = last.downloadCount ?? 0;
  const rate = downloads > 0 ? Math.round(((last.bootSuccessCount ?? 0) / downloads) * 100) : null;

  if (last.autoRolledBackAt) {
    return { recommendation: "wait", reason: `Ultima release ${last.otaVersion} è stata auto-rollbackata. Attendi diagnosi prima del prossimo publish.` };
  }
  if (ageHours < 2) {
    return { recommendation: "wait", reason: `Ultima release ${last.otaVersion} pubblicata da ${ageHours.toFixed(1)}h. Attendi almeno 2h per raccogliere telemetria.` };
  }
  if (rate !== null && rate < 80) {
    return { recommendation: "block", reason: `Ultima release ${last.otaVersion} ha success rate ${rate}% (<80%). Risolvi prima di pubblicare la prossima.` };
  }
  if (hour < 8 || hour >= 22) {
    return { recommendation: "wait", reason: `Ora corrente ${hour}: fuori finestra consigliata (08–22). Attendi.` };
  }
  return {
    recommendation: "publish",
    reason: `Ultima release ${last.otaVersion} è stabile (rate ${rate ?? "n/a"}%, età ${ageHours.toFixed(1)}h). Finestra oraria OK.`,
    lastRelease: { id: last.id, otaVersion: last.otaVersion, downloads, successRate: rate },
  };
}

export async function finalizePublishRun(runId: string, status: "completed" | "error", error?: string | null): Promise<void> {
  try {
    await db.update(otaAssistantRuns)
      .set({ status, error: error ?? null, finishedAt: new Date() })
      .where(eq(otaAssistantRuns.id, runId));
  } catch (e) {
    console.error("[OTA-ASSIST] finalizePublishRun error:", e);
  }
}

import {
  spawnPublishJob,
  execRollbackToGroup,
  execForceUpdateDevice,
  execMutatingTool as execMutatingToolPart2,
} from "./helpers.part2";

export async function execMutatingTool(
  toolName: string,
  args: Record<string, unknown>,
  adminId: string,
  runId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string; logPath?: string; async?: boolean }> {
  const correlationId = `ota-${runId.slice(0, 12)}`;
  const startedAt = Date.now();
  try {
    if (toolName === "publishOta") {
      const message = String(args.message ?? "").trim();
      if (!message) return { ok: false, error: "message obbligatorio" };
      // Task #2654 — Coordinator pre-check (graceful: errori NON bloccano)
      const delay = await shouldDelayForCoordinator({ action: "publish", correlationId, payload: { adminId, message } });
      if (delay.delay) {
        await recordOtaDecision({
          decisionType: "DELAY",
          input: { adminId, message },
          output: { reason: delay.reason, conflictId: delay.conflictId ?? null, policyRuleId: delay.policyRuleId ?? null },
          rationale: delay.reason,
          tookMs: Date.now() - startedAt,
          correlationId,
          severity: "warn",
        });
        return { ok: false, error: `Publish OTA bloccato dal Coordinator: ${delay.reason}` };
      }
      const job = spawnPublishJob(runId, message);
      await recordOtaDecision({
        decisionType: "PUBLISH_OTA",
        input: { adminId, message },
        output: { jobRunId: job.runId, logPath: job.logPath },
        tookMs: Date.now() - startedAt,
        correlationId,
      });
      // Async: lo status del run resterà 'running' fino al completamento del job.
      return { ok: true, result: { runId: job.runId, status: "running" }, logPath: job.logPath, async: true };
    }
    if (toolName === "syncEas") {
      await syncProductionUpdates();
      await recordOtaDecision({
        decisionType: "SYNC_EAS", input: { adminId }, output: { synced: true },
        tookMs: Date.now() - startedAt, correlationId,
      });
      return { ok: true, result: { synced: true } };
    }
    if (toolName === "approveRelease") {
      const id = String(args.releaseId ?? "");
      if (!id) return { ok: false, error: "releaseId obbligatorio" };
      const [updated] = await db
        .update(otaReleases)
        .set({ status: "approved", approvedAt: new Date(), approvedBy: adminId, channel: "production" })
        .where(and(eq(otaReleases.id, id), eq(otaReleases.status, "pending")))
        .returning();
      if (!updated) return { ok: false, error: "Release non trovata o non in stato pending" };
      console.log(`[ota-assistant][AUDIT] APPROVE ${id} by ${adminId}`);
      await recordOtaDecision({
        decisionType: "APPROVE_RELEASE", input: { adminId, releaseId: id }, output: { status: "approved" },
        tookMs: Date.now() - startedAt, correlationId,
      });
      return { ok: true, result: updated };
    }
    if (toolName === "rejectRelease") {
      const id = String(args.releaseId ?? "");
      if (!id) return { ok: false, error: "releaseId obbligatorio" };
      const [updated] = await db
        .update(otaReleases)
        .set({ status: "rejected", rejectedAt: new Date(), rejectedBy: adminId })
        .where(and(eq(otaReleases.id, id), eq(otaReleases.status, "pending")))
        .returning();
      if (!updated) return { ok: false, error: "Release non trovata o non in stato pending" };
      console.log(`[ota-assistant][AUDIT] REJECT ${id} by ${adminId}`);
      await recordOtaDecision({
        decisionType: "REJECT_RELEASE", input: { adminId, releaseId: id }, output: { status: "rejected" },
        tookMs: Date.now() - startedAt, correlationId, severity: "warn",
      });
      return { ok: true, result: updated };
    }
    return execMutatingToolPart2(toolName, args, adminId, runId, correlationId, startedAt);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "errore esecuzione tool" };
  }
}
