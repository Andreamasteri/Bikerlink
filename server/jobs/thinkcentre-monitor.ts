/**
 * ThinkCentre Monitor — Push notifications admin.
 *
 * Ogni 5 minuti proba i servizi self-hosted sul ThinkCentre
 * (GraphHopper, Ollama, Whisper, Photon, Valhalla) e invia una push agli
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
 * Probe: thinkcentre-monitor-probes.ts
 */

import { db, withDbRetry } from "../db";
import { appSettings, thinkcentreHealthEvents } from "@shared/db";
import { eq } from "drizzle-orm";
import { dedupWarn } from "../lib/dedup-logger";
import { isThinkCentreOffline } from "../lib/thinkcentre-offline";
import { isThinkCentreIgnoredForTests } from "../lib/thinkcentre-ignore-tests";
import { sendSystemAlertPushToAdmins } from "../push-notifications";
import {
  type OverallStatus,
  type ServiceProbeResult,
  isSelfHosted,
  fetchSelfHostedProfiles,
  runAllProbes,
} from "./thinkcentre-monitor-probes";

export {
  type OverallStatus,
  computeOverallStatus,
  probeGraphHopperAreas,
} from "./thinkcentre-monitor-probes";
import { reInitRedis, suspendRedis, setTcRedisProbeOk } from "../cache/redis";

// ── Config ────────────────────────────────────────────────────────────────────
const PROBE_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_PROBE_DELAY_MS = 2 * 60 * 1000;
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const SERVICE_NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;

// ── State ─────────────────────────────────────────────────────────────────────
type ServiceKey = string;

let lastStatus: OverallStatus | null = null;
let lastNotifiedAt = new Map<string, number>();
let lastServiceStatuses = new Map<ServiceKey, boolean>();
let lastServiceNotifiedAt = new Map<ServiceKey, number>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;

// ── AppSetting toggle ─────────────────────────────────────────────────────────
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
export async function checkMotorcycleProfile(): Promise<void> {
  if (!isSelfHosted) return;
  if (await isThinkCentreIgnoredForTests()) {
    console.log("[thinkcentre-monitor] ignore_for_tests attivo — motorcycle profile check saltato");
    return;
  }
  try {
    const result = await fetchSelfHostedProfiles();
    if (!result.reachable) return;
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
          `Il server GraphHopper risponde ma non ha il profilo "motorcycle". Profili: ${profilesList}`,
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

// ── Notifiche per-servizio ────────────────────────────────────────────────────
async function handlePerServiceNotifications(
  services: ServiceProbeResult[],
  isFirstRun: boolean,
): Promise<void> {
  if (isFirstRun) {
    for (const s of services) {
      if (s.ok !== null) lastServiceStatuses.set(s.key, s.ok === true);
    }
    return;
  }

  const pushEnabled = await isServicePushEnabled();

  for (const s of services) {
    if (s.ok === null) continue;

    const currentOk = s.ok === true;
    const prevOk = lastServiceStatuses.get(s.key);
    lastServiceStatuses.set(s.key, currentOk);

    if (prevOk === undefined) continue;

    if (prevOk !== currentOk) {
      void recordHealthEvent(s.key, prevOk ? "ok" : "ko", currentOk ? "ok" : "ko");
    }

    if (!pushEnabled) continue;
    if (prevOk === false && currentOk === false) continue;
    if (currentOk) continue;

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
  // Una sola lettura cache-throttlata (TTL 3min) copre powered_off OR maintenance:
  // niente più read AppSetting a ogni ciclo (~65s) — vedi step 2b/4 del task.
  if (await isThinkCentreOffline()) {
    console.log("[thinkcentre-monitor] ThinkCentre offline (spento o manutenzione) — probe e notifiche saltate");
    return;
  }

  let probeResult: Awaited<ReturnType<typeof runAllProbes>>;
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

  // Aggiorna il risultato della probe DragonflyDB in redis.ts (esposto via getRedisStatus().tcProbeOk).
  const dragonflyProbeResult = services.find((s) => s.key === "dragonfly");
  setTcRedisProbeOk(dragonflyProbeResult?.ok ?? null);

  if (isFirstRun) {
    console.log(`[thinkcentre-monitor] stato iniziale: ${current}`);
    await handlePerServiceNotifications(services, true);
    return;
  }

  await handlePerServiceNotifications(services, false);

  if (prev === current) return;

  console.log(`[thinkcentre-monitor] stato cambiato: ${prev} → ${current}`);
  void recordHealthEvent(null, prev, current);

  if (current === "red") {
    if (shouldNotify("offline")) {
      const n = await sendSystemAlertPushToAdmins(
        "🔴 ThinkCentre offline",
        "Nessun servizio self-hosted risponde (GraphHopper, Ollama, Whisper)",
        { type: "thinkcentre_offline" },
      );
      console.log(`[thinkcentre-monitor] notifica offline inviata a ${n} admin`);
    }
    // TC offline → sospendi DragonflyDB (evita flooding di errori di connessione).
    void suspendRedis();
    return;
  }

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
    // TC tornato online → riprova connessione DragonflyDB se la probe è OK.
    const dragonflyProbe = services.find((s) => s.key === "dragonfly");
    if (dragonflyProbe?.ok === true) {
      void reInitRedis();
      console.log("[thinkcentre-monitor] DragonflyDB TC: riconnessione avviata (probe OK)");
    }
    return;
  }

  if (prev === "green" && current === "yellow") {
    if (shouldNotify("degraded")) {
      const n = await sendSystemAlertPushToAdmins(
        "🟡 ThinkCentre parzialmente offline",
        "Uno o più servizi self-hosted non rispondono",
        { type: "thinkcentre_degraded" },
      );
      console.log(`[thinkcentre-monitor] notifica degraded inviata a ${n} admin`);
    }
  }
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
