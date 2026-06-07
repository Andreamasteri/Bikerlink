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

import { Router, type Request, type Response as ExpressResponse } from "express";
import { createHash } from "crypto";
import { getNominatimHealthSnapshot } from "../../lib/nominatim-client";
import { ACTIVE_PROFILE } from "../../graphhopper-client";

const router = Router();

const PROBE_TIMEOUT_MS = 5_000;

type ServiceKey = "graphhopper" | "valhalla" | "ollama" | "whisper" | "nominatim";

/** Un singolo evento KO registrato nello storico in-memory. */
interface ErrorEvent {
  timestamp: number;
  error: string;
}

/** Storico degli ultimi N eventi KO per servizio (in-memory, max 20). */
const ERROR_HISTORY_MAX = 20;
const errorHistory = new Map<ServiceKey, ErrorEvent[]>();

function recordError(key: ServiceKey, error: string): void {
  const prev = errorHistory.get(key) ?? [];
  const next = [{ timestamp: Date.now(), error }, ...prev].slice(0, ERROR_HISTORY_MAX);
  errorHistory.set(key, next);
}

function getHistory(key: ServiceKey): ErrorEvent[] {
  return errorHistory.get(key) ?? [];
}

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
  /** URL configurato ma token assente: diverso da 401 (token presente ma sbagliato). */
  tokenMissing?: boolean;
  /** Ultimi eventi KO registrati in memoria (max 20). */
  history: ErrorEvent[];
}

/** Prime 8 hex del SHA-256 del token — fingerprint sicuro senza esporre il valore. */
function tokenFingerprint(token: string | undefined | null): string | null {
  if (!token) return null;
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
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
  return out.slice(0, 400);
}

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/**
 * Legge il body testuale di una risposta HTTP con un timeout aggiuntivo.
 * Ritorna stringa vuota in caso di errore o body non disponibile.
 */
async function readBodySafe(res: FetchResponse, timeoutMs = 2_000): Promise<string> {
  try {
    return await Promise.race([
      res.text(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("body-timeout")), timeoutMs)),
    ]);
  } catch {
    return "";
  }
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
    const body = await readBodySafe(res);
    const bodySnippet = body.trim().slice(0, 400);
    const error = bodySnippet
      ? sanitizeError(`HTTP ${res.status} — ${bodySnippet}`)
      : `HTTP ${res.status}`;
    return { ok: false, latencyMs, error };
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
    const body = await readBodySafe(res);
    const bodySnippet = body.trim().slice(0, 400);
    const error = bodySnippet
      ? sanitizeError(`HTTP ${res.status} — ${bodySnippet}`)
      : `HTTP ${res.status}`;
    return { ok: false, latencyMs, error };
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
    return { key: "graphhopper", label: "GraphHopper", configured: false, ok: false, latencyMs: null, url: null, history: getHistory("graphhopper") };
  }
  const tokenMissing = !token || token.trim() === "";
  const headers: Record<string, string> = {};
  if (token) headers["X-GH-Token"] = token;

  const health = await httpProbe(
    `${base}/health`,
    headers,
    (status) => (status >= 200 && status < 300) || status === 401 || status === 403,
  );
  if (health.ok) {
    return { key: "graphhopper", label: "GraphHopper", configured: true, ok: true, latencyMs: health.latencyMs, url: maskUrl(base), tokenMissing, history: getHistory("graphhopper") };
  }

  const route = await graphHopperRouteProbe(base, token);
  if (!route.ok) {
    const finalError = route.error ?? health.error ?? "errore sconosciuto";
    console.error("[thinkcentre-probe] graphhopper KO", { status: finalError });
    recordError("graphhopper", finalError);
  }
  return {
    key: "graphhopper",
    label: "GraphHopper",
    configured: true,
    ok: route.ok,
    latencyMs: route.latencyMs,
    url: maskUrl(base),
    error: route.ok ? undefined : (route.error ?? health.error),
    tokenMissing,
    history: getHistory("graphhopper"),
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
    return { key: "valhalla", label: "Valhalla", configured: false, ok: false, latencyMs: null, url: null, history: getHistory("valhalla") };
  }
  const tokenMissing = !apiKey || apiKey.trim() === "";
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-Valhalla-Key"] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/status`, { method: "GET", headers, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (res.status < 200 || res.status >= 300) {
      const body = await readBodySafe(res);
      const bodySnippet = body.trim().slice(0, 400);
      const error = bodySnippet
        ? sanitizeError(`HTTP ${res.status} — ${bodySnippet}`)
        : `HTTP ${res.status}`;
      console.error("[thinkcentre-probe] valhalla KO", { status: res.status, error });
      recordError("valhalla", error);
      return { key: "valhalla", label: "Valhalla", configured: true, ok: false, latencyMs, url: maskUrl(base), error, tokenMissing, history: getHistory("valhalla") };
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
      tokenMissing,
      history: getHistory("valhalla"),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const error = sanitizeError(msg);
    recordError("valhalla", error);
    return { key: "valhalla", label: "Valhalla", configured: true, ok: false, latencyMs: null, url: maskUrl(base), error, tokenMissing, history: getHistory("valhalla") };
  } finally {
    clearTimeout(timer);
  }
}

async function probeOllama(): Promise<ServiceHealth> {
  const base = process.env.OLLAMA_URL?.replace(/\/$/, "");
  const token = process.env.OLLAMA_TOKEN;
  if (!base) {
    return { key: "ollama", label: "Ollama AI", configured: false, ok: false, latencyMs: null, url: null, history: getHistory("ollama") };
  }
  const tokenMissing = !token || token.trim() === "";
  const headers: Record<string, string> = {};
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
  }
  return { key: "ollama", label: "Ollama AI", configured: true, ok: r.ok, latencyMs: r.latencyMs, url: maskUrl(base), error, tokenMissing, history: getHistory("ollama") };
}

/**
 * Probe Whisper reale: POST /inference con WAV silenzioso minimo (0.5s, 16kHz mono).
 * OK solo se risponde 2xx — un semplice GET / non garantisce che /inference funzioni.
 * Timeout ridotto a 8s (< PROBE_TIMEOUT_MS globale di 5s non basterebbe per /inference).
 */
async function probeWhisper(): Promise<ServiceHealth> {
  const base = process.env.WHISPER_URL?.replace(/\/$/, "");
  const token = process.env.WHISPER_TOKEN;
  if (!base) {
    return { key: "whisper", label: "Whisper ASR", configured: false, ok: false, latencyMs: null, url: null, history: getHistory("whisper") };
  }
  const tokenMissing = !token || token.trim() === "";

  // WAV silenzioso minimale: 0.5s, mono 16kHz 16-bit PCM (stessa funzione di admin-whisper-config)
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * 0.5);
  const dataSize = numSamples * 2; // 16-bit mono
  const wav = Buffer.alloc(44 + dataSize, 0);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(dataSize, 40);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const t0 = Date.now();
  try {
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "probe.wav");
    formData.append("response_format", "json");
    const res = await fetch(`${base}/inference`, { method: "POST", headers, body: formData, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (res.status >= 200 && res.status < 300) {
      return { key: "whisper", label: "Whisper ASR", configured: true, ok: true, latencyMs, url: maskUrl(base), tokenMissing, history: getHistory("whisper") };
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
    return { key: "whisper", label: "Whisper ASR", configured: true, ok: false, latencyMs, url: maskUrl(base), error, tokenMissing, history: getHistory("whisper") };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const error = sanitizeError(msg);
    console.error("[thinkcentre-probe] whisper KO (rete/timeout)", { error });
    recordError("whisper", error);
    return { key: "whisper", label: "Whisper ASR", configured: true, ok: false, latencyMs: null, url: maskUrl(base), error, tokenMissing, history: getHistory("whisper") };
  } finally {
    clearTimeout(timer);
  }
}

async function probeNominatim(): Promise<ServiceHealth> {
  const snap = await getNominatimHealthSnapshot();
  const token = process.env.NOMINATIM_TOKEN;
  const tokenMissing = snap.configured && (!token || token.trim() === "");
  if (!snap.ok && snap.configured) {
    console.error("[thinkcentre-probe] nominatim KO", { error: snap.error ?? "nessun dettaglio" });
    if (snap.error) recordError("nominatim", snap.error);
  }
  return {
    key: "nominatim",
    label: "Nominatim",
    configured: snap.configured,
    ok: snap.ok,
    latencyMs: snap.latencyMs,
    url: snap.configured ? snap.url : null,
    error: snap.error,
    tokenMissing,
    history: getHistory("nominatim"),
  };
}

router.get("/thinkcentre-health", async (_req: Request, res: ExpressResponse) => {
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

    const tokenFingerprints = {
      graphhopper: tokenFingerprint(process.env.GRAPHHOPPER_TOKEN),
      valhalla:    tokenFingerprint(process.env.VALHALLA_API_KEY),
      ollama:      tokenFingerprint(process.env.OLLAMA_TOKEN),
      whisper:     tokenFingerprint(process.env.WHISPER_TOKEN),
      nominatim:   tokenFingerprint(process.env.NOMINATIM_TOKEN),
    };

    return res.json({ overall, onlineCount, configuredCount: configured.length, services, tokenFingerprints, checkedAt: Date.now() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-health] errore:", msg);
    return res.status(500).json({ error: "Errore probe servizi ThinkCentre" });
  }
});

export default router;
