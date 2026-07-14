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
//
// Task #2603 — split mechanical: helpers + prompts estratti in sotto-cartella.

import { Router, type Request, type Response } from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../../db";
import { otaAssistantRuns, otaWatchdogReports } from "@shared/db";
import { eq, desc, and, gte, sql, or, like } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { generateText, tool, type ToolSet } from "ai";
import { runWithFallback, hasAnyAiProvider, AI_NO_PROVIDER_MESSAGE } from "../../ai/moderation/provider";
import type { AiProviderId } from "../../ai/moderation/types";
import { z } from "zod";
import {
  LOG_DIR,
  toolQueryReleases,
  toolQueryBootEvents,
  toolQueryDeviceVersion,
  toolDiagnoseDeliveryFailure,
  toolProposeRollback,
  toolQueryWatchdogReports,
  toolQueryAssistantHistory,
  toolProposeNextPublish,
  execMutatingTool,
} from "./ota-assistant/helpers";
import { systemPrompt } from "./ota-assistant/prompts";

const router = Router();

// Task #2966 — Provider preferito opzionale per l'OTA Assistant. OTA_ASSISTANT_MODEL
// è ora interpretato come override del *provider* (groq/google/gemini/openai):
// se valido, viene messo in testa alla chain a cascata; altrimenti (vuoto o valore
// legacy tipo "gpt-4o-mini") si usa la chain completa con primo provider disponibile.
const VALID_PROVIDERS: AiProviderId[] = ["groq", "google", "openai"];
function parseOtaPreferred(raw: string | undefined): AiProviderId | "auto" {
  if (!raw) return "auto";
  const v = raw.trim().toLowerCase();
  if (v === "gemini") return "google";
  if (VALID_PROVIDERS.includes(v as AiProviderId)) return v as AiProviderId;
  return "auto";
}
const PREFERRED_PROVIDER = parseOtaPreferred(process.env.OTA_ASSISTANT_MODEL);
const TEMPERATURE = Number(process.env.OTA_ASSISTANT_TEMPERATURE ?? "0.2");

// ── Endpoint ──────────────────────────────────────────────────────────────────

const promptSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

router.post("/", async (req: Request, res: Response) => {
  const adminId = req.session.userId!;
  const parsed = promptSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "prompt obbligatorio");

  if (!hasAnyAiProvider()) {
    return sendError(res, 503, AI_NO_PROVIDER_MESSAGE);
  }

  const startedAt = new Date();

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

  try {
    // runWithFallback è Ollama-first per default (Task #3872): Ollama locale → Groq → Gemini → OpenAI.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fallback = await runWithFallback(
      { role: "brain", preferredProvider: PREFERRED_PROVIDER },
      (m) => m.scheduler(() => generateText({
        model: m.model,
        temperature: TEMPERATURE,
        instructions: systemPrompt,
        prompt: parsed.data.prompt,
        tools: tools as ToolSet,
        stopWhen: ({ steps }) => steps.length >= 5,
      })),
    );
    const result = fallback.value;
    const provider = fallback.model.providerName;
    const modelId = fallback.model.modelId;
    console.log(`[ota-assistant] risposta generata da ${provider}/${modelId}`);

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
      provider,
      model: modelId,
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
