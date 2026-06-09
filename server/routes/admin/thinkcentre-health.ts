/**
 * ThinkCentre Health — Admin
 *
 * GET /api/admin/thinkcentre-health
 * Probe parallelo dei servizi self-hosted sul ThinkCentre:
 * GraphHopper (routing), Ollama (AI), Whisper (ASR), Nominatim (geocoding),
 * Valhalla (routing), Redis (cache), PostgreSQL (DB), pgAdmin, nginx, Uptime Kuma.
 */

import { Router, type Request, type Response as ExpressResponse } from "express";
import { getNominatimHealthSnapshot } from "../../lib/nominatim-client";
import { ACTIVE_PROFILE } from "../../graphhopper-client";
import { getAreaEnabledMap } from "../../routing/routing-area-state";
import {
  ROUTING_AREAS,
  type RoutingArea,
  type RoutingAreaCode,
  type RoutingAreaTier,
} from "@shared/routing-areas";
import { db } from "../../db";
import { thinkcentreHealthEvents } from "@shared/db";
import { desc } from "drizzle-orm";
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
  type ProbeLogEntry,
  tokenFingerprint,
} from "./thinkcentre-health-utils";
import {
  probeValhallaDetailed,
  probeNominatimDetailed,
  probeUfwDetailed,
  type ValhallaDetailedHealth,
  type NominatimDetailedHealth,
  type UfwDetailedHealth,
} from "./thinkcentre-health-vn-probes";
import {
  probeRedisInfra,
  probePostgresInfra,
  probePgAdmin,
  probeNginxInfra,
  probeUptimeKuma,
} from "./thinkcentre-health-infra-probes";

const router = Router();

type ServiceKey =
  | "graphhopper"
  | "valhalla"
  | "ollama"
  | "whisper"
  | "nominatim"
  | "ufw"
  | "redis"
  | "postgres"
  | "pgadmin"
  | "nginx"
  | "uptimekuma";

interface ErrorEvent {
  timestamp: number;
  error: string;
}

interface ServiceHealth {
  key: ServiceKey;
  label: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  tileVersion?: string;
  tokenMissing?: boolean;
  history: ErrorEvent[];
  probeLog: ProbeLogEntry[];
}

interface AreaServiceHealth {
  code: RoutingAreaCode;
  nome: string;
  tier: RoutingAreaTier;
  enabled: boolean;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
  history: ErrorEvent[];
  probeLog: ProbeLogEntry[];
}

async function graphHopperRouteProbe(
  base: string,
  token: string | undefined,
  points: [number, number][] = [[9.19, 45.46], [9.08, 45.81]],
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
    return { ...baseShape, enabled: false, ok: false, latencyMs: null };
  }
  const areaBase = `${base}${area.path}`;
  const headers: Record<string, string> = {};
  if (token) headers["X-GH-Token"] = token;
  const health = await httpProbe(
    `${areaBase}/health`,
    headers,
    (status) => (status >= 200 && status < 300) || status === 401 || status === 403,
  );
  if (health.ok) {
    recordProbeLog(historyKey, { timestamp: Date.now(), ok: true, latencyMs: health.latencyMs, detail: "health OK" });
    return { ...baseShape, enabled: true, ok: true, latencyMs: health.latencyMs, history: getHistory(historyKey), probeLog: getProbeLog(historyKey) };
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
    latencyMs: route.latencyMs,
    error: route.ok ? undefined : (route.error ?? health.error),
    history: getHistory(historyKey),
    probeLog: getProbeLog(historyKey),
  };
}

interface GraphHopperHealth {
  configured: boolean;
  url: string | null;
  tokenMissing: boolean;
  ok: boolean;
  areas: AreaServiceHealth[];
}

async function probeGraphHopperAreas(): Promise<GraphHopperHealth> {
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

async function probeOllama(): Promise<ServiceHealth> {
  const base = process.env.OLLAMA_URL?.replace(/\/$/, "");
  const token = process.env.OLLAMA_TOKEN;
  if (!base) {
    return { key: "ollama", label: "Ollama AI", configured: false, ok: false, latencyMs: null, url: null, history: getHistory("ollama"), probeLog: getProbeLog("ollama") };
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
    recordProbeLog("ollama", { timestamp: Date.now(), ok: false, latencyMs: r.latencyMs, detail: error ?? "errore sconosciuto" });
  } else {
    recordProbeLog("ollama", { timestamp: Date.now(), ok: true, latencyMs: r.latencyMs, detail: "tags OK" });
  }
  return { key: "ollama", label: "Ollama AI", configured: true, ok: r.ok, latencyMs: r.latencyMs, url: maskUrl(base), error, tokenMissing, history: getHistory("ollama"), probeLog: getProbeLog("ollama") };
}

async function probeWhisper(): Promise<ServiceHealth> {
  const base = process.env.WHISPER_URL?.replace(/\/$/, "");
  const token = process.env.WHISPER_TOKEN;
  if (!base) {
    return { key: "whisper", label: "Whisper ASR", configured: false, ok: false, latencyMs: null, url: null, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
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
      recordProbeLog("whisper", { timestamp: Date.now(), ok: true, latencyMs, detail: "inference OK" });
      return { key: "whisper", label: "Whisper ASR", configured: true, ok: true, latencyMs, url: maskUrl(base), tokenMissing, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
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
    return { key: "whisper", label: "Whisper ASR", configured: true, ok: false, latencyMs, url: maskUrl(base), error, tokenMissing, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const error = sanitizeError(msg);
    console.error("[thinkcentre-probe] whisper KO (rete/timeout)", { error });
    recordError("whisper", error);
    recordProbeLog("whisper", { timestamp: Date.now(), ok: false, latencyMs: null, detail: error });
    return { key: "whisper", label: "Whisper ASR", configured: true, ok: false, latencyMs: null, url: maskUrl(base), error, tokenMissing, history: getHistory("whisper"), probeLog: getProbeLog("whisper") };
  } finally {
    clearTimeout(timer);
  }
}

router.get("/thinkcentre-events", async (_req: Request, res: ExpressResponse) => {
  try {
    const limit = 20;
    const events = await db
      .select()
      .from(thinkcentreHealthEvents)
      .orderBy(desc(thinkcentreHealthEvents.occurredAt))
      .limit(limit);
    return res.json({ events });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-events] errore:", msg);
    return res.status(500).json({ error: "Errore recupero eventi ThinkCentre" });
  }
});

router.get("/thinkcentre-health", async (_req: Request, res: ExpressResponse) => {
  try {
    const [
      graphhopper,
      valhallaDetail,
      nominatimDetail,
      ollama,
      whisper,
      ufwDetail,
      redisInfra,
      postgresInfra,
      pgadminInfra,
      nginxInfra,
      uptimeKumaInfra,
    ] = await Promise.all([
      probeGraphHopperAreas(),
      probeValhallaDetailed(),
      probeNominatimDetailed(),
      probeOllama(),
      probeWhisper(),
      probeUfwDetailed(),
      probeRedisInfra(),
      probePostgresInfra(),
      probePgAdmin(),
      probeNginxInfra(),
      probeUptimeKuma(),
    ]);

    const valhallaService: ServiceHealth = {
      key: "valhalla",
      label: "Valhalla",
      configured: valhallaDetail.configured,
      ok: valhallaDetail.ok,
      latencyMs: valhallaDetail.latencyMs,
      url: valhallaDetail.url,
      error: valhallaDetail.error,
      tileVersion: valhallaDetail.tileVersion,
      tokenMissing: valhallaDetail.tokenMissing,
      history: valhallaDetail.history,
      probeLog: valhallaDetail.probeLog,
    };
    const nominatimService: ServiceHealth = {
      key: "nominatim",
      label: "Nominatim",
      configured: nominatimDetail.configured,
      ok: nominatimDetail.ok,
      latencyMs: nominatimDetail.latencyMs,
      url: nominatimDetail.url,
      error: nominatimDetail.error,
      tokenMissing: nominatimDetail.tokenMissing,
      history: nominatimDetail.history,
      probeLog: nominatimDetail.probeLog,
    };

    const redisService: ServiceHealth = {
      key: "redis",
      label: "Redis",
      configured: redisInfra.configured,
      ok: redisInfra.ok,
      latencyMs: redisInfra.latencyMs,
      url: redisInfra.url,
      error: redisInfra.error,
      history: redisInfra.history,
      probeLog: redisInfra.probeLog,
    };
    const postgresService: ServiceHealth = {
      key: "postgres",
      label: "PostgreSQL",
      configured: postgresInfra.configured,
      ok: postgresInfra.ok,
      latencyMs: postgresInfra.latencyMs,
      url: postgresInfra.url,
      error: postgresInfra.error,
      history: postgresInfra.history,
      probeLog: postgresInfra.probeLog,
    };
    const pgadminService: ServiceHealth = {
      key: "pgadmin",
      label: "pgAdmin",
      configured: pgadminInfra.configured,
      ok: pgadminInfra.ok,
      latencyMs: pgadminInfra.latencyMs,
      url: pgadminInfra.url,
      error: pgadminInfra.error,
      history: pgadminInfra.history,
      probeLog: pgadminInfra.probeLog,
    };
    const nginxService: ServiceHealth = {
      key: "nginx",
      label: "nginx",
      configured: nginxInfra.configured,
      ok: nginxInfra.ok,
      latencyMs: nginxInfra.latencyMs,
      url: nginxInfra.url,
      error: nginxInfra.error,
      history: nginxInfra.history,
      probeLog: nginxInfra.probeLog,
    };
    const uptimeKumaService: ServiceHealth = {
      key: "uptimekuma",
      label: "Uptime Kuma",
      configured: uptimeKumaInfra.configured,
      ok: uptimeKumaInfra.ok,
      latencyMs: uptimeKumaInfra.latencyMs,
      url: uptimeKumaInfra.url,
      error: uptimeKumaInfra.error,
      history: uptimeKumaInfra.history,
      probeLog: uptimeKumaInfra.probeLog,
    };

    const services: ServiceHealth[] = [
      valhallaService,
      ollama,
      whisper,
      nominatimService,
      redisService,
      postgresService,
      pgadminService,
      nginxService,
      uptimeKumaService,
    ];

    const graphhopperContributes = graphhopper.configured && graphhopper.areas.some((a) => a.enabled);
    const configuredServices = services.filter((s) => s.configured);
    const configuredCount = configuredServices.length + (graphhopperContributes ? 1 : 0);
    const onlineCount =
      configuredServices.filter((s) => s.ok).length +
      (graphhopperContributes && graphhopper.ok ? 1 : 0);

    const overall: "green" | "yellow" | "red" | "idle" =
      configuredCount === 0
        ? "idle"
        : onlineCount === configuredCount
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

    return res.json({
      overall,
      onlineCount,
      configuredCount,
      services,
      graphhopperConfigured: graphhopper.configured,
      graphhopperUrl: graphhopper.url,
      graphhopperTokenMissing: graphhopper.tokenMissing,
      graphhopperAreas: graphhopper.areas,
      valhallaDetail,
      nominatimDetail,
      ufwDetail,
      tokenFingerprints,
      checkedAt: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/thinkcentre-health] errore:", msg);
    return res.status(500).json({ error: "Errore probe servizi ThinkCentre" });
  }
});

export default router;
