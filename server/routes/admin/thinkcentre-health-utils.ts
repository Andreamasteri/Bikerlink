/**
 * Utility condivise per i probe ThinkCentre.
 * Usate da thinkcentre-health.ts e thinkcentre-health-vn-probes.ts.
 */

export const PROBE_TIMEOUT_MS = 5_000;

export const ERROR_HISTORY_MAX = 20;
const errorHistory = new Map<string, Array<{ timestamp: number; error: string }>>();

export function recordError(key: string, error: string): void {
  const prev = errorHistory.get(key) ?? [];
  const next = [{ timestamp: Date.now(), error }, ...prev].slice(0, ERROR_HISTORY_MAX);
  errorHistory.set(key, next);
}

export function getHistory(key: string): Array<{ timestamp: number; error: string }> {
  return errorHistory.get(key) ?? [];
}

export const PROBE_LOG_MAX = 10;

export interface ProbeLogEntry {
  timestamp: number;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
}

const probeLogStore = new Map<string, ProbeLogEntry[]>();

export function recordProbeLog(service: string, entry: ProbeLogEntry): void {
  const prev = probeLogStore.get(service) ?? [];
  const next = [entry, ...prev].slice(0, PROBE_LOG_MAX);
  probeLogStore.set(service, next);
}

export function getProbeLog(service: string): ProbeLogEntry[] {
  return probeLogStore.get(service) ?? [];
}

export type FetchResponse = Awaited<ReturnType<typeof fetch>>;

export async function readBodySafe(res: FetchResponse, timeoutMs = 2_000): Promise<string> {
  try {
    return await Promise.race([
      res.text(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("body-timeout")), timeoutMs)),
    ]);
  } catch {
    return "";
  }
}

export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return "[url-non-valido]";
  }
}

export function sanitizeError(msg: string): string {
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

export async function httpProbe(
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

export function tokenFingerprint(token: string | undefined | null): string | null {
  if (!token) return null;
  const { createHash } = require("crypto");
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}
