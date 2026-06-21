/**
 * ThinkCentre Monitor — Push notifications admin.
 *
 * Ogni 5 minuti proba i servizi self-hosted sul ThinkCentre
 * (GraphHopper, Ollama, Whisper, Nominatim, Valhalla) e invia una push agli
 * admin quando il server passa da online → offline o da offline → online.
 *
 * Stati globali:
 *   "green"  = tutti i servizi configurati rispondo
 *   "yellow" = alcuni su, alcuni giù
 *   "red"    = nessun servizio configurato risponde  ← "offline"
 *   "idle"   = nessun servizio configurato
 *
 * Notifiche globali (transizione aggregata):
 *   - Transizione → red    : "🔴 ThinkCentre offline"
 *   - Transizione da red → non-red : "🟢 ThinkCentre tornato online"
 *   - Transizione green → yellow   : "🟡 ThinkCentre parzialmente offline"
 *
 * Notifiche per-servizio (ok → ko):
 *   - Ogni servizio configurato che passa da OK a KO riceve una notifica
 *     individuale (es. "🔴 Ollama AI offline").
 *   - Debounce: 15 min per servizio.
 *   - Controllabile via AppSetting "thinkcentre_service_push_enabled"
 *     (default: abilitato). Valore "false" disabilita le notifiche per-servizio.
 *
 * Throttle globale: min 10 min tra notifiche dello stesso tipo.
 */

import { db, withDbRetry } from "../db";
import { appSettings, thinkcentreHealthEvents } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "../lib/dedup-logger";
import { isThinkCentreInMaintenance } from "../lib/thinkcentre-maintenance";
import { isThinkCentrePoweredOff } from "../lib/thinkcentre-powered-off";
import { isThinkCentreIgnoredForTests } from "../lib/thinkcentre-ignore-tests";
import { sendSystemAlertPushToAdmins } from "../push-notifications";
import { getNominatimHealthSnapshot } from "../lib/nominatim-client";
import { ACTIVE_PROFILE, fetchSelfHostedProfiles, isSelfHosted } from "../graphhopper-client";
import { getAreaEnabledMap } from "../routing/routing-area-state";
import { ROUTING_AREAS, type RoutingArea, type RoutingAreaCode } from "@shared/routing-areas";
import * as net from "net";

// ── Config ────────────────────────────────────────────────────────────────────
const PROBE_INTERVAL_MS = 5 * 60 * 1000;       // ogni 5 min
const FIRST_PROBE_DELAY_MS = 2 * 60 * 1000;    // delay iniziale al boot
const PROBE_TIMEOUT_MS = 5_000;
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;     // 10 min tra stesse notifiche globali
const SERVICE_NOTIFY_COOLDOWN_MS = 15 * 60 * 1000; // 15 min per notifiche per-servizio

// ── State ─────────────────────────────────────────────────────────────────────
export type OverallStatus = "green" | "yellow" | "red" | "idle";
/**
 * Chiave di servizio per le notifiche/debounce per-servizio. I servizi singoli
 * usano i loro nomi; GraphHopper è esploso per-area con chiavi
 * `graphhopper:<codice>` (es. "graphhopper:arco-alpino").
 */
type ServiceKey = string;

interface ServiceProbeResult {
  key: ServiceKey;
  label: string;
  ok: boolean | null; // null = non configurato / non abilitato
}

let lastStatus: OverallStatus | null = null;
let lastNotifiedAt = new Map<string, number>();

/** Stato precedente per ogni singolo servizio/area configurato (ok/ko). */
let lastServiceStatuses = new Map<ServiceKey, boolean>();
/** Timestamp dell'ultima notifica per-servizio/area inviata. */
let lastServiceNotifiedAt = new Map<ServiceKey, number>();

let intervalHandle: ReturnType<typeof setInterval> | null = null;

// ── AppSetting toggle ─────────────────────────────────────────────────────────
/**
 * Legge AppSetting "thinkcentre_service_push_enabled".
 * Default: true (abilitato). "false" disabilita le notifiche per-servizio.
 */
async function isServicePushEnabled(): Promise<boolean> {
  try {
    const [row] = await withDbRetry(() => db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "thinkcentre_service_push_enabled"))
      .limit(1));
    if (row?.value === "false") return false;
  } catch (err) {
    dedupWarn("thinkcentre-monitor", "errore lettura AppSetting (non-fatal)", err);
  }
  return true;
}

function shouldNotify(eventKey: string): boolean {
  const now = Date.now();
  const last = lastNotifiedAt.get(eventKey) ?? 0;
  if (now - last < NOTIFY_COOLDOWN_MS) return false;
  lastNotifiedAt.set(eventKey, now);
  return true;
}

function shouldNotifyService(key: ServiceKey): boolean {
  const now = Date.now();
  const last = lastServiceNotifiedAt.get(key) ?? 0;
  if (now - last < SERVICE_NOTIFY_COOLDOWN_MS) return false;
  lastServiceNotifiedAt.set(key, now);
  return true;
}

// ── Health event recorder ─────────────────────────────────────────────────────
async function recordHealthEvent(
  serviceKey: string | null,
  transitionFrom: string,
  transitionTo: string,
): Promise<void> {
  try {
    await withDbRetry(() => db.insert(thinkcentreHealthEvents).values({
      serviceKey: serviceKey ?? undefined,
      transitionFrom,
      transitionTo,
    }));
  } catch (err) {
    dedupWarn("thinkcentre-monitor/health-event", "errore registrazione health event (non-fatal)", err);
  }
}

// ── Motorcycle profile check ──────────────────────────────────────────────────
/**
 * Verifica che il server GH self-hosted esponga il profilo "motorcycle".
 * Se mancante: log warning + push admin (con throttle 10 min).
 * Noop se GH non è self-hosted o se il server non è raggiungibile (tunnel giù).
 */
export async function checkMotorcycleProfile(): Promise<void> {
  if (!isSelfHosted) return;
  if (await isThinkCentreIgnoredForTests()) {
    console.log("[thinkcentre-monitor] ignore_for_tests attivo — motorcycle profile check saltato");
    return;
  }
  try {
    const result = await fetchSelfHostedProfiles();
    if (!result.reachable) {
      return;
    }
    if (!result.profiles) {
      console.warn("[thinkcentre-monitor] motorcycle check: /info non ha restituito profili (parse error)");
      return;
    }
    if (!result.profiles.includes("motorcycle")) {
      const profilesList = result.profiles.join(", ") || "(nessuno)";
      console.warn(
        `[thinkcentre-monitor] ⚠️ Profilo "motorcycle" MANCANTE dal server GH. Profili disponibili: ${profilesList}`,
      );
      if (shouldNotify("motorcycle_missing")) {
        const n = await sendSystemAlertPushToAdmins(
          '⚠️ Profilo motorcycle mancante',
          `Il server GraphHopper risponde ma non ha il profilo "motorcycle". Profili disponibili: ${profilesList}`,
          { type: "gh_motorcycle_missing", profiles: result.profiles },
        );
        console.log(`[thinkcentre-monitor] notifica motorcycle_missing inviata a ${n} admin`);
      }
    } else {
      console.log(
        `[thinkcentre-monitor] motorcycle check OK — profilo presente (${result.profiles.length} profili totali)`,
      );
    }
  } catch (err) {
    console.warn("[thinkcentre-monitor] errore check profilo motorcycle (non-fatal):", err);
  }
}

// ── Probe helpers ─────────────────────────────────────────────────────────────
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

/** Due punti di probe interni al bbox dell'area (offset 10% dal centro). */
function areaProbePoints(area: RoutingArea): [number, number][] {
  const { minLon, minLat, maxLon, maxLat } = area.bbox;
  const cLon = (minLon + maxLon) / 2;
  const cLat = (minLat + maxLat) / 2;
  const dLon = (maxLon - minLon) * 0.1;
  const dLat = (maxLat - minLat) * 0.1;
  return [[cLon - dLon, cLat - dLat], [cLon + dLon, cLat + dLat]];
}

/** Proba una singola istanza GH per-area: GET /health, poi fallback POST /route. */
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

/**
 * Calcola lo stato globale aggregato a partire dalla lista di unità logiche
 * (ogni servizio configurato = un boolean, non configurato = null).
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

/**
 * Proba le 7 istanze GraphHopper per-area e ritorna:
 *  - `unitOk`: contributo di GH allo stato globale (null = non configurato/niente
 *    abilitato; true = almeno un'area abilitata risponde; false = nessuna risponde);
 *  - `areas`: un ServiceProbeResult per ogni area ABILITATA (key `graphhopper:<codice>`,
 *    label `GH · <nome>`) per le notifiche/eventi per-area. Le aree non abilitate
 *    sono escluse (non generano notifiche offline).
 */
export async function probeGraphHopperAreas(): Promise<{ unitOk: boolean | null; areas: ServiceProbeResult[] }> {
  const base = process.env.GRAPHHOPPER_URL?.replace(/\/$/, "");
  if (!base) return { unitOk: null, areas: [] };

  const headers: Record<string, string> = {};
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
  const base = process.env.OLLAMA_URL?.replace(/\/$/, "");
  if (!base) return null;
  const headers: Record<string, string> = {};
  const token = process.env.OLLAMA_TOKEN;
  if (token) headers["X-Ollama-Token"] = token;
  return httpProbe(`${base}/api/tags`, headers);
}

async function probeWhisperOk(): Promise<boolean | null> {
  const base = process.env.WHISPER_URL?.replace(/\/$/, "");
  if (!base) return null;
  const headers: Record<string, string> = {};
  const token = process.env.WHISPER_TOKEN;
  if (token) headers["X-Whisper-Token"] = token;
  return httpProbe(`${base}/`, headers, (s) => s < 500);
}

async function probeNominatimOk(): Promise<boolean | null> {
  const snap = await getNominatimHealthSnapshot();
  if (!snap.configured) return null;
  return snap.ok;
}

async function probeValhallaOk(): Promise<boolean | null> {
  const base = process.env.VALHALLA_URL?.replace(/\/$/, "");
  if (!base) return null;
  const headers: Record<string, string> = {};
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

// ── TCP connect helper ────────────────────────────────────────────────────────
function tcpConnectOk(host: string, port: number): Promise<boolean | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => { socket.destroy(); resolve(false); }, PROBE_TIMEOUT_MS);
    socket.on("connect", () => { clearTimeout(timeout); socket.destroy(); resolve(true); });
    socket.on("error", () => { clearTimeout(timeout); resolve(false); });
  });
}

// ── Infra probes (Redis, PostgreSQL, pgAdmin, nginx, Uptime Kuma) ─────────────
async function probeRedisOk(): Promise<boolean | null> {
  const host = process.env.REDIS_PROBE_HOST?.trim();
  if (!host) return null;
  const port = parseInt(process.env.REDIS_PROBE_PORT ?? "6379", 10);
  return tcpConnectOk(host, port);
}

async function probePostgresOk(): Promise<boolean | null> {
  const host = process.env.POSTGRES_PROBE_HOST?.trim();
  if (!host) return null;
  const port = parseInt(process.env.POSTGRES_PROBE_PORT ?? "5432", 10);
  return tcpConnectOk(host, port);
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

// ── Probe aggregato ───────────────────────────────────────────────────────────
interface AggregateProbeResult {
  overall: OverallStatus;
  services: ServiceProbeResult[];
}

async function runAllProbes(): Promise<AggregateProbeResult> {
  const probes: Array<{ key: ServiceKey; label: string; fn: () => Promise<boolean | null> }> = [
    { key: "ollama", label: "Ollama AI", fn: probeOllamaOk },
    { key: "whisper", label: "Whisper ASR", fn: probeWhisperOk },
    { key: "nominatim", label: "Nominatim", fn: probeNominatimOk },
    { key: "valhalla", label: "Valhalla", fn: probeValhallaOk },
    { key: "ufw", label: "Firewall (ufw)", fn: probeUfwOk },
    { key: "redis", label: "Redis", fn: probeRedisOk },
    { key: "postgres", label: "PostgreSQL", fn: probePostgresOk },
    { key: "pgadmin", label: "pgAdmin", fn: probePgAdminOk },
    { key: "nginx", label: "nginx", fn: probeNginxOk },
    { key: "uptimekuma", label: "Uptime Kuma", fn: probeUptimeKumaOk },
  ];

  const [otherResults, gh] = await Promise.all([
    Promise.allSettled(probes.map((p) => p.fn())),
    probeGraphHopperAreas(),
  ]);

  // Servizi singoli (Ollama, Whisper, Nominatim, Valhalla).
  const otherServices: ServiceProbeResult[] = probes.map((p, i) => {
    const r = otherResults[i];
    const ok = r.status === "fulfilled" ? r.value : false;
    return { key: p.key, label: p.label, ok };
  });

  // GraphHopper conta come UN servizio per lo stato globale (unitOk), ma le
  // notifiche/eventi per-servizio sono per-area (gh.areas).
  const services: ServiceProbeResult[] = [...otherServices, ...gh.areas];

  // ── Stato globale ──────────────────────────────────────────────────────────
  // Le unità logiche sono i 4 servizi singoli + GraphHopper-come-unità.
  const logicalUnits: Array<boolean | null> = [
    ...otherServices.map((s) => s.ok),
    gh.unitOk,
  ];
  const overall = computeOverallStatus(logicalUnits);

  return { overall, services };
}

// ── Notifiche per-servizio ────────────────────────────────────────────────────
/**
 * Controlla le transizioni ok→ko per ogni servizio configurato e invia
 * notifiche push individuali se:
 *   - AppSetting "thinkcentre_service_push_enabled" != "false"
 *   - Il servizio era OK e ora è KO (prima run = nessuna notifica)
 *   - Debounce 15 min per servizio non ancora scaduto
 */
async function handlePerServiceNotifications(
  services: ServiceProbeResult[],
  isFirstRun: boolean,
): Promise<void> {
  if (isFirstRun) {
    // Prima run: inizializza stato senza notificare
    for (const s of services) {
      if (s.ok !== null) lastServiceStatuses.set(s.key, s.ok === true);
    }
    return;
  }

  const pushEnabled = await isServicePushEnabled();

  for (const s of services) {
    if (s.ok === null) continue; // non configurato

    const currentOk = s.ok === true;
    const prevOk = lastServiceStatuses.get(s.key);

    // Aggiorna stato corrente
    lastServiceStatuses.set(s.key, currentOk);

    if (prevOk === undefined) continue; // primo ciclo per questo servizio

    const prevStr = prevOk ? "ok" : "ko";
    const currentStr = currentOk ? "ok" : "ko";

    // Registra ogni transizione di stato (anche ko→ok)
    if (prevOk !== currentOk) {
      void recordHealthEvent(s.key, prevStr, currentStr);
    }

    // Notifica solo se la feature è abilitata e il servizio è appena andato offline
    if (!pushEnabled) continue;
    if (prevOk === false && currentOk === false) continue; // già offline, niente spam
    if (currentOk) continue; // è tornato online o era già online

    // prevOk === true && currentOk === false → servizio appena offline
    if (!shouldNotifyService(s.key)) continue;

    const n = await sendSystemAlertPushToAdmins(
      `🔴 ${s.label} offline`,
      `Il servizio ${s.label} sul ThinkCentre non risponde`,
      { type: "thinkcentre_service_offline", service: s.key },
    );
    console.log(`[thinkcentre-monitor] notifica per-servizio inviata: ${s.key} offline → ${n} admin`);
  }
}

// ── Ciclo principale ──────────────────────────────────────────────────────────
export async function runThinkCentreProbe(): Promise<void> {
  if (await isThinkCentreIgnoredForTests()) {
    console.log("[thinkcentre-monitor] ignore_for_tests attivo — probe e notifiche soppresse");
    return;
  }
  if (await isThinkCentrePoweredOff()) {
    console.log("[thinkcentre-monitor] ThinkCentre spento (override manuale) — probe e notifiche saltate");
    return;
  }
  if (await isThinkCentreInMaintenance()) {
    console.log("[thinkcentre-monitor] manutenzione programmata — probe saltate");
    return;
  }

  let probeResult: AggregateProbeResult;
  try {
    probeResult = await runAllProbes();
  } catch (err) {
    console.warn("[thinkcentre-monitor] probe error (non-fatal):", err);
    return;
  }

  const { overall: current, services } = probeResult;
  const prev = lastStatus;
  const isFirstRun = prev === null;
  lastStatus = current;

  // Prima esecuzione: inizializza stato senza notifiche aggregate
  if (isFirstRun) {
    console.log(`[thinkcentre-monitor] stato iniziale: ${current}`);
    await handlePerServiceNotifications(services, true);
    return;
  }

  // ── Notifiche per-servizio ────────────────────────────────────────────────
  await handlePerServiceNotifications(services, false);

  if (prev === current) return; // nessun cambiamento aggregato

  console.log(`[thinkcentre-monitor] stato cambiato: ${prev} → ${current}`);
  void recordHealthEvent(null, prev, current);

  // ── Offline ────────────────────────────────────────────────────────────────
  if (current === "red") {
    if (shouldNotify("offline")) {
      const n = await sendSystemAlertPushToAdmins(
        "🔴 ThinkCentre offline",
        "Nessun servizio self-hosted risponde (GraphHopper, Ollama, Whisper)",
        { type: "thinkcentre_offline" },
      );
      console.log(`[thinkcentre-monitor] notifica offline inviata a ${n} admin`);
    }
    return;
  }

  // ── Tornato online (da red) ────────────────────────────────────────────────
  if (prev === "red" && (current === "green" || current === "yellow")) {
    const icon = current === "green" ? "🟢" : "🟡";
    const detail = current === "green"
      ? "Tutti i servizi sono tornati operativi"
      : "Alcuni servizi sono tornati online (stato parziale)";
    if (shouldNotify("online")) {
      const n = await sendSystemAlertPushToAdmins(
        `${icon} ThinkCentre tornato online`,
        detail,
        { type: "thinkcentre_online", status: current },
      );
      console.log(`[thinkcentre-monitor] notifica online inviata a ${n} admin`);
    }
    void checkMotorcycleProfile();
    return;
  }

  // ── Degradato (green → yellow) ────────────────────────────────────────────
  if (prev === "green" && current === "yellow") {
    if (shouldNotify("degraded")) {
      const n = await sendSystemAlertPushToAdmins(
        "🟡 ThinkCentre parzialmente offline",
        "Uno o più servizi self-hosted non rispondono",
        { type: "thinkcentre_degraded" },
      );
      console.log(`[thinkcentre-monitor] notifica degraded inviata a ${n} admin`);
    }
    return;
  }

  // Recupero parziale (yellow → green): nessuna notifica necessaria
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
export function startThinkCentreMonitor(): void {
  if (intervalHandle) return;

  const firstTimer = setTimeout(async () => {
    await runThinkCentreProbe();
    intervalHandle = setInterval(async () => {
      await runThinkCentreProbe();
    }, PROBE_INTERVAL_MS);
  }, FIRST_PROBE_DELAY_MS);

  (firstTimer as unknown as { _thinkcentreFirst: boolean })._thinkcentreFirst = true;
  console.log(`[thinkcentre-monitor] avviato (primo probe tra ${FIRST_PROBE_DELAY_MS / 1000}s, poi ogni ${PROBE_INTERVAL_MS / 60000} min)`);
}

export function stopThinkCentreMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  lastNotifiedAt.clear();
  lastServiceNotifiedAt.clear();
  lastServiceStatuses.clear();
  lastStatus = null;
}
