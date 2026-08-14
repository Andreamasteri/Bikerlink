/**
 * ThinkCentre — GraphHopper e Ollama probes.
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
  /**
   * true quando un 401/403 arriva da Cloudflare Access (blocco a monte
   * dell'origine: Service Token CF assente/sbagliato) e NON dal token
   * applicativo del servizio. Permette al pannello di distinguere un problema
   * di autenticazione CF Access da un token di servizio errato.
   */
  cfAccessBlocked?: boolean;
  /**
   * Task #165 — solo per key="ollama": nomi dei modelli presenti su Ollama
   * (da /api/tags, `models[].name`). [] se il parse fallisce; assente per gli
   * altri servizi.
   */
  availableModels?: string[];
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

export async function graphHopperRouteProbe(
  base: string,
  token: string | undefined,
  points: [number, number][] = [[9.19, 45.46], [9.08, 45.81]],
): Promise<{ ok: boolean; latencyMs: number | null; status?: number; error?: string; warn?: string }> {
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
    if (res.status >= 200 && res.status < 300) return { ok: true, latencyMs, status: res.status };
    const body = await readBodySafe(res);
    const bodySnippet = body.trim().slice(0, 400);
    // HTTP 400 + PointNotFoundException → il motore è vivo ma il punto di probe
    // è fuori dalla rete stradale (es. bbox-center finisce in mare o su un monte).
    // Non è un guasto del motore: classificare come "alive, probe off-road".
    if (res.status === 400 && /PointNotFoundException/i.test(body)) {
      return { ok: true, latencyMs, status: 400, warn: "probe-point-off-road" };
    }
    let error: string;
    if (res.status === 401 || res.status === 403) {
      error = ghAuthMismatchError(res.status, !token || token.trim() === "", bodySnippet);
    } else {
      error = bodySnippet
        ? sanitizeError(`HTTP ${res.status} — ${bodySnippet}`)
        : `HTTP ${res.status}`;
    }
    return { ok: false, latencyMs, status: res.status, error };
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

/**
 * Punti di probe noti-routable per area (lon, lat su strada principale).
 * Usati al posto del centro del bbox, che può finire in mare o su terreno
 * non mappato per aree costiere/insulari (es. Grecia, Ecuador).
 * Formato: [lon, lat] — due punti distinti nello stesso centro urbano.
 */
export const AREA_PROBE_POINTS: Partial<Record<string, [[number, number], [number, number]]>> = {
  "grecia":          [[23.73, 37.98], [23.82, 37.97]],  // Atene, ring-road
  "balcani":         [[15.97, 45.81], [16.05, 45.83]],  // Zagabria, A1
  "est":             [[26.10, 44.43], [26.20, 44.42]],  // Bucarest, DN1
  "iberia":          [[-3.70, 40.42], [-3.65, 40.44]],  // Madrid, M-30
  "arco-alpino":     [[9.19, 45.46],  [9.08, 45.52]],   // Milano, tangenziale
  "germania-centro": [[8.68, 50.11],  [8.77, 50.15]],   // Francoforte, A5
  "francia-benelux": [[4.83, 45.76],  [4.90, 45.78]],   // Lione, A6
  "ecuador":         [[-78.47, -0.18], [-78.38, -0.19]], // Quito, Av. Simón Bolívar
};

export function areaProbePoints(area: RoutingArea): [number, number][] {
  const hardcoded = AREA_PROBE_POINTS[area.codice];
  if (hardcoded) return hardcoded;
  // Fallback: centro del bbox con offset del 10% (funziona per aree terrestri pianeggianti)
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

/**
 * Contatore di fallimenti consecutivi per area (chiave = area.codice).
 * In-process, non persistito. Si azzera al riavvio del server — comportamento
 * corretto: un riavvio significa fresh probe state.
 * Il badge GH diventa yellow solo quando consecutiveFailures >= 2 per un'area.
 */
const consecutiveFailures = new Map<string, number>();

/**
 * Solo per i test: azzera i contatori di fallimento consecutivo.
 * Non usare in produzione.
 */
export function resetConsecutiveFailuresForTests(): void {
  consecutiveFailures.clear();
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
    // Successo dalla /health: azzera il contatore di fallimenti consecutivi.
    consecutiveFailures.delete(area.codice);
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

  if (route.ok) {
    // Successo (include il caso warn="probe-point-off-road": motore vivo, punto fuori strada).
    consecutiveFailures.delete(area.codice);
    if (route.warn === "probe-point-off-road") {
      console.warn(`[thinkcentre-probe] graphhopper ${area.codice} — punto di probe fuori strada (PointNotFoundException), motore OK`);
      recordProbeLog(historyKey, { timestamp: Date.now(), ok: true, latencyMs: route.latencyMs, detail: "route OK (probe point off-road, engine alive)" });
    } else {
      recordProbeLog(historyKey, { timestamp: Date.now(), ok: true, latencyMs: route.latencyMs, detail: "route OK" });
    }
    return {
      ...baseShape,
      enabled: true,
      ok: true,
      startingUp: false,
      latencyMs: route.latencyMs,
      history: getHistory(historyKey),
      probeLog: getProbeLog(historyKey),
    };
  }

  // Fallimento genuino: incrementa il contatore di fallimenti consecutivi.
  const failures = (consecutiveFailures.get(area.codice) ?? 0) + 1;
  consecutiveFailures.set(area.codice, failures);

  const finalError = route.error ?? health.error ?? "errore sconosciuto";

  if (failures < 2) {
    // Primo fallimento: badge rimane verde (isteresi), ma logga come WARN.
    // Il probeLog registra il fallimento così l'admin può vederlo nei dettagli.
    console.warn(`[thinkcentre-probe] graphhopper ${area.codice} — primo fallimento (${failures}/2), badge invariato`, { error: finalError });
    recordProbeLog(historyKey, { timestamp: Date.now(), ok: false, latencyMs: route.latencyMs, detail: `[warn, fallimento ${failures}/2] ${finalError}` });
    return {
      ...baseShape,
      enabled: true,
      ok: true,           // Badge verde: 1 solo fallimento non basta
      startingUp: false,
      latencyMs: route.latencyMs,
      history: getHistory(historyKey),
      probeLog: getProbeLog(historyKey),
    };
  }

  // ≥ 2 fallimenti consecutivi: badge giallo.
  console.error(`[thinkcentre-probe] graphhopper ${area.codice} KO (${failures} fallimenti consecutivi)`, { error: finalError });
  recordError(historyKey, finalError);
  recordProbeLog(historyKey, { timestamp: Date.now(), ok: false, latencyMs: route.latencyMs, detail: finalError });
  return {
    ...baseShape,
    enabled: true,
    ok: false,
    startingUp: isStartingUp(historyKey),
    latencyMs: route.latencyMs,
    error: finalError,
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
  const r = await httpProbe(`${base}/api/tags`, headers, undefined, true);
  // Task #165 — riusa la risposta /api/tags già in memoria per estrarre i nomi
  // dei modelli disponibili (cross-reference con i modelli per-persona).
  let availableModels: string[] = [];
  if (r.ok && r.bodyText) {
    try {
      const parsed = JSON.parse(r.bodyText) as { models?: Array<{ name?: unknown }> };
      availableModels = (parsed.models ?? [])
        .map((m) => (typeof m?.name === "string" ? m.name : null))
        .filter((n): n is string => !!n);
    } catch {
      availableModels = [];
    }
  }
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
  return { key: "ollama", label: "Ollama AI", configured: true, ok: r.ok, startingUp: r.ok ? false : isStartingUp("ollama"), latencyMs: r.latencyMs, url: maskUrl(base), error, tokenMissing, availableModels, history: getHistory("ollama"), probeLog: getProbeLog("ollama") };
}
