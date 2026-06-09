/**
 * ThinkCentre Metrics — Admin
 *
 * GET /api/admin/thinkcentre-metrics
 * Proxy leggero verso l'agente Node.js che gira sul ThinkCentre (mini-PC di casa).
 * L'agente espone GET /sys-metrics su THINKCENTRE_METRICS_URL (porta 9199).
 *
 * Se la variabile non è configurata o l'agente non risponde entro 4 s,
 * restituisce { online: false } senza crash.
 */

import { Router, type Request, type Response } from "express";

const router = Router();

const METRICS_URL = process.env.THINKCENTRE_METRICS_URL
  ? `${process.env.THINKCENTRE_METRICS_URL.replace(/\/$/, "")}/sys-metrics`
  : null;

const AGENT_TOKEN = process.env.THINKCENTRE_AGENT_TOKEN ?? "";

const TIMEOUT_MS = 4_000;

router.get("/thinkcentre-metrics", async (_req: Request, res: Response) => {
  if (!METRICS_URL) {
    return res.json({ online: false, reason: "THINKCENTRE_METRICS_URL non configurato" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {};
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

export default router;
