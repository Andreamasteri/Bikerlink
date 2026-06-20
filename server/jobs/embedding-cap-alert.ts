/**
 * Embedding cap proximity alert.
 *
 * Runs every 30 minutes. When `todayApiCalls / cap >= 0.85` it sends a push
 * notification to all admin/moderator users (same pattern as
 * critical-reports-notifier.ts). Throttle: one alert per day per threshold
 * crossing (85 % and 100 %). Resets at midnight UTC when the date changes.
 */
import { db, withDbRetry } from "../db";
import { users } from "@shared/db";
import { and, eq, inArray } from "drizzle-orm";
import { getTodayEmbeddingApiCallCount } from "../embeddings/store";
import { storage } from "../storage";
import { dedupWarn } from "../lib/dedup-logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const THRESHOLD_WARN = 0.85;
const THRESHOLD_CRIT = 1.0;
const INTERVAL_MS = 30 * 60 * 1000;

let _alertedDateStr = "";
let _alertedWarn = false;
let _alertedCrit = false;

function _utcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function _resetIfNewDay(): void {
  const today = _utcDateStr();
  if (today !== _alertedDateStr) {
    _alertedDateStr = today;
    _alertedWarn = false;
    _alertedCrit = false;
  }
}

async function _getDailyCap(): Promise<number> {
  try {
    const setting = await withDbRetry(() => storage.getAppSetting("embedding_daily_cap"));
    const n = setting?.value ? parseInt(setting.value, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 500;
  } catch (err) {
    dedupWarn("embed-cap-alert/get-cap", "errore lettura cap (non-fatal, default 500)", err);
    return 500;
  }
}

async function _pushAdmins(title: string, body: string, data: Record<string, unknown>): Promise<number> {
  try {
    const rows = await withDbRetry(() => db.select({ token: users.expoPushToken })
      .from(users)
      .where(and(
        eq(users.status, "active"),
        inArray(users.role, ["admin", "moderator"]),
      )));
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
    if (!resp.ok) console.warn("[embed-cap-alert] push HTTP", resp.status);
    return msgs.length;
  } catch (err) {
    dedupWarn("embed-cap-alert/push", "push error (non-fatal)", err);
    return 0;
  }
}

export async function checkEmbeddingCapAlert(): Promise<void> {
  _resetIfNewDay();

  const todayApiCalls = getTodayEmbeddingApiCallCount();
  const cap = await _getDailyCap();
  if (cap <= 0) return;

  const ratio = todayApiCalls / cap;
  const pct = Math.round(ratio * 100);

  if (!_alertedCrit && ratio >= THRESHOLD_CRIT) {
    _alertedCrit = true;
    _alertedWarn = true;
    const sent = await _pushAdmins(
      "🚨 Embedding: cap raggiunto",
      `Cap giornaliero raggiunto (${todayApiCalls}/${cap}). Matching degradato — fallback locale attivo.`,
      { type: "embedding_cap_reached", todayApiCalls, cap },
    );
    console.warn(
      `[embed-cap-alert] CAP RAGGIUNTO (${todayApiCalls}/${cap}) — push inviato a ${sent} admin/mod`,
    );
    return;
  }

  if (!_alertedWarn && ratio >= THRESHOLD_WARN) {
    _alertedWarn = true;
    const sent = await _pushAdmins(
      "⚠ Embedding: cap quasi raggiunto",
      `${pct}% del cap giornaliero consumato (${todayApiCalls}/${cap}). Considera di aumentare il limite.`,
      { type: "embedding_cap_warning", todayApiCalls, cap, pct },
    );
    console.warn(
      `[embed-cap-alert] CAP AL ${pct}% (${todayApiCalls}/${cap}) — push inviato a ${sent} admin/mod`,
    );
  }
}

let _timerId: ReturnType<typeof setTimeout> | null = null;

// Jitter ±10%: evita risincronizzazione con altri worker ogni 30 min.
const jitteredInterval = () => INTERVAL_MS * (0.90 + Math.random() * 0.20);

export function startEmbeddingCapAlertJob(): void {
  if (_timerId) return;
  // Primo run dopo 120s: evita di contendere il pool DB con gli altri worker
  // al boot (thundering herd). Chain auto-rischedulante con jitter ±10%.
  const scheduleNext = () => {
    _timerId = setTimeout(() => {
      checkEmbeddingCapAlert().catch((e) =>
        console.warn("[embed-cap-alert] check error:", e),
      );
      scheduleNext();
    }, jitteredInterval());
  };
  _timerId = setTimeout(() => {
    checkEmbeddingCapAlert().catch((e) =>
      console.warn("[embed-cap-alert] boot check error:", e),
    );
    scheduleNext();
  }, 120_000);
  console.log("[INIT] Embedding cap alert job scheduled (ogni 30 min)");
}

export function stopEmbeddingCapAlertJob(): void {
  if (_timerId) {
    clearTimeout(_timerId);
    _timerId = null;
  }
}
