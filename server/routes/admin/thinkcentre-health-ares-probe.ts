/**
 * Ares — monitor del PC fisso (Windows) che ospita Ollama dedicato alla
 * diagnostica AI.
 *
 * Ares è una macchina SEPARATA dal ThinkCentre: espone Ollama su
 * `ARES_OLLAMA_URL` (es. https://ollama.biker-link.net) tramite Cloudflare
 * Tunnel, NON protetto da Cloudflare Access (gli header CF Access vengono
 * comunque allegati: sono innocui verso un origin che non li valida).
 *
 * Env vars:
 *   ARES_OLLAMA_URL    URL Ollama del PC fisso (online/offline + latenza).
 *   ARES_OLLAMA_TOKEN  (opzionale) token custom Ollama, header X-Ollama-Token.
 *   ARES_METRICS_URL   (opzionale) endpoint HTTP che restituisce le metriche
 *                      host in JSON. Se assente, il monitor mostra solo
 *                      online/offline e segnala l'endpoint come prerequisito
 *                      (questo task NON installa servizi sul PC fisso).
 *
 * Contratto ARES_METRICS_URL (GET → JSON, percentuali 0-100):
 *   { "cpu": number, "ram": number, "gpu": number, "gpuName"?: string }
 * Sono accettate anche varianti di chiave comuni (cpu_percent, ram_percent,
 * memory.percent, gpu.utilization, ...).
 */

import { cfAccessHeaders } from "../../lib/cf-access";
import {
  PROBE_TIMEOUT_MS,
  maskUrl,
  httpProbe,
  recordError,
  getHistory,
  recordProbeLog,
  getProbeLog,
  type ProbeLogEntry,
} from "./thinkcentre-health-utils";

export type { ProbeLogEntry };

// Gli header CF Access vanno allegati SOLO verso origin di nostra proprietà
// (biker-link.net). Se ARES_METRICS_URL/ARES_OLLAMA_URL puntasse per errore a un
// host esterno, evitiamo di disclosare il service token Cloudflare.
function trustedCfHeaders(url: string): Record<string, string> {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "biker-link.net" || host.endsWith(".biker-link.net")) {
      return { ...cfAccessHeaders() };
    }
  } catch {
    // URL malformato → nessun header
  }
  return {};
}

export interface AresSample {
  ts: number;
  cpuPct: number | null;
  ramPct: number | null;
  gpuPct: number | null;
}

export interface AresHealth {
  /** ARES_OLLAMA_URL impostato. */
  configured: boolean;
  /** Ollama sul PC fisso raggiungibile. */
  online: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  /** ARES_METRICS_URL impostato (endpoint metriche host disponibile). */
  metricsConfigured: boolean;
  cpuPct: number | null;
  ramPct: number | null;
  gpuPct: number | null;
  gpuName?: string;
  /** Storico in-memory delle ultime rilevazioni (per il grafico). */
  samples: AresSample[];
  history: Array<{ timestamp: number; error: string }>;
  probeLog: ProbeLogEntry[];
}

// ── Ring buffer in-memory dei campioni metrici ─────────────────────────────────
// ~60 punti × refetch 30s ≈ 30 min di storico. Volatile: si ricostruisce dopo un
// restart del server (le metriche ad alta frequenza non vanno persistite a ogni
// tick per non saturare il DB).
const ARES_SAMPLES_MAX = 60;
const aresSamples: AresSample[] = [];

function pushAresSample(sample: AresSample): void {
  aresSamples.push(sample);
  while (aresSamples.length > ARES_SAMPLES_MAX) aresSamples.shift();
}

function clampPct(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value * 10) / 10;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const n = clampPct(obj[k]);
    if (n != null) return n;
  }
  return null;
}

interface AresMetrics {
  cpuPct: number | null;
  ramPct: number | null;
  gpuPct: number | null;
  gpuName?: string;
}

async function fetchAresMetrics(url: string): Promise<AresMetrics | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { ...trustedCfHeaders(url) },
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return null;

    const mem =
      data.memory && typeof data.memory === "object"
        ? (data.memory as Record<string, unknown>)
        : data.ram && typeof data.ram === "object"
          ? (data.ram as Record<string, unknown>)
          : undefined;
    const gpu =
      data.gpu && typeof data.gpu === "object" ? (data.gpu as Record<string, unknown>) : undefined;

    const cpuPct = pickNumber(data, ["cpuPct", "cpu_percent", "cpu"]);
    const ramPct =
      pickNumber(data, ["ramPct", "ram_percent", "ram", "memPct", "memory_percent"]) ??
      (mem ? pickNumber(mem, ["percent", "pct", "usedPercent"]) : null);
    const gpuPct =
      pickNumber(data, ["gpuPct", "gpu_percent"]) ??
      (gpu ? pickNumber(gpu, ["utilization", "percent", "pct", "load"]) : null);

    const gpuNameRaw = data.gpuName ?? (gpu ? gpu.name : undefined);
    const gpuName = typeof gpuNameRaw === "string" ? gpuNameRaw.slice(0, 60) : undefined;

    return { cpuPct, ramPct, gpuPct, gpuName };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeAres(): Promise<AresHealth> {
  const base = process.env.ARES_OLLAMA_URL?.trim().replace(/\/$/, "");
  const metricsUrl = process.env.ARES_METRICS_URL?.trim();
  const metricsConfigured = !!metricsUrl;

  if (!base) {
    return {
      configured: false,
      online: false,
      latencyMs: null,
      url: null,
      metricsConfigured,
      cpuPct: null,
      ramPct: null,
      gpuPct: null,
      samples: aresSamples.slice(),
      history: getHistory("ares"),
      probeLog: getProbeLog("ares"),
    };
  }

  // Online check via Ollama /api/version (lightweight). Il PC fisso non è dietro
  // CF Access: gli header restano innocui (e comunque solo verso biker-link.net).
  const headers: Record<string, string> = { ...trustedCfHeaders(base) };
  const token = process.env.ARES_OLLAMA_TOKEN;
  if (token) headers["X-Ollama-Token"] = token;

  const r = await httpProbe(`${base}/api/version`, headers);
  if (!r.ok) {
    const error = r.error ?? "offline";
    console.error("[thinkcentre-probe] ares KO", { error });
    recordError("ares", error);
    recordProbeLog("ares", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error });
    return {
      configured: true,
      online: false,
      latencyMs: r.latencyMs,
      url: maskUrl(base),
      error,
      metricsConfigured,
      cpuPct: null,
      ramPct: null,
      gpuPct: null,
      samples: aresSamples.slice(),
      history: getHistory("ares"),
      probeLog: getProbeLog("ares"),
    };
  }

  // Online — leggi le metriche se l'endpoint è configurato.
  const metrics = metricsUrl ? await fetchAresMetrics(metricsUrl) : null;
  const cpuPct = metrics?.cpuPct ?? null;
  const ramPct = metrics?.ramPct ?? null;
  const gpuPct = metrics?.gpuPct ?? null;

  if (cpuPct != null || ramPct != null || gpuPct != null) {
    pushAresSample({ ts: Date.now(), cpuPct, ramPct, gpuPct });
  }

  const detailParts: string[] = ["online"];
  if (cpuPct != null) detailParts.push(`cpu ${cpuPct}%`);
  if (ramPct != null) detailParts.push(`ram ${ramPct}%`);
  if (gpuPct != null) detailParts.push(`gpu ${gpuPct}%`);
  if (metricsConfigured && metrics == null) detailParts.push("metriche non leggibili");
  recordProbeLog("ares", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: detailParts.join(", ") });

  return {
    configured: true,
    online: true,
    latencyMs: r.latencyMs,
    url: maskUrl(base),
    metricsConfigured,
    cpuPct,
    ramPct,
    gpuPct,
    gpuName: metrics?.gpuName,
    samples: aresSamples.slice(),
    history: getHistory("ares"),
    probeLog: getProbeLog("ares"),
  };
}
