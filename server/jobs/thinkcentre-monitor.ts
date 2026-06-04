/**
 * ThinkCentre Monitor — Push notifications admin.
 *
 * Ogni 5 minuti proba i servizi self-hosted sul ThinkCentre
 * (GraphHopper, Ollama, Whisper, Nominatim) e invia una push agli admin
 * quando il server passa da online → offline o da offline → online.
 *
 * Stati:
 *   "green"  = tutti i servizi configurati rispondo
 *   "yellow" = alcuni su, alcuni giù
 *   "red"    = nessun servizio configurato risponde  ← "offline"
 *   "idle"   = nessun servizio configurato
 *
 * Notifiche inviate:
 *   - Transizione → red    : "🔴 ThinkCentre offline"
 *   - Transizione da red → non-red : "🟢 ThinkCentre tornato online"
 *   - Transizione green → yellow   : "🟡 ThinkCentre parzialmente offline"
 *
 * Throttle: min 10 min tra notifiche dello stesso tipo.
 */

import { db } from "../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import { getNominatimHealthSnapshot } from "../lib/nominatim-client";
import { ACTIVE_PROFILE } from "../graphhopper-client";

// ── Config ────────────────────────────────────────────────────────────────────
const PROBE_INTERVAL_MS = 5 * 60 * 1000;   // ogni 5 min
const FIRST_PROBE_DELAY_MS = 2 * 60 * 1000; // delay iniziale al boot
const PROBE_TIMEOUT_MS = 5_000;
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;  // 10 min tra stesse notifiche
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ── State ─────────────────────────────────────────────────────────────────────
type OverallStatus = "green" | "yellow" | "red" | "idle";
let lastStatus: OverallStatus | null = null;
let lastNotifiedAt = new Map<string, number>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;

// ── Push helper ───────────────────────────────────────────────────────────────
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
      console.warn("[thinkcentre-monitor] push HTTP", resp.status);
      return 0;
    }
    return msgs.length;
  } catch (err) {
    console.warn("[thinkcentre-monitor] push error (non-fatal):", err);
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

async function probeGraphHopperOk(): Promise<boolean | null> {
  const base = process.env.GRAPHHOPPER_URL?.replace(/\/$/, "");
  if (!base) return null;
  const headers: Record<string, string> = {};
  const token = process.env.GRAPHHOPPER_TOKEN;
  if (token) headers["X-GH-Token"] = token;

  // 1) /health endpoint
  if (await httpProbe(`${base}/health`, headers)) return true;

  // 2) Fallback: route probe minimale (Milano→Como)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/route`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        points: [[9.19, 45.46], [9.08, 45.81]],
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

// ── Probe aggregato ───────────────────────────────────────────────────────────
async function getOverallStatus(): Promise<OverallStatus> {
  const results = await Promise.allSettled([
    probeGraphHopperOk(),
    probeOllamaOk(),
    probeWhisperOk(),
    probeNominatimOk(),
  ]);

  const values = results.map((r) => (r.status === "fulfilled" ? r.value : false));
  const configured = values.filter((v) => v !== null);
  if (configured.length === 0) return "idle";

  const onlineCount = configured.filter((v) => v === true).length;
  if (onlineCount === configured.length) return "green";
  if (onlineCount === 0) return "red";
  return "yellow";
}

// ── Ciclo principale ──────────────────────────────────────────────────────────
export async function runThinkCentreProbe(): Promise<void> {
  let current: OverallStatus;
  try {
    current = await getOverallStatus();
  } catch (err) {
    console.warn("[thinkcentre-monitor] probe error (non-fatal):", err);
    return;
  }

  const prev = lastStatus;
  lastStatus = current;

  // Prima esecuzione: nessuna notifica, solo inizializza lo stato
  if (prev === null) {
    console.log(`[thinkcentre-monitor] stato iniziale: ${current}`);
    return;
  }

  if (prev === current) return; // nessun cambiamento

  console.log(`[thinkcentre-monitor] stato cambiato: ${prev} → ${current}`);

  // ── Offline ────────────────────────────────────────────────────────────────
  if (current === "red") {
    if (shouldNotify("offline")) {
      const n = await pushAdmins(
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
      const n = await pushAdmins(
        `${icon} ThinkCentre tornato online`,
        detail,
        { type: "thinkcentre_online", status: current },
      );
      console.log(`[thinkcentre-monitor] notifica online inviata a ${n} admin`);
    }
    return;
  }

  // ── Degradato (green → yellow) ────────────────────────────────────────────
  if (prev === "green" && current === "yellow") {
    if (shouldNotify("degraded")) {
      const n = await pushAdmins(
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

  // Primo probe con ritardo per non saturare il boot
  const firstTimer = setTimeout(async () => {
    await runThinkCentreProbe();
    intervalHandle = setInterval(async () => {
      await runThinkCentreProbe();
    }, PROBE_INTERVAL_MS);
  }, FIRST_PROBE_DELAY_MS);

  // Pulizia timer iniziale se stop() viene chiamato prima che scatti
  (firstTimer as unknown as { _thinkcentreFirst: boolean })._thinkcentreFirst = true;
  console.log(`[thinkcentre-monitor] avviato (primo probe tra ${FIRST_PROBE_DELAY_MS / 1000}s, poi ogni ${PROBE_INTERVAL_MS / 60000} min)`);
}

export function stopThinkCentreMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  lastNotifiedAt.clear();
  lastStatus = null;
}
