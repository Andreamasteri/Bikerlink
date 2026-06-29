/**
 * Utility condivise per i probe ThinkCentre.
 * Usate da thinkcentre-health.ts e thinkcentre-health-vn-probes.ts.
 */

import { storage } from "../../storage";

const PROBE_LOG_SNAPSHOT_KEY = "probe_log_snapshot";
const ERROR_HISTORY_SNAPSHOT_KEY = "error_history_snapshot";

export const PROBE_TIMEOUT_MS = 15_000;

export const ERROR_HISTORY_MAX = 20;
const errorHistory = new Map<string, Array<{ timestamp: number; error: string }>>();

function persistErrorHistoryAsync(): void {
  const snapshot: Record<string, Array<{ timestamp: number; error: string }>> = {};
  for (const [key, entries] of errorHistory) {
    snapshot[key] = entries;
  }
  storage.upsertAppSetting(ERROR_HISTORY_SNAPSHOT_KEY, undefined, snapshot).catch((err) => {
    console.warn("[error-history] persist failed:", err instanceof Error ? err.message : String(err));
  });
}

export function recordError(key: string, error: string): void {
  const prev = errorHistory.get(key) ?? [];
  const next = [{ timestamp: Date.now(), error }, ...prev].slice(0, ERROR_HISTORY_MAX);
  errorHistory.set(key, next);
  persistErrorHistoryAsync();
}

export function getHistory(key: string): Array<{ timestamp: number; error: string }> {
  return errorHistory.get(key) ?? [];
}

export async function hydrateErrorHistory(): Promise<void> {
  try {
    const setting = await storage.getAppSetting(ERROR_HISTORY_SNAPSHOT_KEY);
    if (!setting?.valueJson || typeof setting.valueJson !== "object") return;
    const snapshot = setting.valueJson as Record<string, unknown>;
    for (const [key, raw] of Object.entries(snapshot)) {
      if (!Array.isArray(raw)) continue;
      const entries = raw
        .filter(
          (e): e is { timestamp: number; error: string } =>
            e !== null &&
            typeof e === "object" &&
            typeof e.timestamp === "number" &&
            typeof e.error === "string",
        )
        .slice(0, ERROR_HISTORY_MAX);
      if (entries.length > 0) errorHistory.set(key, entries);
    }
    console.log("[error-history] hydrated", errorHistory.size, "service(s) from DB snapshot");
  } catch (err) {
    console.warn("[error-history] hydration failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

export const PROBE_LOG_MAX = 10;

export interface ProbeLogEntry {
  timestamp: number;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
}

const probeLogStore = new Map<string, ProbeLogEntry[]>();

function persistProbeLogAsync(): void {
  const snapshot: Record<string, ProbeLogEntry[]> = {};
  for (const [svc, entries] of probeLogStore) {
    snapshot[svc] = entries;
  }
  storage.upsertAppSetting(PROBE_LOG_SNAPSHOT_KEY, undefined, snapshot).catch((err) => {
    console.warn("[probe-log] persist failed:", err instanceof Error ? err.message : String(err));
  });
}

export function recordProbeLog(service: string, entry: ProbeLogEntry): void {
  const prev = probeLogStore.get(service) ?? [];
  const next = [entry, ...prev].slice(0, PROBE_LOG_MAX);
  probeLogStore.set(service, next);
  persistProbeLogAsync();
}

export function getProbeLog(service: string): ProbeLogEntry[] {
  return probeLogStore.get(service) ?? [];
}

export async function hydrateProbeLog(): Promise<void> {
  try {
    const setting = await storage.getAppSetting(PROBE_LOG_SNAPSHOT_KEY);
    if (!setting?.valueJson || typeof setting.valueJson !== "object") return;
    const snapshot = setting.valueJson as Record<string, unknown>;
    for (const [svc, raw] of Object.entries(snapshot)) {
      if (!Array.isArray(raw)) continue;
      const entries: ProbeLogEntry[] = raw
        .filter(
          (e): e is ProbeLogEntry =>
            e !== null &&
            typeof e === "object" &&
            typeof e.timestamp === "number" &&
            typeof e.ok === "boolean" &&
            (e.latencyMs === null || typeof e.latencyMs === "number") &&
            typeof e.detail === "string",
        )
        .slice(0, PROBE_LOG_MAX);
      if (entries.length > 0) probeLogStore.set(svc, entries);
    }
    console.log("[probe-log] hydrated", probeLogStore.size, "service(s) from DB snapshot");
  } catch (err) {
    console.warn("[probe-log] hydration failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
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
    process.env.DIAG_OLLAMA_TOKEN,
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

export function tokenFingerprint(token: string | undefined | null): string | null {
  if (!token) return null;
  const { createHash } = require("crypto");
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}

/**
 * Detects whether a service is likely in a cold-start / warm-up window.
 *
 * Returns true when ALL of the following hold:
 *  - The last `minFailures` probe entries are failures.
 *  - Every one of those failures looks like a timeout or network error
 *    (not an auth / HTTP-level error — those are real KO).
 *  - No successful probe exists within the last `windowMs` milliseconds.
 *
 * Used by the health endpoint to surface an amber "avvio in corso" badge
 * instead of the red KO during the cold-start window.
 */
export function isStartingUp(
  service: string,
  opts: { minFailures?: number; windowMs?: number } = {},
): boolean {
  const { minFailures = 3, windowMs = 5 * 60 * 1_000 } = opts;
  const log = getProbeLog(service);
  if (log.length < minFailures) return false;

  const recent = log.slice(0, minFailures);
  if (!recent.every((e) => !e.ok)) return false;

  const isTimeoutOrNetwork = (detail: string): boolean =>
    /timeout|network\s+error|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch\s+failed/i.test(detail);

  if (!recent.every((e) => isTimeoutOrNetwork(e.detail))) return false;

  const cutoff = Date.now() - windowMs;
  const hasRecentSuccess = log.some((e) => e.ok && e.timestamp > cutoff);
  return !hasRecentSuccess;
}
