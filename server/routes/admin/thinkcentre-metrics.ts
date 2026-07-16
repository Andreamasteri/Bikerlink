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
import { gte, asc } from "drizzle-orm";
import { withBgDbSlot } from "../../lib/bg-db-limiter";

const router = Router();

const TIMEOUT_MS = 4_000;
const MAX_HISTORY_POINTS = 300;

// Env letta per-richiesta (non a module-load): un secret appena provisioning-ato
// prende effetto al semplice restart, senza redeploy del codice.
router.get("/thinkcentre-metrics", async (_req: Request, res: Response) => {
  const metricsBase = process.env.THINKCENTRE_METRICS_URL?.trim().replace(/\/$/, "");
  const METRICS_URL = metricsBase ? `${metricsBase}/sys-metrics` : null;
  const AGENT_TOKEN = process.env.THINKCENTRE_AGENT_TOKEN ?? "";

  if (!METRICS_URL) {
    return res.json({ online: false, reason: "THINKCENTRE_METRICS_URL non configurato" });
  }

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
      return res.json({ online: false, reason: `HTTP ${upstream.status}` });
    }
    const data = await upstream.json() as unknown;
    return res.json({ online: true, ...(data as object) });
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return res.json({ online: false, reason: isTimeout ? "timeout" : "unreachable" });
  }
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
