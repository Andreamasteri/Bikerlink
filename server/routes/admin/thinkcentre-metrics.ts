/**
 * ThinkCentre Metrics — Admin
 *
 * GET /api/admin/thinkcentre-metrics
 * Proxy leggero verso l'agente Node.js che gira sul ThinkCentre (mini-PC di casa).
 * L'agente espone GET /sys-metrics su THINKCENTRE_METRICS_URL (porta 9199).
 *
 * Se la variabile non è configurata o l'agente non risponde entro 4 s,
 * restituisce { online: false } senza crash.
 *
 * GET /api/admin/tc-metrics-history?range=24h|7d
 * Restituisce i campioni storici dalla tabella tc_metrics_history.
 * Se il totale supera 300 punti applica downsampling uniforme.
 */

import { Router, type Request, type Response } from "express";
import { cfAccessHeaders } from "../../lib/cf-access";
import { db, withDbRetry } from "../../db";
import { tcMetricsHistory } from "@shared/db";
import { gte, asc, desc, and, isNotNull } from "drizzle-orm";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { hubGet, HUB_VRAM_TIMEOUT_MS } from "../../lib/ai-hub-client";
import { withShortCache } from "../../lib/short-cache";

const router = Router();

const TIMEOUT_MS = 4_000;
const MAX_HISTORY_POINTS = 300;

// Env letta per-richiesta (non a module-load): un secret appena provisioning-ato
// prende effetto al semplice restart, senza redeploy del codice.
// Cacheato 10 s (withShortCache) per evitare chiamate HTTP ridondanti quando il
// pannello admin effettua polling rapido su più componenti contemporaneamente.
router.get("/thinkcentre-metrics", async (_req: Request, res: Response) => {
  const metricsBase = process.env.THINKCENTRE_METRICS_URL?.trim().replace(/\/$/, "");
  const METRICS_URL = metricsBase ? `${metricsBase}/sys-metrics` : null;
  const AGENT_TOKEN = process.env.THINKCENTRE_AGENT_TOKEN ?? "";

  if (!METRICS_URL) {
    return res.json({ online: false, reason: "THINKCENTRE_METRICS_URL non configurato" });
  }

  const payload = await withShortCache("admin:thinkcentre-metrics", 10_000, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // tc.biker-link.net è dietro Cloudflare Access (oltre all'X-Agent-Token
    // applicativo): senza il Service Token CF la richiesta viene bloccata all'edge
    // con 401/403 e il TC risulta erroneamente "offline". Gli header CF sono
    // innocui se la policy Access non è attiva (l'origine li ignora).
    const headers: Record<string, string> = { ...cfAccessHeaders() };
    if (AGENT_TOKEN) headers["X-Agent-Token"] = AGENT_TOKEN;

    try {
      const upstream = await fetch(METRICS_URL, { signal: controller.signal, headers });
      clearTimeout(timer);
      if (!upstream.ok) {
        return { online: false, reason: `HTTP ${upstream.status}` };
      }
      const raw = await upstream.json() as Record<string, unknown>;
      // Normalizza esplicitamente i campi attesi: se il TC agent cambia shape
      // (es. rinomina loadAvg1 → loadAvg) il client riceve undefined per quel campo
      // e la guard client-side degrada a "offline banner" senza crash.
      // Passare il raw spread non-validato può introdurre campi inattesi o shape
      // annidate che rompono le assunzioni di ThinkCentreEfficiencyCard.
      const num = (v: unknown): number | undefined =>
        typeof v === "number" ? v : undefined;
      const normalized: Record<string, unknown> = {
        online: true,
        loadAvg1:   num(raw.loadAvg1),
        loadAvg5:   num(raw.loadAvg5),
        loadAvg15:  num(raw.loadAvg15),
        ramUsedMb:  num(raw.ramUsedMb),
        ramTotalMb: num(raw.ramTotalMb),
        uptimeSec:  num(raw.uptimeSec),
        cpuTempC:   num(raw.cpuTempC),
        gpuTempC:   num(raw.gpuTempC),
        gpuUtilPct: num(raw.gpuUtilPct),
        vramUsedMb: num(raw.vramUsedMb),
        vramTotalMb:num(raw.vramTotalMb),
        checkedAt:  num(raw.checkedAt),
      };
      // diskMounts: valida che sia un array di oggetti con la shape attesa
      if (Array.isArray(raw.diskMounts)) {
        normalized.diskMounts = raw.diskMounts
          .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
          .map((m) => ({
            path:    typeof m.path    === "string" ? m.path    : "?",
            usedGb:  num(m.usedGb)  ?? 0,
            totalGb: num(m.totalGb) ?? 0,
            usedPct: num(m.usedPct) ?? 0,
          }));
      }
      return normalized;
    } catch (err: unknown) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return { online: false, reason: isTimeout ? "timeout" : "unreachable" };
    }
  });

  return res.json(payload);
});

// ── Picchi GPU 24h ────────────────────────────────────────────────────────
// GET /api/admin/tc-gpu-peaks
// Restituisce il picco temperatura GPU (da tc_metrics_history) e i picchi
// VRAM per-agente (da ai-hub /vram) nelle ultime 24h.
// Non fa mai 500: se una sorgente fallisce, il campo corrispondente è null.

interface AgentPeak { usedMiB: number; pct: number; at: string }
interface VramResponse {
  ok: boolean;
  available?: boolean;
  agentPeaks24h?: Record<string, AgentPeak>;
}

// Cacheato 30 s: i picchi 24h cambiano lentamente e la card è spesso
// in polling; evita query DB + HTTP verso ai-hub ad ogni poll rapido.
router.get("/tc-gpu-peaks", async (_req: Request, res: Response) => {
  const payload = await withShortCache("admin:tc-gpu-peaks", 30_000, async () => {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60_000);

    // ── Picco temperatura GPU da storico DB ──────────────────────────────────
    let gpuTempPeak: { valueC: number; at: string } | null = null;
    try {
      const rows = await withBgDbSlot(() =>
        withDbRetry(() =>
          db
            .select({ gpuTempC: tcMetricsHistory.gpuTempC, sampledAt: tcMetricsHistory.sampledAt })
            .from(tcMetricsHistory)
            .where(and(gte(tcMetricsHistory.sampledAt, cutoff24h), isNotNull(tcMetricsHistory.gpuTempC)))
            .orderBy(desc(tcMetricsHistory.gpuTempC))
            .limit(1),
        ),
      );
      if (rows.length > 0 && rows[0].gpuTempC != null) {
        gpuTempPeak = { valueC: rows[0].gpuTempC, at: rows[0].sampledAt.toISOString() };
      }
    } catch (err) {
      console.warn("[tc-gpu-peaks] DB query error:", err);
    }

    // ── Picchi VRAM per-agente da ai-hub /vram ───────────────────────────────
    let agentPeaks24h: Record<string, AgentPeak> | null = null;
    try {
      const result = await hubGet<VramResponse>("/vram", undefined, HUB_VRAM_TIMEOUT_MS);
      // An offline /vram response is a successful transport response, but
      // it must not be treated as a valid empty peak set.
      if (result.ok && result.data?.available !== false && result.data?.agentPeaks24h) {
        agentPeaks24h = result.data.agentPeaks24h;
      }
    } catch (err) {
      console.warn("[tc-gpu-peaks] ai-hub /vram error:", err);
    }

    return { gpuTempPeak, agentPeaks24h };
  });

  return res.json(payload);
});

// ── Storico metriche TC ────────────────────────────────────────────────────
// GET /api/admin/tc-metrics-history?range=24h|7d
// Legge la finestra richiesta dalla tabella tc_metrics_history, ordinate per
// sampled_at ASC. Se i punti superano MAX_HISTORY_POINTS applica downsampling
// uniforme (prende ogni N-esima riga) per non sovraccaricare il grafico SVG.

router.get("/tc-metrics-history", async (req: Request, res: Response) => {
  const rawRange = req.query.range;
  const range = rawRange === "7d" ? "7d" : "24h"; // default 24h
  const hours = range === "7d" ? 7 * 24 : 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60_000);

  try {
    const rows = await withBgDbSlot(() =>
      withDbRetry(() =>
        db
          .select()
          .from(tcMetricsHistory)
          .where(gte(tcMetricsHistory.sampledAt, cutoff))
          .orderBy(asc(tcMetricsHistory.sampledAt)),
      ),
    );

    let samples = rows;
    if (rows.length > MAX_HISTORY_POINTS) {
      // Downsampling uniforme: prendi ogni N-esima riga.
      const step = Math.ceil(rows.length / MAX_HISTORY_POINTS);
      samples = rows.filter((_, i) => i % step === 0);
      // Assicura che l'ultimo punto sia sempre incluso.
      const last = rows[rows.length - 1];
      if (samples[samples.length - 1] !== last) samples.push(last);
    }

    return res.json({ range, samples });
  } catch (err: unknown) {
    console.warn("[tc-metrics-history] query error:", err);
    return res.status(500).json({ error: "Storico non disponibile" });
  }
});

export default router;
