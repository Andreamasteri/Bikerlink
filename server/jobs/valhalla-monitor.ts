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

import { db } from "../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import { getInfo as getValhallaInfo } from "../routing/valhalla-client";
import { storage } from "../storage";

// ── Config ─────────────────────────────────────────────────────────────────────
const PROBE_INTERVAL_MS = 5 * 60 * 1000;    // ogni 5 min
const FIRST_PROBE_DELAY_MS = 3 * 60 * 1000; // delay iniziale al boot (sfasato da ThinkCentre)
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;  // 10 min tra stesse notifiche
/** Quanti check consecutivi falliti prima di inviare l'alert offline. */
const FAIL_THRESHOLD = 2;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ── State ─────────────────────────────────────────────────────────────────────
let consecutiveFailures = 0;
let isAlertActive = false;
let lastNotifiedAt = new Map<string, number>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let firstProbeTimer: ReturnType<typeof setTimeout> | null = null;

// ── Push helper ────────────────────────────────────────────────────────────────
async function pushAdmins(title: string, body: string, data: Record<string, unknown>): Promise<number> {
  try {
    const rows = await db
      .select({ token: users.expoPushToken })
      .from(users)
      .where(eq(users.role, "admin"));

    const msgs = rows
      .map((r) => r.token)
      .filter((t): t is string => !!t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")))
      .map((to) => ({ to, title, body, sound: "default" as const, channelId: "matches", data }));

    if (msgs.length === 0) return 0;

    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(msgs),
    });
    if (!resp.ok) {
      console.warn("[valhalla-monitor] push HTTP", resp.status);
      return 0;
    }
    return msgs.length;
  } catch (err) {
    console.warn("[valhalla-monitor] push error (non-fatal):", err);
    return 0;
  }
}

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
    const setting = await storage.getAppSetting("maps_routing_engine");
    return (setting?.value ?? "graphhopper") === "valhalla";
  } catch {
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
          const n = await pushAdmins(
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
        const n = await pushAdmins(
          "🔴 Valhalla offline",
          `Valhalla non risponde da ${consecutiveFailures} check consecutivi. Il routing è degradato al fallback.`,
          { type: "valhalla_offline", consecutiveFailures },
        );
        console.log(`[valhalla-monitor] notifica offline inviata a ${n} admin`);
      }
    }
  } catch (err) {
    console.warn("[valhalla-monitor] probe error (non-fatal):", err);
  }
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
export function startValhallaMonitor(): void {
  // Guard: already started (either waiting for first probe or running on interval)
  if (firstProbeTimer !== null || intervalHandle !== null) return;

  firstProbeTimer = setTimeout(async () => {
    firstProbeTimer = null;
    await runValhallaProbe();
    intervalHandle = setInterval(async () => {
      await runValhallaProbe();
    }, PROBE_INTERVAL_MS);
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
