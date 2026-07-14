/**
 * ThinkCentre Monitor — funzioni di probe per ogni servizio self-hosted.
 * Aggiungi nuove funzionalità in: server/jobs/thinkcentre-monitor.ts
 *
 * Esporta: OverallStatus, ServiceProbeResult, AggregateProbeResult,
 *          computeOverallStatus, probeGraphHopperAreas, runAllProbes.
 */

import { getPhotonHealthSnapshot } from "../lib/photon-client";
import { cfAccessHeaders } from "../lib/cf-access";
import { ACTIVE_PROFILE, fetchSelfHostedProfiles, isSelfHosted } from "../graphhopper-client";
import { getAreaEnabledMap } from "../routing/routing-area-state";
import { ROUTING_AREAS, type RoutingArea, type RoutingAreaCode } from "@shared/routing-areas";
import * as net from "net";

export { isSelfHosted, fetchSelfHostedProfiles };

const PROBE_TIMEOUT_MS = 5_000;

/**
 * Vero quando giriamo sotto un test runner (vitest imposta VITEST="true";
 * NODE_ENV="test" copre gli altri casi). Usato per disinnescare le probe che
 * aprono socket TCP reali: con i fake timers attivi il loro setTimeout di abort
 * non scatta mai e il socket verso un host irraggiungibile non emette né
 * `connect` né `error`, quindi la promise non si risolve e il test si blocca.
 */
export const RUNNING_UNDER_TEST =
  process.env.VITEST === "true" || process.env.NODE_ENV === "test";

/**
 * Elenco UNICO di tutte le env var lette dalle probe in questo modulo — la
 * fonte di verità sta accanto alle probe che le consumano. Quando aggiungi una
 * nuova probe in `runAllProbes`, aggiungi qui le sue env var: il test usa
 * `resetProbeEnvForTests()` per isolarsi e non deve più mantenere a mano la
 * propria lista di `delete process.env.X`.
 */
export const PROBE_ENV_VARS = [
  "GRAPHHOPPER_URL",
  "GRAPHHOPPER_TOKEN",
  "BOWIE_OLLAMA_URL",
  "BOWIE_OLLAMA_TOKEN",
  "WHISPER_URL",
  "WHISPER_TOKEN",
  "PHOTON_URL",
  "VALHALLA_URL",
  "VALHALLA_API_KEY",
  "UFW_STATUS_URL",
  "TC_DRAGONFLY_URL",
  "POSTGRES_PROBE_HOST",
  "POSTGRES_PROBE_PORT",
  "PGADMIN_URL",
  "NGINX_MONITOR_URL",
  "UPTIME_KUMA_URL",
] as const;

/**
 * Helper SOLO per i test: azzera tutte le env var lette dalle probe così che
 * ogni probe ricada nel ramo "non configurato" (null). Da chiamare in
 * `beforeEach`. Mai usato in produzione.
 */
export function resetProbeEnvForTests(): void {
  for (const name of PROBE_ENV_VARS) delete process.env[name];
}

export type OverallStatus = "green" | "yellow" | "red" | "idle";
type ServiceKey = string;

export interface ServiceProbeResult {
  key: ServiceKey;
  label: string;
  ok: boolean | null;
}

export interface AggregateProbeResult {
  overall: OverallStatus;
  services: ServiceProbeResult[];
}

/**
 * Calcola lo stato globale aggregato.
 * Funzione pura — utilizzabile nei test senza side-effect.
 */
export function computeOverallStatus(logicalUnits: Array<boolean | null>): OverallStatus {
  const configured = logicalUnits.filter((ok) => ok !== null) as boolean[];
  if (configured.length === 0) return "idle";
  const onlineCount = configured.filter((ok) => ok === true).length;
  if (onlineCount === configured.length) return "green";
  if (onlineCount === 0) return "red";
  return "yellow";
}

async function httpProbe(
  url: string,
  headers: Record<string, string>,
  isHealthy: (status: number) => boolean = (s) => s >= 200 && s < 300,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    return isHealthy(res.status);
  } catch {
    return false;
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
  return [[cLon - dLon, cLat - dLat], [cLon + dLon, cLat + dLat]];
}

async function probeGraphHopperAreaOk(
  area: RoutingArea,
  base: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const areaBase = `${base}${area.path}`;
  if (await httpProbe(`${areaBase}/health`, headers, (s) => (s >= 200 && s < 300) || s === 401 || s === 403)) {
    return true;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${areaBase}/route`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        points: areaProbePoints(area),
        profile: ACTIVE_PROFILE,
        points_encoded: true,
        instructions: false,
        calc_points: false,
      }),
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeGraphHopperAreas(): Promise<{ unitOk: boolean | null; areas: ServiceProbeResult[] }> {
  const base = process.env.GRAPHHOPPER_URL?.replace(/\/$/, "");
  if (!base) return { unitOk: null, areas: [] };

  const headers: Record<string, string> = { ...cfAccessHeaders() };
  const token = process.env.GRAPHHOPPER_TOKEN;
  if (token) headers["X-GH-Token"] = token;

  let enabledMap: Record<RoutingAreaCode, boolean>;
  try {
    enabledMap = await getAreaEnabledMap();
  } catch {
    enabledMap = ROUTING_AREAS.reduce((acc, a) => {
      acc[a.codice] = a.abilitatoDefault;
      return acc;
    }, {} as Record<RoutingAreaCode, boolean>);
  }

  const enabledAreas = ROUTING_AREAS.filter((a) => enabledMap[a.codice] ?? false);
  if (enabledAreas.length === 0) return { unitOk: null, areas: [] };

  const results = await Promise.allSettled(
    enabledAreas.map((a) => probeGraphHopperAreaOk(a, base, headers)),
  );

  const areas: ServiceProbeResult[] = enabledAreas.map((a, i) => {
    const r = results[i];
    const ok = r.status === "fulfilled" ? r.value : false;
    return { key: `graphhopper:${a.codice}`, label: `GH · ${a.nome}`, ok };
  });

  const unitOk = areas.some((a) => a.ok === true);
  return { unitOk, areas };
}

async function probeOllamaOk(): Promise<boolean | null> {
  const base = process.env.BOWIE_OLLAMA_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  const token = process.env.BOWIE_OLLAMA_TOKEN;
  if (token) headers["X-Ollama-Token"] = token;
  return httpProbe(`${base}/api/tags`, headers);
}

async function probeWhisperOk(): Promise<boolean | null> {
  const base = process.env.WHISPER_URL?.replace(/\/$/, "");
  if (!base) return null;
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  const token = process.env.WHISPER_TOKEN;
  if (token) headers["X-Whisper-Token"] = token;
  return httpProbe(`${base}/`, headers, (s) => s < 500);
}

async function probePhotonOk(): Promise<boolean | null> {
  const snap = await getPhotonHealthSnapshot();
  if (!snap.configured) return null;
  return snap.ok;
}

async function probeValhallaOk(): Promise<boolean | null> {
  const base = process.env.VALHALLA_URL?.replace(/\/$/, "");
  if (!base) return null;
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  const apiKey = process.env.VALHALLA_API_KEY;
  if (apiKey) headers["X-Valhalla-Key"] = apiKey;
  return httpProbe(`${base}/status`, headers);
}

async function probeUfwOk(): Promise<boolean | null> {
  const base = process.env.UFW_STATUS_URL?.replace(/\/$/, "");
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(base, { method: "GET", signal: controller.signal });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    return data.status === "active";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface TcpConnectResult {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}

/**
 * Probe TCP grezza condivisa (apre un socket raw verso host:port). Usata sia
 * da `tcpConnectOk` (sopra) sia dalle probe admin in
 * `server/routes/admin/thinkcentre-health-infra-probes.ts`, che necessitano
 * di latenza/messaggio d'errore dettagliati per la UI — invece di duplicare
 * la logica del socket.
 */
export function tcpConnectDetailed(host: string, port: number): Promise<TcpConnectResult> {
  // Test-mode guard: sotto il test runner non apriamo socket reali. Con i fake
  // timers il setTimeout di abort non scatta e il socket non si risolve mai →
  // il test si bloccherebbe. Risolviamo subito a "skipped" così le probe TCP
  // restano isolate senza dover azzerare a mano le env var.
  if (RUNNING_UNDER_TEST) {
    return Promise.resolve({ ok: false, latencyMs: null, error: "skipped (test mode)" });
  }
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({
        ok: false,
        latencyMs: null,
        error: `timeout (>${Math.round(PROBE_TIMEOUT_MS / 1000)} s) — TCP timeout`,
      });
    }, PROBE_TIMEOUT_MS);
    socket.on("connect", () => {
      clearTimeout(timeout);
      const latencyMs = Date.now() - t0;
      socket.destroy();
      resolve({ ok: true, latencyMs });
    });
    socket.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, latencyMs: Date.now() - t0, error: err.message });
    });
  });
}

export function tcpConnectOk(host: string, port: number): Promise<boolean | null> {
  // Test-mode guard: sotto il test runner non apriamo socket reali. Risolviamo
  // subito a null (= non configurato) così le probe TCP restano isolate senza
  // dover azzerare a mano le env var.
  if (RUNNING_UNDER_TEST) return Promise.resolve(null);
  return tcpConnectDetailed(host, port).then((r) => r.ok);
}

async function probeDragonflyOk(): Promise<boolean | null> {
  const tcDragonflyUrl = process.env.TC_DRAGONFLY_URL?.trim();
  // Skip probe quando TC_DRAGONFLY_URL non è configurato: DragonflyDB non è atteso.
  if (!tcDragonflyUrl) return null;
  try {
    const u = new URL(tcDragonflyUrl);
    return tcpConnectOk(u.hostname, u.port ? parseInt(u.port, 10) : 6379);
  } catch {
    return false;
  }
}

async function probePostgresOk(): Promise<boolean | null> {
  const host = process.env.POSTGRES_PROBE_HOST?.trim();
  if (!host) return null;
  return tcpConnectOk(host, parseInt(process.env.POSTGRES_PROBE_PORT ?? "5432", 10));
}

async function probePgAdminOk(): Promise<boolean | null> {
  const base = process.env.PGADMIN_URL?.replace(/\/$/, "");
  if (!base) return null;
  return httpProbe(`${base}/`, {}, (s) => s < 500);
}

async function probeNginxOk(): Promise<boolean | null> {
  const base = process.env.NGINX_MONITOR_URL?.replace(/\/$/, "");
  if (!base) return null;
  return httpProbe(`${base}/`, {}, (s) => s < 500);
}

async function probeUptimeKumaOk(): Promise<boolean | null> {
  const base = process.env.UPTIME_KUMA_URL?.replace(/\/$/, "");
  if (!base) return null;
  return httpProbe(`${base}/`, {}, (s) => s < 500);
}

export async function runAllProbes(): Promise<AggregateProbeResult> {
  const probes: Array<{ key: ServiceKey; label: string; fn: () => Promise<boolean | null> }> = [
    { key: "ollama",      label: "Ollama AI",      fn: probeOllamaOk },
    { key: "whisper",     label: "Whisper ASR",    fn: probeWhisperOk },
    { key: "photon",      label: "Photon",         fn: probePhotonOk },
    { key: "valhalla",    label: "Valhalla",       fn: probeValhallaOk },
    { key: "ufw",         label: "Firewall (ufw)", fn: probeUfwOk },
    { key: "dragonfly",   label: "DragonflyDB",    fn: probeDragonflyOk },
    { key: "postgres",    label: "PostgreSQL",     fn: probePostgresOk },
    { key: "pgadmin",     label: "pgAdmin",        fn: probePgAdminOk },
    { key: "nginx",       label: "nginx",          fn: probeNginxOk },
    { key: "uptimekuma",  label: "Uptime Kuma",    fn: probeUptimeKumaOk },
  ];

  const [otherResults, gh] = await Promise.all([
    Promise.allSettled(probes.map((p) => p.fn())),
    probeGraphHopperAreas(),
  ]);

  const otherServices: ServiceProbeResult[] = probes.map((p, i) => {
    const r = otherResults[i];
    const ok = r.status === "fulfilled" ? r.value : false;
    return { key: p.key, label: p.label, ok };
  });

  const services: ServiceProbeResult[] = [...otherServices, ...gh.areas];
  const logicalUnits: Array<boolean | null> = [...otherServices.map((s) => s.ok), gh.unitOk];
  const overall = computeOverallStatus(logicalUnits);

  return { overall, services };
}
