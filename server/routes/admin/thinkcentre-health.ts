/**
 * ThinkCentre Health — Admin
 *
 * GET /api/admin/thinkcentre-health
 * Probe parallelo dei servizi self-hosted che girano sul server di casa
 * (ThinkCentre): GraphHopper (routing), Ollama (AI), Whisper (ASR) e
 * Nominatim (geocoding). Ritorna stato/latenza/URL mascherato per ognuno,
 * così l'admin vede in un colpo solo la salute del server di casa.
 *
 * URL mostrati solo come protocollo+host; i token mai esposti (solo booleano).
 * Ogni probe ha timeout breve (5 s) per non rallentare il caricamento admin.
 */

import { Router, type Request, type Response } from "express";
import { getNominatimHealthSnapshot } from "../../lib/nominatim-client";
import { ACTIVE_PROFILE } from "../../graphhopper-client";

const router = Router();

const PROBE_TIMEOUT_MS = 5_000;

type ServiceKey = "graphhopper" | "valhalla" | "ollama" | "whisper" | "nominatim";

interface ServiceHealth {
  key: ServiceKey;
  label: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  /** Versione del tileset Valhalla (versione engine + data tile), se disponibile. */
  tileVersion?: string;
}

/** Maschera un URL mostrando solo protocollo + hostname (mai path/query/credenziali). */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return "[url-non-valido]";
  }
}

/** Rimuove URL completi e tutti i token noti dal messaggio di errore. */
function sanitizeError(msg: string): string {
  let out = msg.replace(/https?:\/\/[^\s"'`)]+/gi, (m) => maskUrl(m));
  for (const tok of [
    process.env.OLLAMA_TOKEN,
    process.env.WHISPER_TOKEN,
    process.env.GRAPHHOPPER_TOKEN,
    process.env.NOMINATIM_TOKEN,
    process.env.VALHALLA_API_KEY,
  ]) {
    if (tok) out = out.split(tok).join("***");
  }
  out = out.replace(/(bearer)\s+\S+/gi, "$1 ***");
  out = out.replace(/(x-[a-z-]*token|authorization|api[-_]?key)\s*[:=]\s*\S+/gi, "$1: ***");
  return out.slice(0, 200);
}

/**
 * Probe HTTP generico: GET su `url` con header opzionali e timeout breve.
 * Errori di rete/timeout → ok=false, nessuna latenza (servizio irraggiungibile).
 *
 * La sanità della risposta è decisa dal predicato `isHealthy(status)`:
 *   - default: solo 2xx è sano (per endpoint con health-check dedicato e affidabile).
 *   - per servizi senza endpoint di health dedicato (es. Whisper) usiamo
 *     `status < 500`: un 404/405 significa "server su, path/verbo diverso" (sano),
 *     mentre un 5xx (tipico di nginx/tunnel con backend giù) significa offline.
 */
async function httpProbe(
  url: string,
  headers: Record<string, string>,
  isHealthy: (status: number) => boolean = (status) => status >= 200 && status < 300,
): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (isHealthy(res.status)) return { ok: true, latencyMs };
    return { ok: false, latencyMs, error: `HTTP ${res.status}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: null, error: sanitizeError(msg) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe di routing reale: POST /route minimale (Milano→Como).
 * È la prova del nove quando /health non è esposto dal deploy self-hosted ma il
 * motore instrada regolarmente: 2xx = GraphHopper su e funzionante.
 */
async function graphHopperRouteProbe(
  base: string,
  token: string | undefined,
): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-GH-Token"] = token;
  try {
    const res = await fetch(`${base}/route`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        points: [[9.19, 45.46], [9.08, 45.81]],
        profile: ACTIVE_PROFILE,
        points_encoded: true,
        instructions: false,
        calc_points: false,
      }),
    });
    const latencyMs = Date.now() - t0;
    if (res.status >= 200 && res.status < 300) return { ok: true, latencyMs };
    return { ok: false, latencyMs, error: `HTTP ${res.status}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: null, error: sanitizeError(msg) };
  } finally {
    clearTimeout(timer);
  }
}

async function probeGraphHopper(): Promise<ServiceHealth> {
  const base = process.env.GRAPHHOPPER_URL?.replace(/\/$/, "");
  const token = process.env.GRAPHHOPPER_TOKEN;
  if (!base) {
    return { key: "graphhopper", label: "GraphHopper", configured: false, ok: false, latencyMs: null, url: null };
  }
  const headers: Record<string, string> = {};
  if (token) headers["X-GH-Token"] = token;

  // 1) Tentativo veloce: endpoint /health dedicato.
  //    Accettiamo anche 401/403: significano che GraphHopper HA risposto
  //    (processo attivo) ma richiede autenticazione per questo endpoint.
  //    Solo errori di rete/timeout o 5xx indicano servizio irraggiungibile.
  const health = await httpProbe(
    `${base}/health`,
    headers,
    // 2xx = OK; 401/403 = GraphHopper risponde (auth richiesta ma processo attivo).
    // Gli altri 4xx (404, 429…) e i 5xx restano "non sano" → cade sul fallback /route.
    (status) => (status >= 200 && status < 300) || status === 401 || status === 403,
  );
  if (health.ok) {
    return { key: "graphhopper", label: "GraphHopper", configured: true, ok: true, latencyMs: health.latencyMs, url: maskUrl(base) };
  }

  // 2) Fallback: alcuni deploy dietro tunnel restituiscono 5xx su /health ma
  //    instradano /route correttamente. Una vera richiesta di routing conferma.
  const route = await graphHopperRouteProbe(base, token);
  return {
    key: "graphhopper",
    label: "GraphHopper",
    configured: true,
    ok: route.ok,
    latencyMs: route.latencyMs,
    url: maskUrl(base),
    error: route.ok ? undefined : (route.error ?? health.error),
  };
}

/**
 * Probe Valhalla via GET /status.
 * Oltre a ok/latency, estrae version + data del tileset per mostrare la
 * "tile version" inline nella card admin. Se VALHALLA_URL non è impostato,
 * la card mostra "Non configurato" senza errori.
 */
async function probeValhalla(): Promise<ServiceHealth> {
  const base = process.env.VALHALLA_URL?.replace(/\/$/, "");
  const apiKey = process.env.VALHALLA_API_KEY;
  if (!base) {
    return { key: "valhalla", label: "Valhalla", configured: false, ok: false, latencyMs: null, url: null };
  }
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-Valhalla-Key"] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/status`, { method: "GET", headers, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (res.status < 200 || res.status >= 300) {
      return { key: "valhalla", label: "Valhalla", configured: true, ok: false, latencyMs, url: maskUrl(base), error: `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as {
      version?: string;
      tileset_last_modified?: number;
    };
    const datePart = data.tileset_last_modified
      ? new Date(data.tileset_last_modified * 1000).toISOString().split("T")[0]
      : undefined;
    const tileVersion = [data.version, datePart].filter(Boolean).join(" · ") || undefined;
    return {
      key: "valhalla",
      label: "Valhalla",
      configured: true,
      ok: true,
      latencyMs,
      url: maskUrl(base),
      tileVersion,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { key: "valhalla", label: "Valhalla", configured: true, ok: false, latencyMs: null, url: maskUrl(base), error: sanitizeError(msg) };
  } finally {
    clearTimeout(timer);
  }
}

async function probeOllama(): Promise<ServiceHealth> {
  const base = process.env.OLLAMA_URL?.replace(/\/$/, "");
  const token = process.env.OLLAMA_TOKEN;
  if (!base) {
    return { key: "ollama", label: "Ollama AI", configured: false, ok: false, latencyMs: null, url: null };
  }
  const headers: Record<string, string> = {};
  if (token) headers["X-Ollama-Token"] = token;
  const r = await httpProbe(`${base}/api/tags`, headers);
  return { key: "ollama", label: "Ollama AI", configured: true, ok: r.ok, latencyMs: r.latencyMs, url: maskUrl(base), error: r.error };
}

async function probeWhisper(): Promise<ServiceHealth> {
  const base = process.env.WHISPER_URL?.replace(/\/$/, "");
  const token = process.env.WHISPER_TOKEN;
  if (!base) {
    return { key: "whisper", label: "Whisper ASR", configured: false, ok: false, latencyMs: null, url: null };
  }
  const headers: Record<string, string> = {};
  if (token) headers["X-Whisper-Token"] = token;
  // whisper.cpp non ha un endpoint di health: una risposta < 500 (anche 404/405)
  // significa "server raggiungibile"; solo un 5xx o errore di rete = offline.
  const r = await httpProbe(`${base}/`, headers, (status) => status < 500);
  return { key: "whisper", label: "Whisper ASR", configured: true, ok: r.ok, latencyMs: r.latencyMs, url: maskUrl(base), error: r.error };
}

async function probeNominatim(): Promise<ServiceHealth> {
  const snap = await getNominatimHealthSnapshot();
  return {
    key: "nominatim",
    label: "Nominatim",
    configured: snap.configured,
    ok: snap.ok,
    latencyMs: snap.latencyMs,
    url: snap.configured ? snap.url : null,
  };
}

router.get("/thinkcentre-health", async (_req: Request, res: Response) => {
  try {
    const services = await Promise.all([
      probeGraphHopper(),
      probeValhalla(),
      probeOllama(),
      probeWhisper(),
      probeNominatim(),
    ]);
    const configured = services.filter((s) => s.configured);
    const onlineCount = configured.filter((s) => s.ok).length;
    const overall: "green" | "yellow" | "red" | "idle" =
      configured.length === 0
        ? "idle"
        : onlineCount === configured.length
          ? "green"
          : onlineCount === 0
            ? "red"
            : "yellow";
    return res.json({ overall, onlineCount, configuredCount: configured.length, services, checkedAt: Date.now() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-health] errore:", msg);
    return res.status(500).json({ error: "Errore probe servizi ThinkCentre" });
  }
});

export default router;
