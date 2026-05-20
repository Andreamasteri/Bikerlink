// Task #1587 — OTA Stuck Recovery: persistent rollback tracking + stuck-state gate.
//
// Exposes:
//  - isOtaStuck(): Promise<boolean>  → true when circuit breaker has fired
//  - clearOtaStuckState()            → reset all counters (post-reinstall / admin override)
//  - incrementRollbackCount()        → called by ota-hardening on rollback event
//  - resetStuckCounters()            → called by sendOtaHeartbeatOnce on heartbeat success
//  - incrementStuckSessions()        → called by ota-check on stale-session detection
//  - getLastFetchedId() / setLastFetchedId() → AsyncStorage helpers for stale-session detection

import AsyncStorage from "@react-native-async-storage/async-storage";

export const OTA_ROLLBACK_COUNT_KEY = "@bikerlink/ota_rollback_count";
export const OTA_STUCK_SESSIONS_KEY = "@bikerlink/ota_stuck_sessions";
export const OTA_LAST_FETCHED_ID_KEY = "@bikerlink/ota_last_fetched_id";

const STUCK_THRESHOLD = 3;

async function getCounter(key: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

async function setCounter(key: string, value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {}
}

export async function incrementRollbackCount(): Promise<void> {
  const current = await getCounter(OTA_ROLLBACK_COUNT_KEY);
  await setCounter(OTA_ROLLBACK_COUNT_KEY, current + 1);
}

export async function incrementStuckSessions(): Promise<void> {
  const current = await getCounter(OTA_STUCK_SESSIONS_KEY);
  await setCounter(OTA_STUCK_SESSIONS_KEY, current + 1);
}

export async function resetStuckCounters(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      OTA_ROLLBACK_COUNT_KEY,
      OTA_STUCK_SESSIONS_KEY,
      OTA_LAST_FETCHED_ID_KEY,
    ]);
  } catch {}
}

export async function clearOtaStuckState(): Promise<void> {
  await resetStuckCounters();
}

export async function isOtaStuck(): Promise<boolean> {
  try {
    const [rollbackCount, stuckSessions] = await Promise.all([
      getCounter(OTA_ROLLBACK_COUNT_KEY),
      getCounter(OTA_STUCK_SESSIONS_KEY),
    ]);
    return rollbackCount >= STUCK_THRESHOLD || stuckSessions >= STUCK_THRESHOLD;
  } catch {
    return false;
  }
}

export async function getOtaStuckCounters(): Promise<{
  rollbackCount: number;
  stuckSessions: number;
}> {
  const [rollbackCount, stuckSessions] = await Promise.all([
    getCounter(OTA_ROLLBACK_COUNT_KEY),
    getCounter(OTA_STUCK_SESSIONS_KEY),
  ]);
  return { rollbackCount, stuckSessions };
}

export async function getLastFetchedId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OTA_LAST_FETCHED_ID_KEY);
  } catch {
    return null;
  }
}

export async function setLastFetchedId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(OTA_LAST_FETCHED_ID_KEY, id);
  } catch {}
}
