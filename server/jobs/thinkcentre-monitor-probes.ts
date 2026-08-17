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
  "THINKCENTRE_AGENT_TOKEN",
  "BOWIE_OLLAMA_URL",
  "BOWIE_OLLAMA_TOKEN",
  "PHOTON_URL",
  "VALHALLA_URL",
  "VALHALLA_API_KEY",
  "UFW_STATUS_URL",
  "TC_DRAGONFLY_URL",
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

/**
 * Restituisce solo l'hostname (mai il token) di un URL, o un marcatore leggibile
 * se non configurato / non valido. Usato per il log di boot diagnostico.
 */
function maskEndpointHost(raw: string | undefined): string {
  const v = raw?.trim();
  if (!v) return "<unset>";
  try {
    return new URL(v).hostname;
  } catch {
    return "<url-non-valido>";
  }
}

/**
 * Log di boot diagnostico: stampa l'hostname (mascherato, mai il token) di ogni
 * servizio ThinkCentre monitorato. Serve a verificare a colpo d'occhio che i
 * secret puntino agli host CF tunnel (*.biker-link.net) e non a vecchi hostname
 * DuckDNS, senza dover leggere i valori dei secret.
 */
export function logTcProbeEndpoints(): void {
  console.log("[TC probes] endpoints:", {
    gh: maskEndpointHost(process.env.GRAPHHOPPER_URL),
    valhalla: maskEndpointHost(process.env.VALHALLA_URL),
    ollama: maskEndpointHost(process.env.BOWIE_OLLAMA_URL),
    photon: maskEndpointHost(process.env.PHOTON_URL),
    tcAgent: maskEndpointHost(process.env.THINKCENTRE_METRICS_URL),
  });
}

export type OverallStatus = "green" | "yellow" | "red" | "idle";
type ServiceKey = string;

export interface ServiceProbeResult {
  key: ServiceKey;
  label: string;
  ok: boolean | null;
  /**
   * Causa leggibile quando `ok` è false — es. "token non configurato",
   * "CF Access bloccato", "token non valido (401)", "offline / non raggiungibile".
   * Assente quando `ok` è true o null.
   */
  reason?: string;
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

/**
 * Punti di probe noti-routable per area (lon, lat su strada principale).
 * Usati al posto del centro del bbox, che può finire in mare o su terreno
 * non mappato per aree costiere/insulari (es. Grecia, Ecuador).
 * Formato: [lon, lat] — due punti distinti nello stesso centro urbano.
 *
 * ⚠️ SINCRONIZZAZIONE — tenere allineato con AREA_PROBE_POINTS in
 * server/routes/admin/thinkcentre-health-gh-probes.ts.
 * Ogni area in ROUTING_AREAS DEVE avere una entry qui: il gate
 * "area-probe-points-coverage" nei test lo verifica a ogni PR.
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

function areaProbePoints(area: RoutingArea): [number, number][] {
  const hardcoded = AREA_PROBE_POINTS[area.codice];
  if (hardcoded) return hardcoded;
  // Fallback: centro del bbox con offset del 10% (funziona per aree terrestri pianeggianti)
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
  if (await httpProbe(`${areaBase}/health`, headers, (s) => s >= 200 && s < 300)) {
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

async function probeNginxOk(): Promise<boolean | null> {
  const base = process.env.NGINX_MONITOR_URL?.replace(/\/$/, "");
  if (!base) return null;
  const agentToken = process.env.THINKCENTRE_AGENT_TOKEN?.trim() ?? "";
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (agentToken) headers["X-Agent-Token"] = agentToken;
  return httpProbe(`${base}/`, headers);
}

async function probeUptimeKumaOk(): Promise<boolean | null> {
  const base = process.env.UPTIME_KUMA_URL?.replace(/\/$/, "");
  if (!base) return null;
  const agentToken = process.env.THINKCENTRE_AGENT_TOKEN?.trim() ?? "";
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (agentToken) headers["X-Agent-Token"] = agentToken;
  return httpProbe(`${base}/`, headers);
}

export async function runAllProbes(): Promise<AggregateProbeResult> {
  // Probe generiche (boolean | null): non richiedono diagnostica strutturata.
  const probes: Array<{ key: ServiceKey; label: string; fn: () => Promise<boolean | null> }> = [
    { key: "ollama",      label: "Ollama AI",      fn: probeOllamaOk },
    { key: "photon",      label: "Photon",         fn: probePhotonOk },
    { key: "valhalla",    label: "Valhalla",       fn: probeValhallaOk },
    { key: "ufw",         label: "Firewall (ufw)", fn: probeUfwOk },
    { key: "dragonfly",   label: "DragonflyDB",    fn: probeDragonflyOk },
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
  const overall = computeOverallStatus([...otherServices.map((service) => service.ok), gh.unitOk]);

  return { overall, services };
}
