/**
 * Probe Valhalla, Photon e ufw — estratti da thinkcentre-health.ts
 * Importati da thinkcentre-health.ts per mantenere il file sotto 600 righe.
 */

import { cfAccessHeaders } from "../../lib/cf-access";
import { PROBE_TIMEOUT_MS, readBodySafe, sanitizeError, maskUrl, recordError, getHistory, recordProbeLog, getProbeLog, type ProbeLogEntry } from "./thinkcentre-health-utils";

export type { ProbeLogEntry };

export interface ValhallaDetailedHealth {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  tileVersion?: string;
  activeProfiles: string[];
  tokenMissing?: boolean;
  history: Array<{ timestamp: number; error: string }>;
  probeLog: ProbeLogEntry[];
}

export interface PhotonDetailedHealth {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  tokenMissing?: boolean;
  history: Array<{ timestamp: number; error: string }>;
  probeLog: ProbeLogEntry[];
}

export interface UfwDetailedHealth {
  configured: boolean;
  ok: boolean;
  status: "active" | "inactive" | "error" | "unreachable";
  latencyMs: number | null;
  url: string | null;
  ruleCount?: number;
  error?: string;
  history: Array<{ timestamp: number; error: string }>;
  probeLog: ProbeLogEntry[];
}

export async function probeUfwDetailed(): Promise<UfwDetailedHealth> {
  const base = process.env.UFW_STATUS_URL?.replace(/\/$/, "");
  if (!base) {
    return {
      configured: false,
      ok: false,
      status: "unreachable",
      latencyMs: null,
      url: null,
      history: getHistory("ufw"),
      probeLog: getProbeLog("ufw"),
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(base, { method: "GET", signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const body = await readBodySafe(res);
      const error = sanitizeError(`HTTP ${res.status}${body.trim() ? ` — ${body.trim().slice(0, 200)}` : ""}`);
      console.error("[thinkcentre-probe] ufw KO", { status: res.status, error });
      recordError("ufw", error);
      recordProbeLog("ufw", { timestamp: Date.now(), ok: false, latencyMs, detail: error });
      return {
        configured: true,
        ok: false,
        status: "error",
        latencyMs,
        url: maskUrl(base),
        error,
        history: getHistory("ufw"),
        probeLog: getProbeLog("ufw"),
      };
    }
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      ruleCount?: number;
      detail?: string;
    };
    const ufwStatus = data.status === "active" ? "active" : data.status === "inactive" ? "inactive" : "error";
    const ok = ufwStatus === "active";
    const detail = `ufw ${ufwStatus}${data.ruleCount != null ? ` · ${data.ruleCount} regole` : ""}`;
    if (!ok) {
      const err = `ufw ${ufwStatus}${data.detail ? `: ${data.detail}` : ""}`;
      recordError("ufw", err);
      recordProbeLog("ufw", { timestamp: Date.now(), ok: false, latencyMs, detail: err });
      return {
        configured: true,
        ok: false,
        status: ufwStatus,
        latencyMs,
        url: maskUrl(base),
        ruleCount: data.ruleCount,
        error: err,
        history: getHistory("ufw"),
        probeLog: getProbeLog("ufw"),
      };
    }
    recordProbeLog("ufw", { timestamp: Date.now(), ok: true, latencyMs, detail });
    return {
      configured: true,
      ok: true,
      status: "active",
      latencyMs,
      url: maskUrl(base),
      ruleCount: data.ruleCount,
      history: getHistory("ufw"),
      probeLog: getProbeLog("ufw"),
    };
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
    const error = sanitizeError(classified);
    console.error("[thinkcentre-probe] ufw KO (rete/timeout)", { error });
    recordError("ufw", error);
    recordProbeLog("ufw", { timestamp: Date.now(), ok: false, latencyMs: null, detail: error });
    return {
      configured: true,
      ok: false,
      status: "unreachable",
      latencyMs: null,
      url: maskUrl(base),
      error,
      history: getHistory("ufw"),
      probeLog: getProbeLog("ufw"),
    };
  } finally {
    clearTimeout(timer);
  }
}

const KNOWN_VALHALLA_COSTING = ["motorcycle", "auto", "bicycle", "pedestrian"] as const;

export async function probeValhallaProfiles(
  base: string,
  apiKey: string | undefined,
): Promise<string[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...cfAccessHeaders() };
  if (apiKey) headers["X-Valhalla-Key"] = apiKey;

  const results = await Promise.all(
    KNOWN_VALHALLA_COSTING.map(async (costing) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const res = await fetch(`${base}/route`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            locations: [{ lon: 9.19, lat: 45.46 }, { lon: 9.08, lat: 45.81 }],
            costing,
            directions_options: { units: "km" },
          }),
          signal: controller.signal,
        });
        return res.status >= 200 && res.status < 300 ? costing : null;
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
        console.error(`[thinkcentre-probe] valhalla profile ${costing} KO`, { error: sanitizeError(classified) });
        return null;
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return results.filter((r): r is (typeof KNOWN_VALHALLA_COSTING)[number] => r !== null);
}

export async function probeValhallaDetailed(): Promise<ValhallaDetailedHealth> {
  const base = process.env.VALHALLA_URL?.replace(/\/$/, "");
  const apiKey = process.env.VALHALLA_API_KEY;
  if (!base) {
    return { configured: false, ok: false, latencyMs: null, url: null, activeProfiles: [], history: getHistory("valhalla"), probeLog: getProbeLog("valhalla") };
  }
  const tokenMissing = !apiKey || apiKey.trim() === "";
  const headers: Record<string, string> = { ...cfAccessHeaders() };
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
      recordProbeLog("valhalla", { timestamp: Date.now(), ok: false, latencyMs, detail: error });
      return { configured: true, ok: false, latencyMs, url: maskUrl(base), error, tokenMissing, activeProfiles: [], history: getHistory("valhalla"), probeLog: getProbeLog("valhalla") };
    }
    const data = (await res.json().catch(() => ({}))) as {
      version?: string;
      tileset_last_modified?: number;
    };
    const datePart = data.tileset_last_modified
      ? new Date(data.tileset_last_modified * 1000).toISOString().split("T")[0]
      : undefined;
    const tileVersion = [data.version, datePart].filter(Boolean).join(" · ") || undefined;
    const activeProfiles = await probeValhallaProfiles(base, apiKey);
    const detail = activeProfiles.length > 0
      ? `${activeProfiles.length} profil${activeProfiles.length === 1 ? "o" : "i"}: ${activeProfiles.join(", ")}`
      : "OK (nessun profilo)";
    recordProbeLog("valhalla", { timestamp: Date.now(), ok: true, latencyMs, detail });
    return { configured: true, ok: true, latencyMs, url: maskUrl(base), tileVersion, tokenMissing, activeProfiles, history: getHistory("valhalla"), probeLog: getProbeLog("valhalla") };
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
    const error = sanitizeError(classified);
    console.error("[thinkcentre-probe] valhalla KO (rete/timeout)", { error });
    recordError("valhalla", error);
    recordProbeLog("valhalla", { timestamp: Date.now(), ok: false, latencyMs: null, detail: error });
    return { configured: true, ok: false, latencyMs: null, url: maskUrl(base), error, tokenMissing, activeProfiles: [], history: getHistory("valhalla"), probeLog: getProbeLog("valhalla") };
  } finally {
    clearTimeout(timer);
  }
}

export async function probePhotonDetailed(): Promise<PhotonDetailedHealth> {
  const base = process.env.PHOTON_URL?.trim().replace(/\/$/, "") || null;
  const configured = Boolean(base);
  const token = process.env.PHOTON_TOKEN;
  const tokenMissing = configured && (!token || token.trim() === "");

  // Nessun fallback pubblico: se PHOTON_URL non è impostata, il geocoder è
  // "non configurato" (nessun probe di rete).
  if (!base) {
    return { configured: false, ok: false, latencyMs: null, url: null, tokenMissing: false, history: getHistory("photon"), probeLog: getProbeLog("photon") };
  }

  const maskedUrl = maskUrl(base);
  // Photon non espone /status: una query di geocoding minima ("Roma") misura
  // disponibilità e latenza reali del motore.
  const probeUrl = `${base}/api/?q=Roma&limit=1&lang=default`;

  const headers: Record<string, string> = { "User-Agent": "BikerLink/4.0 (info@bikerlink.it)", ...cfAccessHeaders() };
  if (token) headers["X-Photon-Token"] = token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(probeUrl, { headers, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const body = await readBodySafe(res);
      const bodySnippet = body.trim().slice(0, 400);
      const error = bodySnippet
        ? sanitizeError(`HTTP ${res.status} — ${bodySnippet}`)
        : `HTTP ${res.status}`;
      console.error("[thinkcentre-probe] photon KO", { status: res.status, error });
      recordError("photon", error);
      recordProbeLog("photon", { timestamp: Date.now(), ok: false, latencyMs, detail: error });
      return { configured, ok: false, latencyMs, url: maskedUrl, error, tokenMissing, history: getHistory("photon"), probeLog: getProbeLog("photon") };
    }
    recordProbeLog("photon", { timestamp: Date.now(), ok: true, latencyMs, detail: `geocode ${latencyMs} ms` });
    return { configured, ok: true, latencyMs, url: maskedUrl, tokenMissing, history: getHistory("photon"), probeLog: getProbeLog("photon") };
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
    const error = sanitizeError(classified);
    console.error("[thinkcentre-probe] photon KO (rete/timeout)", { error });
    recordError("photon", error);
    recordProbeLog("photon", { timestamp: Date.now(), ok: false, latencyMs: null, detail: error });
    return { configured, ok: false, latencyMs: null, url: maskedUrl, error, tokenMissing, history: getHistory("photon"), probeLog: getProbeLog("photon") };
  } finally {
    clearTimeout(timer);
  }
}
