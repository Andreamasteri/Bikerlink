/**
 * Valhalla Monitor — Push notifications admin.
 *
 * Ogni 5 minuti proba Valhalla via getInfo() — MA SOLO quando è l'engine
 * attivo (maps_routing_engine = "valhalla").
 *
 * Se Valhalla risulta irraggiungibile per FAIL_THRESHOLD check consecutivi
 * viene inviata una push admin. L'alert si auto-risolve quando il server
 * torna raggiungibile.
 *
 * Notifiche inviate:
 *   - FAIL_THRESHOLD probe falliti di fila : "🔴 Valhalla offline"
 *   - Recovery dopo offline               : "🟢 Valhalla tornato online"
 *
 * Throttle: min 10 min tra notifiche dello stesso tipo.
 */

import { withJobGate } from "../ai/coordinator/gated-job";
import { getInfo as getValhallaInfo } from "../routing/valhalla-client";
import { storage } from "../storage";
import { sendSystemAlertPushToAdmins } from "../push-notifications";
import { withDbRetry } from "../db";
import { dedupWarn } from "../lib/dedup-logger";

// ── Config ─────────────────────────────────────────────────────────────────────
const PROBE_INTERVAL_MS = 5 * 60 * 1000;    // ogni 5 min
const FIRST_PROBE_DELAY_MS = 3 * 60 * 1000; // delay iniziale al boot (sfasato da ThinkCentre)
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;  // 10 min tra stesse notifiche
/** Quanti check consecutivi falliti prima di inviare l'alert offline. */
const FAIL_THRESHOLD = 2;

// ── State ─────────────────────────────────────────────────────────────────────
let consecutiveFailures = 0;
let isAlertActive = false;
const lastNotifiedAt = new Map<string, number>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let firstProbeTimer: ReturnType<typeof setTimeout> | null = null;

function shouldNotify(eventKey: string): boolean {
  const now = Date.now();
  const last = lastNotifiedAt.get(eventKey) ?? 0;
  if (now - last < NOTIFY_COOLDOWN_MS) return false;
  lastNotifiedAt.set(eventKey, now);
  return true;
}

// ── Controlla se Valhalla è l'engine attivo ───────────────────────────────────
async function isValhallaActive(): Promise<boolean> {
  try {
    const setting = await withDbRetry(() => storage.getAppSetting("maps_routing_engine"));
    return (setting?.value ?? "graphhopper") === "valhalla";
  } catch (err) {
    dedupWarn("valhalla-monitor/active-check", "errore lettura engine attivo (non-fatal)", err);
    return false;
  }
}

// ── Probe Valhalla ─────────────────────────────────────────────────────────────
async function probeValhallaOk(): Promise<boolean> {
  try {
    const info = await getValhallaInfo();
    return info.status === "ok";
  } catch {
    return false;
  }
}

// ── Ciclo principale ──────────────────────────────────────────────────────────
export async function runValhallaProbe(): Promise<void> {
  try {
    const active = await isValhallaActive();

    if (!active) {
      // Engine non attivo: azzera lo stato senza notifiche
      if (consecutiveFailures > 0 || isAlertActive) {
        console.log("[valhalla-monitor] Valhalla non è l'engine attivo — stato resettato");
        consecutiveFailures = 0;
        isAlertActive = false;
      }
      return;
    }

    const ok = await probeValhallaOk();

    if (ok) {
      if (isAlertActive) {
        // Recovery: era offline, ora è tornato su
        isAlertActive = false;
        consecutiveFailures = 0;
        console.log("[valhalla-monitor] Valhalla tornato raggiungibile — invio notifica recovery");
        if (shouldNotify("online")) {
          const n = await sendSystemAlertPushToAdmins(
            "🟢 Valhalla tornato online",
            "Il server Valhalla (routing attivo) è nuovamente raggiungibile.",
            { type: "valhalla_online" },
          );
          console.log(`[valhalla-monitor] notifica recovery inviata a ${n} admin`);
        }
      } else {
        // Tutto normale
        if (consecutiveFailures > 0) consecutiveFailures = 0;
        console.log("[valhalla-monitor] Valhalla OK");
      }
      return;
    }

    // Probe fallito
    consecutiveFailures++;
    console.warn(`[valhalla-monitor] probe fallito (${consecutiveFailures}/${FAIL_THRESHOLD})`);

    if (consecutiveFailures >= FAIL_THRESHOLD && !isAlertActive) {
      isAlertActive = true;
      if (shouldNotify("offline")) {
        const n = await sendSystemAlertPushToAdmins(
          "🔴 Valhalla offline",
          `Valhalla non risponde da ${consecutiveFailures} check consecutivi. Il routing è degradato al fallback.`,
          { type: "valhalla_offline", consecutiveFailures },
        );
        console.log(`[valhalla-monitor] notifica offline inviata a ${n} admin`);
      }
    }
  } catch (err) {
    dedupWarn("valhalla-monitor/probe", "probe error (non-fatal)", err);
  }
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
export function startValhallaMonitor(): void {
  // Guard: already started (either waiting for first probe or running on interval)
  if (firstProbeTimer !== null || intervalHandle !== null) return;

  const gatedProbe = withJobGate("valhalla-monitor", async () => {
    await runValhallaProbe();
  }, { critical: true });

  firstProbeTimer = setTimeout(async () => {
    firstProbeTimer = null;
    await gatedProbe();
    intervalHandle = setInterval(gatedProbe, PROBE_INTERVAL_MS);
  }, FIRST_PROBE_DELAY_MS);

  console.log(`[valhalla-monitor] avviato (primo probe tra ${FIRST_PROBE_DELAY_MS / 1000}s, poi ogni ${PROBE_INTERVAL_MS / 60000} min — soglia: ${FAIL_THRESHOLD} fail consecutivi)`);
}

export function stopValhallaMonitor(): void {
  if (firstProbeTimer !== null) {
    clearTimeout(firstProbeTimer);
    firstProbeTimer = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  lastNotifiedAt.clear();
  consecutiveFailures = 0;
  isAlertActive = false;
}
