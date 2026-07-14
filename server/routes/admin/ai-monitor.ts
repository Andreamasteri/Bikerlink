// Task #10 (Quebracho c) — Monitor unificato delle 4 AI di BikerLink
// (Bowie/Horus/Ares/Quebracho): online/offline, latenza, job attivi (solo
// Quebracho ne ha), errori recenti. Riusa i probe esistenti dove già
// disponibili (Bowie via probeOllama, Ares via probeAres) e riusa lo schema
// già presente `thinkcentre_health_events` per lo storico persistito delle
// transizioni online↔offline (nessuna nuova tabella).
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { thinkcentreHealthEvents } from "@shared/db";
import { desc, eq } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { withBgDbSlot, isBgDbLimiterDropError } from "../../lib/bg-db-limiter";
import { dedupWarn } from "../../lib/dedup-logger";
import { cfAccessHeaders } from "../../lib/cf-access";
import { httpProbe } from "./thinkcentre-health-utils";
import { probeOllama } from "./thinkcentre-health-gh-probes";
import { probeAres } from "./thinkcentre-health-ares-probe";
import { isQuebrachoConfigured, isQuebrachoReachable } from "../../lib/quebracho-client";
import { getCoordinatorJobsSnapshot } from "../../ai/coordinator/job-gate";

const router = Router();

export type AgentPersona = "bowie" | "horus" | "ares" | "quebracho";

export interface AgentMonitorSnapshot {
  persona: AgentPersona;
  configured: boolean;
  online: boolean;
  latencyMs: number | null;
  /** Job in stato "running" adesso — significativo solo per Quebracho (regista). */
  activeJobs: number | null;
  error?: string;
}

// ── Probe per-persona ────────────────────────────────────────────────────────

async function probeBowieAgent(): Promise<AgentMonitorSnapshot> {
  const h = await probeOllama();
  return { persona: "bowie", configured: h.configured, online: h.ok, latencyMs: h.latencyMs, activeJobs: null, error: h.error };
}

// Horus gira sulla stessa infra di Bowie (stesso container Ollama): usa
// HORUS_OLLAMA_URL/TOKEN se impostati, altrimenti ricade su BOWIE_OLLAMA_*
// (stesso fallback di server/lib/ollama-client.ts endpointFor).
async function probeHorusAgent(): Promise<AgentMonitorSnapshot> {
  const base = (process.env.HORUS_OLLAMA_URL?.trim() || process.env.BOWIE_OLLAMA_URL?.trim() || "").replace(/\/$/, "");
  const token = process.env.HORUS_OLLAMA_TOKEN?.trim() || process.env.BOWIE_OLLAMA_TOKEN?.trim() || "";
  if (!base) return { persona: "horus", configured: false, online: false, latencyMs: null, activeJobs: null };
  const headers: Record<string, string> = { ...cfAccessHeaders("horus") };
  if (token) headers["X-Ollama-Token"] = token;
  const r = await httpProbe(`${base}/api/tags`, headers);
  return { persona: "horus", configured: true, online: r.ok, latencyMs: r.latencyMs, activeJobs: null, error: r.error };
}

async function probeAresAgent(): Promise<AgentMonitorSnapshot> {
  const h = await probeAres();
  return { persona: "ares", configured: h.configured, online: h.online, latencyMs: h.latencyMs, activeJobs: null, error: h.error };
}

async function probeQuebrachoAgent(): Promise<AgentMonitorSnapshot> {
  if (!isQuebrachoConfigured) {
    return { persona: "quebracho", configured: false, online: false, latencyMs: null, activeJobs: 0 };
  }
  const t0 = Date.now();
  const online = await isQuebrachoReachable();
  const activeJobs = getCoordinatorJobsSnapshot().filter((j) => j.state === "running").length;
  return { persona: "quebracho", configured: true, online, latencyMs: online ? Date.now() - t0 : null, activeJobs };
}

// ── Storico transizioni (persistito, best-effort) ───────────────────────────
//
// In-memory: ultimo stato osservato per persona in questo processo. Al primo
// probe dopo il boot non scriviamo nulla (nessuna transizione "osservata",
// solo un valore iniziale) per non generare rumore ad ogni restart.
const _lastOnline = new Map<AgentPersona, boolean>();

async function recordTransitionIfChanged(persona: AgentPersona, online: boolean): Promise<void> {
  const prev = _lastOnline.get(persona);
  _lastOnline.set(persona, online);
  if (prev === undefined || prev === online) return;
  try {
    await withBgDbSlot(() =>
      db.insert(thinkcentreHealthEvents).values({
        serviceKey: `ai:${persona}`,
        transitionFrom: prev ? "online" : "offline",
        transitionTo: online ? "online" : "offline",
      }),
    );
  } catch (err) {
    if (isBgDbLimiterDropError(err)) return;
    dedupWarn("ai-monitor-transition", `[ai-monitor] persist transizione "${persona}" fallita: ${String(err)}`);
  }
}

router.get("/ai-monitor", async (_req: Request, res: Response) => {
  try {
    const [bowie, horus, ares, quebracho] = await Promise.all([
      probeBowieAgent(),
      probeHorusAgent(),
      probeAresAgent(),
      probeQuebrachoAgent(),
    ]);
    const agents = [bowie, horus, ares, quebracho];
    await Promise.all(agents.map((a) => recordTransitionIfChanged(a.persona, a.online)));
    res.json({ agents, checkedAt: new Date().toISOString() });
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

router.get("/ai-monitor/history", async (req: Request, res: Response) => {
  const persona = String(req.query.persona ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
  try {
    const rows = await db
      .select()
      .from(thinkcentreHealthEvents)
      .where(persona ? eq(thinkcentreHealthEvents.serviceKey, `ai:${persona}`) : undefined)
      .orderBy(desc(thinkcentreHealthEvents.occurredAt))
      .limit(limit);
    res.json({ entries: rows });
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

/** Solo per i test: azzera la cache in-memory delle transizioni. */
export function __resetAiMonitorCacheForTests(): void {
  _lastOnline.clear();
}

export default router;
