/**
 * ThinkCentre — GraphHopper, Ollama e Whisper probes.
 * Estratti da thinkcentre-health.ts per mantenere i file sotto 600 righe.
 */

import { ACTIVE_PROFILE } from "../../graphhopper-client";
import { cfAccessHeaders } from "../../lib/cf-access";
import { getAreaEnabledMap } from "../../routing/routing-area-state";
import {
  ROUTING_AREAS,
  type RoutingArea,
  type RoutingAreaCode,
  type RoutingAreaTier,
} from "@shared/routing-areas";
import {
  PROBE_TIMEOUT_MS,
  readBodySafe,
  sanitizeError,
  maskUrl,
  httpProbe,
  recordError,
  getHistory,
  recordProbeLog,
  getProbeLog,
  isStartingUp,
  type ProbeLogEntry,
} from "./thinkcentre-health-utils";

export type { ProbeLogEntry };

// ── Tipi condivisi ────────────────────────────────────────────────────────────

export interface ErrorEvent {
  timestamp: number;
  error: string;
}

export interface ServiceHealth {
  key: string;
  label: string;
  configured: boolean;
  ok: boolean;
  startingUp: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  tileVersion?: string;
  tokenMissing?: boolean;
  history: ErrorEvent[];
  probeLog: ProbeLogEntry[];
}

export interface AreaServiceHealth {
  code: RoutingAreaCode;
  nome: string;
  tier: RoutingAreaTier;
  enabled: boolean;
  ok: boolean;
  startingUp: boolean;
  latencyMs: number | null;
  error?: string;
  history: ErrorEvent[];
  probeLog: ProbeLogEntry[];
}

export interface GraphHopperHealth {
  configured: boolean;
  url: string | null;
  tokenMissing: boolean;
  ok: boolean;
  areas: AreaServiceHealth[];
}

// ── GraphHopper ───────────────────────────────────────────────────────────────

/**
 * Costruisce un messaggio d'errore esplicito per un 401/403 sul GraphHopper del
 * ThinkCentre, distinguendo "token mancante nella app" da "token che non combacia
 * con l'X-GH-Token hardcoded nella nginx del ThinkCentre" (drift). Serve a non
 * scambiare un 403 di autenticazione per un generico "servizio down".
 */
function ghAuthMismatchError(status: number, tokenMissing: boolean, bodySnippet?: string): string {
  const base = tokenMissing
    ? `Token mancante (HTTP ${status}) — GRAPHHOPPER_TOKEN non è configurato nella app`
    : `Token non combaciante (HTTP ${status}) — GRAPHHOPPER_TOKEN diverso dall'X-GH-Token nella nginx del ThinkCentre (token drift)`;
  return sanitizeError(bodySnippet ? `${base} — ${bodySnippet}` : base);
}

async function graphHopperRouteProbe(
  base: string,
  token: string | undefined,
  points: [number, number][] = [[9.19, 45.46], [9.08, 45.81]],
): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...cfAccessHeaders() };
  if (token) headers["X-GH-Token"] = token;
  try {
    const res = await fetch(`${base}/route`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        points,
        profile: ACTIVE_PROFILE,
        points_encoded: true,
        instructions: false,
        calc_points: false,
      }),
    });
    const latencyMs = Date.now() - t0;
    if (res.status >= 200 && res.status < 300) return { ok: true, latencyMs };
    const body = await readBodySafe(res);
    const bodySnippet = body.trim().slice(0, 400);
    let error: string;
    if (res.status === 401 || res.status === 403) {
      error = ghAuthMismatchError(res.status, !token || token.trim() === "", bodySnippet);
    } else {
      error = bodySnippet
        ? sanitizeError(`HTTP ${res.status} — ${bodySnippet}`)
        : `HTTP ${res.status}`;
    }
    return { ok: false, latencyMs, error };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    let classified: string;
    if (err instanceof Error && err.name === "AbortError") {
      classified = `timeout (>${Math.round(PROBE_TIMEOUT_MS / 1000)} s) — ${raw}`;
    } else if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(raw)) {
      classified = `network error — ${raw}`;
    } else {
      classified = raw;
    }
    return { ok: false, latencyMs: null, error: sanitizeError(classified) };
  } finally {
    clearTimeout(timer);
  }
}

function areaProbePoints(area: RoutingArea): [number, number][] {
  const { minLon, minLat, maxLon, maxLat } = area.bbox;
  const cLon = (minLon + maxLon) / 2;
  const cLat = (minLat + maxLat) / 2;
  const dLon = (maxLon - minLon) * 0.1;
  const dLat = (maxLat - minLat) * 0.1;
  return [
    [cLon - dLon, cLat - dLat],
    [cLon + dLon, cLat + dLat],
  ];
}

async function probeGraphHopperArea(
  area: RoutingArea,
  base: string,
  token: string | undefined,
  enabled: boolean,
): Promise<AreaServiceHealth> {
  const historyKey = `graphhopper:${area.codice}`;
  const baseShape = {
    code: area.codice,
    nome: area.nome,
    tier: area.tier,
    history: getHistory(historyKey),
    probeLog: getProbeLog(historyKey),
  };
  if (!enabled) {
    return { ...baseShape, enabled: false, ok: false, startingUp: false, latencyMs: null };
  }
  const areaBase = `${base}${area.path}`;
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (token) headers["X-GH-Token"] = token;
  // Solo 2xx = OK: un 401/403 NON è "raggiungibile quindi ok", è un token rifiutato
  // (drift) che va reso esplicito, non mascherato da stato verde.
  const health = await httpProbe(`${areaBase}/health`, headers);
  if (health.ok) {
    recordProbeLog(historyKey, { timestamp: Date.now(), ok: true, latencyMs: health.latencyMs, detail: "health OK" });
    return { ...baseShape, enabled: true, ok: true, startingUp: false, latencyMs: health.latencyMs, history: getHistory(historyKey), probeLog: getProbeLog(historyKey) };
  }
  // Token drift: la /health raggiunge il servizio ma il token è rifiutato.
  if (health.status === 401 || health.status === 403) {
    const finalError = ghAuthMismatchError(health.status, !token || token.trim() === "");
    console.error(`[thinkcentre-probe] graphhopper ${area.codice} token mismatch`, { status: health.status });
    recordError(historyKey, finalError);
    recordProbeLog(historyKey, { timestamp: Date.now(), ok: false, latencyMs: health.latencyMs, detail: finalError });
    return {
      ...baseShape,
      enabled: true,
      ok: false,
      startingUp: false, // un errore di autenticazione non è un cold-start
      latencyMs: health.latencyMs,
      error: finalError,
      history: getHistory(historyKey),
      probeLog: getProbeLog(historyKey),
    };
  }
  const route = await graphHopperRouteProbe(areaBase, token, areaProbePoints(area));
  if (!route.ok) {
    const finalError = route.error ?? health.error ?? "errore sconosciuto";
    console.error(`[thinkcentre-probe] graphhopper ${area.codice} KO`, { status: finalError });
    recordError(historyKey, finalError);
    recordProbeLog(historyKey, { timestamp: Date.now(), ok: false, latencyMs: route.latencyMs, detail: finalError });
  } else {
    recordProbeLog(historyKey, { timestamp: Date.now(), ok: true, latencyMs: route.latencyMs, detail: "route OK" });
  }
  return {
    ...baseShape,
    enabled: true,
    ok: route.ok,
    startingUp: route.ok ? false : isStartingUp(historyKey),
    latencyMs: route.latencyMs,
    error: route.ok ? undefined : (route.error ?? health.error),
    history: getHistory(historyKey),
    probeLog: getProbeLog(historyKey),
  };
}

export async function probeGraphHopperAreas(): Promise<GraphHopperHealth> {
  const base = process.env.GRAPHHOPPER_URL?.replace(/\/$/, "");
  const token = process.env.GRAPHHOPPER_TOKEN;
  if (!base) {
    return { configured: false, url: null, tokenMissing: true, ok: false, areas: [] };
  }
  const tokenMissing = !token || token.trim() === "";
  let enabledMap: Record<RoutingAreaCode, boolean>;
  try {
    enabledMap = await getAreaEnabledMap();
  } catch (err) {
    console.error("[thinkcentre-probe] lettura getAreaEnabledMap fallita:", err);
    enabledMap = ROUTING_AREAS.reduce((acc, a) => {
      acc[a.codice] = a.abilitatoDefault;
      return acc;
    }, {} as Record<RoutingAreaCode, boolean>);
  }
  const areas = await Promise.all(
    ROUTING_AREAS.map((a) => probeGraphHopperArea(a, base, token, enabledMap[a.codice] ?? false)),
  );
  const enabledAreas = areas.filter((a) => a.enabled);
  const ok = enabledAreas.some((a) => a.ok);
  return { configured: true, url: maskUrl(base), tokenMissing, ok, areas };
}

// ── Ollama ────────────────────────────────────────────────────────────────────

export async function probeOllama(): Promise<ServiceHealth> {
  const base = process.env.BOWIE_OLLAMA_URL?.trim().replace(/\/$/, "");
  const token = process.env.BOWIE_OLLAMA_TOKEN;
  if (!base) {
    return { key: "ollama", label: "Ollama AI", configured: false, ok: false, startingUp: false, latencyMs: null, url: null, history: getHistory("ollama"), probeLog: getProbeLog("ollama") };
  }
  const tokenMissing = !token || token.trim() === "";
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (token) headers["X-Ollama-Token"] = token;
  const r = await httpProbe(`${base}/api/tags`, headers);
  let error = r.error;
  if (r.error?.startsWith("HTTP 401")) {
    error = `Token non valido — ${r.error}`;
  } else if (r.error?.startsWith("HTTP 403")) {
    error = `Accesso negato — ${r.error} — verifica configurazione nginx`;
  }
  if (!r.ok) {
    console.error("[thinkcentre-probe] ollama KO", { error });
    if (error) recordError("ollama", error);
    recordProbeLog("ollama", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error ?? "errore sconosciuto" });
  } else {
    recordProbeLog("ollama", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "tags OK" });
  }
  return { key: "ollama", label: "Ollama AI", configured: true, ok: r.ok, startingUp: r.ok ? false : isStartingUp("ollama"), latencyMs: r.latencyMs, url: maskUrl(base), error, tokenMissing, history: getHistory("ollama"), probeLog: getProbeLog("ollama") };
}

// ── Whisper ───────────────────────────────────────────────────────────────────

export async function probeWhisper(): Promise<ServiceHealth> {
  const base = process.env.WHISPER_URL?.replace(/\/$/, "");
  const token = process.env.WHISPER_TOKEN;
  if (!base) {
    return { key: "whisper", label: "Whisper ASR", configured: false, ok: false, startingUp: false, latencyMs: null, url: null, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
  }
  const tokenMissing = !token || token.trim() === "";
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * 0.5);
  const dataSize = numSamples * 2;
  const wav = Buffer.alloc(44 + dataSize, 0);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(dataSize, 40);
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const healthResult = await httpProbe(`${base}/health`, headers);
  if (healthResult.ok) {
    recordProbeLog("whisper", { timestamp: Date.now(), ok: true, latencyMs: healthResult.latencyMs, detail: "health OK" });
    return { key: "whisper", label: "Whisper ASR", configured: true, ok: true, startingUp: false, latencyMs: healthResult.latencyMs, url: maskUrl(base), tokenMissing, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const t0 = Date.now();
  try {
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "probe.wav");
    formData.append("response_format", "json");
    const res = await fetch(`${base}/inference`, { method: "POST", headers, body: formData, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (res.status >= 200 && res.status < 300) {
      recordProbeLog("whisper", { timestamp: Date.now(), ok: true, latencyMs, detail: "inference OK" });
      return { key: "whisper", label: "Whisper ASR", configured: true, ok: true, startingUp: false, latencyMs, url: maskUrl(base), tokenMissing, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
    }
    const body = await readBodySafe(res);
    const bodySnippet = body.trim().slice(0, 400);
    let error: string;
    if (res.status === 401) {
      error = bodySnippet
        ? sanitizeError(`Token non valido — HTTP 401 — ${bodySnippet}`)
        : "Token non valido (HTTP 401)";
    } else {
      error = bodySnippet
        ? sanitizeError(`HTTP ${res.status} — ${bodySnippet}`)
        : `HTTP ${res.status}`;
    }
    console.error("[thinkcentre-probe] whisper KO", { status: res.status, error });
    recordError("whisper", error);
    recordProbeLog("whisper", { timestamp: Date.now(), ok: false, latencyMs, detail: error });
    return { key: "whisper", label: "Whisper ASR", configured: true, ok: false, startingUp: isStartingUp("whisper"), latencyMs, url: maskUrl(base), error, tokenMissing, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    let classified: string;
    if (err instanceof Error && err.name === "AbortError") {
      classified = `timeout (>20 s) — ${raw}`;
    } else if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(raw)) {
      classified = `network error — ${raw}`;
    } else {
      classified = raw;
    }
    const error = sanitizeError(classified);
    console.error("[thinkcentre-probe] whisper KO (rete/timeout)", { error });
    recordError("whisper", error);
    recordProbeLog("whisper", { timestamp: Date.now(), ok: false, latencyMs: null, detail: error });
    return { key: "whisper", label: "Whisper ASR", configured: true, ok: false, startingUp: isStartingUp("whisper"), latencyMs: null, url: maskUrl(base), error, tokenMissing, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
  } finally {
    clearTimeout(timer);
  }
}
