// Task #2535 — AI Orchestrator OTA
// Endpoint chat assistente OTA:
//   POST /api/admin/ota/assistant           → invia un prompt, riceve risposta + tool calls
//   POST /api/admin/ota/assistant/confirm   → conferma esecuzione di un tool mutante
//   GET  /api/admin/ota/assistant/history   → storico paginato delle interazioni
//   GET  /api/admin/ota/assistant/run/:id/log → log di una run di publish
//
// Design:
//   - I tool READ-ONLY (query DB, diagnose) sono eseguiti direttamente dal modello.
//   - I tool MUTANTI (publish, approve, reject, rollback, forceUpdate) NON sono dati
//     al modello: il modello dispone solo del tool `proposeMutation` che produce
//     un payload strutturato di conferma. L'admin clicca "Conferma" sul frontend
//     che chiama POST /confirm con { tool, args } — il server esegue allora il
//     tool deterministicamente. Questo garantisce che il modello non possa MAI
//     eseguire un'azione distruttiva senza un round-trip esplicito dall'admin.
//
//   - publishOta è asincrono: ritorna un runId immediatamente, l'admin segue
//     i log via GET /run/:id/log (polling). Retry singolo automatico su
//     errori EAS transitori noti.

import { Router, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "../../db";
import { otaReleases, otaBootEvents, otaAssistantRuns, otaWatchdogReports, users } from "@shared/db";
import { eq, desc, and, gte, sql, inArray, or, like } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { syncProductionUpdates } from "./ota";

const execFileAsync = promisify(execFile);

const router = Router();

const MODEL_NAME = process.env.OTA_ASSISTANT_MODEL ?? "gpt-4o-mini";
const TEMPERATURE = Number(process.env.OTA_ASSISTANT_TEMPERATURE ?? "0.2");
// Soglie AI per proposta di rollback (distinte dal deterministico ota-auto-rollback.ts).
const AI_ROLLBACK_PROPOSAL_THRESHOLD = Number(process.env.OTA_ASSISTANT_ROLLBACK_THRESHOLD ?? "85");
const AI_ROLLBACK_PROPOSAL_MIN_DOWNLOADS = Number(process.env.OTA_ASSISTANT_ROLLBACK_MIN_DOWNLOADS ?? "5");

const LOG_DIR = path.resolve(process.cwd(), "logs", "ota-assistant");
function ensureLogDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }
}

// ── Tools READ-ONLY ──────────────────────────────────────────────────────────

async function toolQueryReleases(args: { status?: string; limit?: number }) {
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

async function toolQueryBootEvents(args: { releaseId?: string; eventType?: string; limit?: number }) {
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

async function toolQueryDeviceVersion(args: { userId: string }) {
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

async function toolDiagnoseDeliveryFailure(args: { userId: string; otaVersion?: string }) {
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

async function toolProposeRollback(triggeredBy: string | null) {
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

async function toolQueryWatchdogReports(args: { limit?: number }) {
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

async function toolQueryAssistantHistory(args: {
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

async function toolProposeNextPublish() {
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

// ── Tools MUTANTI (eseguiti solo da /confirm) ─────────────────────────────────

interface PublishResult { runId: string; logPath: string }

// Aggiorna lo stato del run nel DB al termine del job publish (con eventuale retry).
async function finalizePublishRun(runId: string, status: "completed" | "error", error: string | null) {
  try {
    await db.update(otaAssistantRuns)
      .set({ status, error, finishedAt: new Date() })
      .where(eq(otaAssistantRuns.id, runId));
  } catch (err) {
    console.error("[ota-assistant] finalize publish run failed:", err);
  }
}

function spawnPublishJob(runId: string, message: string): PublishResult {
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `publish-${runId}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  try {
    fs.writeFileSync(path.resolve(process.cwd(), ".ota-message"), `${message}\n`);
  } catch (err) {
    logStream.write(`[orchestrator] errore scrittura .ota-message: ${(err as Error).message}\n`);
  }

  const launch = () => spawn("bash", [path.resolve(process.cwd(), "scripts/publish-ota-full.sh")], {
    env: process.env,
    cwd: process.cwd(),
  });

  logStream.write(`[orchestrator] runId=${runId} message="${message}"\n`);
  const child = launch();
  child.stdout.on("data", (chunk) => logStream.write(chunk));
  child.stderr.on("data", (chunk) => logStream.write(chunk));

  let retried = false;
  child.on("exit", (code) => {
    logStream.write(`\n[orchestrator] exit code: ${code}\n`);
    if (code !== 0 && !retried) {
      try {
        const tail = fs.readFileSync(logPath, "utf-8").slice(-4000).toLowerCase();
        const transient = /timeout|rate.limit|econn|etimedout|graphql.*5\d\d|fetch failed/i.test(tail);
        if (transient) {
          retried = true;
          logStream.write("\n[orchestrator] errore transitorio rilevato → retry singolo tra 10s...\n");
          setTimeout(() => {
            const retry = launch();
            retry.stdout.on("data", (chunk) => logStream.write(chunk));
            retry.stderr.on("data", (chunk) => logStream.write(chunk));
            retry.on("exit", (c2) => {
              logStream.write(`\n[orchestrator] retry exit code: ${c2}\n`);
              logStream.end();
              void finalizePublishRun(runId, c2 === 0 ? "completed" : "error", c2 === 0 ? null : `publish-ota-full.sh exit ${c2} (dopo retry)`);
            });
          }, 10_000);
          return;
        }
      } catch { /* ignore */ }
    }
    logStream.end();
    void finalizePublishRun(runId, code === 0 ? "completed" : "error", code === 0 ? null : `publish-ota-full.sh exit ${code}`);
  });
  child.on("error", (err) => {
    logStream.write(`\n[orchestrator] spawn error: ${err.message}\n`);
    logStream.end();
    void finalizePublishRun(runId, "error", `spawn error: ${err.message}`);
  });

  return { runId, logPath };
}

// Rollback via republish EAS (stessa logica di POST /api/admin/ota/:id/rollback).
async function execRollbackToGroup(releaseId: string, adminId: string) {
  const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, releaseId)).limit(1);
  if (!release) return { ok: false, error: "Release non trovata" };
  if (release.status !== "approved") return { ok: false, error: `Rollback solo su release approved (stato: ${release.status})` };
  if (!release.easGroupId) return { ok: false, error: "Manca easGroupId — esegui sync prima" };
  if (!process.env.EAS_TOKEN) return { ok: false, error: "EAS_TOKEN non configurato" };

  const rollbackMessage = `Rollback to ${release.otaVersion ?? release.easUpdateId.slice(0, 8)} (by AI orchestrator)`;
  try {
    const { stdout, stderr } = await execFileAsync("npx", [
      "eas", "update", "--republish",
      "--group", release.easGroupId,
      "--message", rollbackMessage,
      "--non-interactive",
    ], {
      env: { ...process.env, EXPO_TOKEN: process.env.EAS_TOKEN, EAS_NO_VCS: "1", EAS_SKIP_AUTO_FINGERPRINT: "1" },
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = `${stdout}\n${stderr}`;
    const updateIdMatch = output.match(/(?:Android|iOS|)\s*[Uu]pdate ID\s+([a-f0-9-]{36})/);
    const groupIdMatch = output.match(/Update group ID\s+([a-f0-9-]{36})/i);
    if (!updateIdMatch || !groupIdMatch) {
      return { ok: false, error: "EAS republish ok ma parsing updateId/groupId fallito — verifica su EAS e ri-esegui sync" };
    }
    const [inserted] = await db.insert(otaReleases).values({
      easUpdateId: updateIdMatch[1],
      easGroupId: groupIdMatch[1],
      channel: "production",
      runtimeVersion: release.runtimeVersion,
      message: rollbackMessage,
      otaVersion: release.otaVersion ? `${release.otaVersion}-rb` : null,
      status: "approved",
      publishedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: adminId,
    }).onConflictDoUpdate({
      target: otaReleases.easUpdateId,
      set: { status: "approved", approvedAt: new Date(), approvedBy: adminId, channel: "production", easGroupId: groupIdMatch[1] },
    }).returning();
    console.log(`[ota-assistant][AUDIT] rollback ${releaseId} → ${updateIdMatch[1]} by ${adminId}`);
    return { ok: true, result: { rolledBackFrom: releaseId, newRelease: inserted } };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, error: `EAS republish fallito: ${(e.stderr || e.message || "errore").slice(0, 400)}` };
  }
}

// forceUpdateDevice — registra un evento OTA "forced" che, al prossimo boot,
// il client interpreterà come obbligo di scaricare la release attiva.
// Implementazione minimale: scriviamo un evento `forced` legato alla release richiesta.
async function execForceUpdateDevice(args: { userId: string; releaseId: string }) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, args.userId)).limit(1);
  if (!user) return { ok: false, error: "Utente non trovato" };
  const [release] = await db.select({ id: otaReleases.id, status: otaReleases.status }).from(otaReleases).where(eq(otaReleases.id, args.releaseId)).limit(1);
  if (!release) return { ok: false, error: "Release non trovata" };
  if (release.status !== "approved") return { ok: false, error: `Force update solo su release approved (stato: ${release.status})` };
  try {
    await db.insert(otaBootEvents).values({
      releaseId: release.id,
      userId: user.id,
      deviceId: `forced-${Date.now()}`,
      eventType: "forced",
      platform: null,
      appVersion: null,
    });
    console.log(`[ota-assistant][AUDIT] force update user=${user.id} release=${release.id}`);
    return { ok: true, result: { userId: user.id, releaseId: release.id, signaled: true } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "errore force update" };
  }
}

async function execMutatingTool(
  toolName: string,
  args: Record<string, unknown>,
  adminId: string,
  runId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string; logPath?: string; async?: boolean }> {
  try {
    if (toolName === "publishOta") {
      const message = String(args.message ?? "").trim();
      if (!message) return { ok: false, error: "message obbligatorio" };
      const job = spawnPublishJob(runId, message);
      // Async: lo status del run resterà 'running' fino al completamento del job.
      return { ok: true, result: { runId: job.runId, status: "running" }, logPath: job.logPath, async: true };
    }
    if (toolName === "syncEas") {
      await syncProductionUpdates();
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
      return { ok: true, result: updated };
    }
    if (toolName === "rollbackToGroup") {
      const id = String(args.releaseId ?? "");
      if (!id) return { ok: false, error: "releaseId obbligatorio" };
      const out = await execRollbackToGroup(id, adminId);
      return out;
    }
    if (toolName === "forceUpdateDevice") {
      const userId = String(args.userId ?? "");
      const releaseId = String(args.releaseId ?? "");
      if (!userId || !releaseId) return { ok: false, error: "userId e releaseId obbligatori" };
      return await execForceUpdateDevice({ userId, releaseId });
    }
    return { ok: false, error: `Tool sconosciuto: ${toolName}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "errore esecuzione tool" };
  }
}

// ── Endpoint ──────────────────────────────────────────────────────────────────

const promptSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

router.post("/", async (req: Request, res: Response) => {
  const adminId = req.session.userId!;
  const parsed = promptSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "prompt obbligatorio");

  if (!process.env.OPENAI_API_KEY) {
    return sendError(res, 500, "OPENAI_API_KEY non configurata sul server");
  }

  const startedAt = new Date();
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const tools = {
    queryReleases: tool({
      description: "Elenca le release OTA dal DB. Filtri opzionali per status (pending/approved/rejected). Max 50 righe.",
      inputSchema: z.object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (a) => toolQueryReleases(a),
    }),
    queryBootEvents: tool({
      description: "Elenca eventi boot OTA (downloaded/boot_success/boot_failure). Filtri opzionali per releaseId/eventType.",
      inputSchema: z.object({
        releaseId: z.string().optional(),
        eventType: z.enum(["downloaded", "boot_success", "boot_failure"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (a) => toolQueryBootEvents(a),
    }),
    queryDeviceVersion: tool({
      description: "Mostra gli ultimi 10 eventi OTA di un utente per capire su quale bundle si trova.",
      inputSchema: z.object({ userId: z.string() }),
      execute: async (a) => toolQueryDeviceVersion(a),
    }),
    diagnoseDeliveryFailure: tool({
      description: "Diagnostica perché un utente non ha ricevuto una release OTA specifica (otaVersion opzionale).",
      inputSchema: z.object({ userId: z.string(), otaVersion: z.string().optional() }),
      execute: async (a) => toolDiagnoseDeliveryFailure(a),
    }),
    proposeRollback: tool({
      description: "Cerca release approved con success rate basso (sopra la soglia deterministica ma sotto quella AI) e propone rollback all'admin. NON esegue alcun rollback. Persiste uno snapshot in ota_watchdog_reports.",
      inputSchema: z.object({}),
      execute: async () => toolProposeRollback(adminId),
    }),
    proposeNextPublish: tool({
      description: "Raccomanda se pubblicare ora un nuovo OTA (publish/wait/block) basandosi su età ultima release, success rate, finestra oraria.",
      inputSchema: z.object({}),
      execute: async () => toolProposeNextPublish(),
    }),
    queryWatchdogReports: tool({
      description: "Elenca gli snapshot persistenti del watchdog post-publish generati dalle proposte di rollback (ultimi N report).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      execute: async (a) => toolQueryWatchdogReports(a),
    }),
    queryAssistantHistory: tool({
      description: "Interroga lo storico delle interazioni con questo assistente (filtri: adminId, status completed/error, ricerca testuale in prompt/response).",
      inputSchema: z.object({
        adminId: z.string().optional(),
        status: z.enum(["completed", "error"]).optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (a) => toolQueryAssistantHistory(a),
    }),
    proposeMutation: tool({
      description: "Propone all'admin un'azione mutante (publishOta, syncEas, approveRelease, rejectRelease, rollbackToGroup, forceUpdateDevice). NON esegue l'azione: il server la mostra come scheda di conferma. L'admin clicca 'Conferma' per eseguirla. Usa SEMPRE questo tool — mai eseguire azioni mutanti direttamente.",
      inputSchema: z.object({
        tool: z.enum(["publishOta", "syncEas", "approveRelease", "rejectRelease", "rollbackToGroup", "forceUpdateDevice"]),
        args: z.record(z.string(), z.unknown()).optional(),
        summary: z.string().describe("Frase chiara in italiano che descrive cosa farà l'azione, per la conferma dell'admin."),
      }),
      execute: async (a) => ({ requiresConfirmation: true, tool: a.tool, args: a.args ?? {}, summary: a.summary }),
    }),
  } as const;

  const systemPrompt = `Sei l'assistente operativo del sistema OTA di BikerLink. Aiuti l'admin a pubblicare, diagnosticare e monitorare gli aggiornamenti OTA.

REGOLE FERREE:
1. Per ogni azione che modifica stato (publish, approve, reject, sync) DEVI usare il tool \`proposeMutation\`. NON chiamare tool mutanti direttamente — non ne hai.
2. Per query, diagnosi e proposte usa i tool dedicati. Non inventare dati: se non li hai, dillo.
3. Rispondi sempre in italiano, conciso, tecnico ma chiaro. Quando proponi un'azione, una sola proposta per messaggio.
4. Quando l'admin chiede "pubblica con messaggio X", usa proposeMutation con tool="publishOta" e args={message:"X"}.
5. Quando l'admin chiede "approva release Y", recupera prima la lista con queryReleases per trovare l'id giusto, poi usa proposeMutation con tool="approveRelease" args={releaseId:"<id>"}.
6. Non fornire spiegazioni teoriche se non richieste: vai dritto al punto operativo.`;

  try {
    const result = await generateText({
      model: openai(MODEL_NAME),
      temperature: TEMPERATURE,
      system: systemPrompt,
      prompt: parsed.data.prompt,
      tools,
      stopWhen: ({ steps }) => steps.length >= 5,
    });

    // Estrai eventuali proposte di mutazione dai tool results
    const pendingMutations: Array<{ tool: string; args: Record<string, unknown>; summary: string }> = [];
    const toolCallsLog: Array<{ tool: string; args: unknown; result?: unknown }> = [];
    for (const step of result.steps) {
      for (let i = 0; i < step.toolCalls.length; i++) {
        const call = step.toolCalls[i];
        const tr = step.toolResults?.[i];
        toolCallsLog.push({ tool: call.toolName, args: call.input, result: tr?.output });
        if (call.toolName === "proposeMutation") {
          const out = tr?.output as { requiresConfirmation?: boolean; tool?: string; args?: Record<string, unknown>; summary?: string } | undefined;
          if (out?.requiresConfirmation && out.tool && out.summary) {
            pendingMutations.push({ tool: out.tool, args: out.args ?? {}, summary: out.summary });
          }
        }
      }
    }

    const [run] = await db.insert(otaAssistantRuns).values({
      adminId,
      prompt: parsed.data.prompt,
      response: result.text,
      toolCalls: JSON.stringify(toolCallsLog),
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    }).returning({ id: otaAssistantRuns.id });

    return res.json({
      runId: run.id,
      response: result.text,
      toolCalls: toolCallsLog,
      pendingMutations,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "errore LLM";
    await db.insert(otaAssistantRuns).values({
      adminId,
      prompt: parsed.data.prompt,
      status: "error",
      error: msg,
      startedAt,
      finishedAt: new Date(),
    }).catch(() => undefined);
    console.error("[ota-assistant] LLM error:", err);
    return sendError(res, 500, `Errore assistente: ${msg.slice(0, 300)}`);
  }
});

const confirmSchema = z.object({
  tool: z.enum(["publishOta", "syncEas", "approveRelease", "rejectRelease", "rollbackToGroup", "forceUpdateDevice"]),
  args: z.record(z.string(), z.unknown()).default({}),
});

router.post("/confirm", async (req: Request, res: Response) => {
  const adminId = req.session.userId!;
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "tool/args non valido");

  const startedAt = new Date();

  // Crea il run con status=running PRIMA di eseguire, così abbiamo un id per
  // legare i log della publish async e aggiornare lo stato al termine.
  const [run] = await db.insert(otaAssistantRuns).values({
    adminId,
    prompt: `[CONFIRM] ${parsed.data.tool}`,
    status: "running",
    toolCalls: JSON.stringify([{ tool: parsed.data.tool, args: parsed.data.args }]),
    startedAt,
  }).returning({ id: otaAssistantRuns.id });

  const result = await execMutatingTool(parsed.data.tool, parsed.data.args, adminId, run.id);

  // Aggiorna il run row. Per publish (async) lasciamo finishedAt null e
  // status=running: finalizePublishRun lo aggiornerà a completion del job.
  await db.update(otaAssistantRuns)
    .set({
      response: result.ok ? "OK" : `ERR: ${result.error}`,
      toolCalls: JSON.stringify([{ tool: parsed.data.tool, args: parsed.data.args, result: result.result, error: result.error }]),
      status: result.async ? "running" : (result.ok ? "completed" : "error"),
      error: result.error ?? null,
      logPath: result.logPath ?? null,
      finishedAt: result.async ? null : new Date(),
    })
    .where(eq(otaAssistantRuns.id, run.id));

  if (!result.ok) return sendError(res, 400, result.error ?? "Esecuzione fallita");
  return res.json({ ...(result.result as Record<string, unknown>), runId: result.async ? run.id : (result.result as { runId?: string })?.runId ?? run.id });
});

router.get("/history", async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  const adminFilter = typeof req.query.adminId === "string" ? req.query.adminId : undefined;
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const conds = [] as ReturnType<typeof eq>[];
  if (adminFilter) conds.push(eq(otaAssistantRuns.adminId, adminFilter));
  if (statusFilter) conds.push(eq(otaAssistantRuns.status, statusFilter));
  if (search) {
    const pat = `%${search}%`;
    conds.push(or(like(otaAssistantRuns.prompt, pat), like(otaAssistantRuns.response, pat))!);
  }
  const rows = await db
    .select()
    .from(otaAssistantRuns)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(otaAssistantRuns.startedAt))
    .limit(limit);
  return res.json(rows);
});

router.get("/watchdog-reports", async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const rows = await db
    .select()
    .from(otaWatchdogReports)
    .orderBy(desc(otaWatchdogReports.generatedAt))
    .limit(limit);
  return res.json(rows.map((r) => ({
    id: r.id,
    generatedAt: r.generatedAt,
    triggeredBy: r.triggeredBy,
    candidateCount: r.candidateCount,
    threshold: r.threshold,
    minDownloads: r.minDownloads,
    candidates: (() => { try { return JSON.parse(r.payload); } catch { return []; } })(),
  })));
});

router.get("/run/:runId/log", async (req: Request, res: Response) => {
  const runId = req.params.runId as string;
  // Trova il log path direttamente da disco — più semplice e non dipende dalla scrittura DB.
  const direct = path.join(LOG_DIR, `publish-${runId}.log`);
  let logPath: string | null = null;
  if (fs.existsSync(direct)) {
    logPath = direct;
  } else {
    const [row] = await db.select({ logPath: otaAssistantRuns.logPath }).from(otaAssistantRuns).where(eq(otaAssistantRuns.id, runId)).limit(1);
    if (row?.logPath && fs.existsSync(row.logPath)) logPath = row.logPath;
  }
  if (!logPath) return sendError(res, 404, "Log non trovato");
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    // Truncate to last 50KB per evitare risposte enormi
    const trimmed = content.length > 50_000 ? `…(troncato)…\n${content.slice(-50_000)}` : content;
    const done = /exit code:\s*\d+/.test(content) && !/retry singolo/.test(content.split(/exit code:/).pop() ?? "");
    return res.json({ runId, log: trimmed, done });
  } catch (err) {
    return sendError(res, 500, `Errore lettura log: ${(err as Error).message}`);
  }
});

// Helper silenziatori per import che restano utili a estensori futuri.
void gte; void sql;

export default router;
