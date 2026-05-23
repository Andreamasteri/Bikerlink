import * as Updates from "expo-updates";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OTA_PENDING_KEY, reportOtaEvent } from "@/lib/ota-check";

/**
 * AsyncStorage key tracking how many consecutive times reloadAsync() has
 * failed for the current OTA_PENDING_KEY. Cleared on successful reload or
 * when the circuit-breaker threshold is reached (flag is abandoned).
 */
const OTA_RELOAD_FAIL_COUNT_KEY = "@bikerlink/ota_reload_fail_count";

/**
 * Maximum consecutive reloadAsync() failures before we give up and clear
 * OTA_PENDING_KEY so the app can boot normally.
 */
const MAX_RELOAD_ATTEMPTS = 3;

async function getReloadFailCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(OTA_RELOAD_FAIL_COUNT_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

async function incrementReloadFailCount(): Promise<number> {
  const current = await getReloadFailCount();
  const next = current + 1;
  try {
    await AsyncStorage.setItem(OTA_RELOAD_FAIL_COUNT_KEY, String(next));
  } catch {}
  return next;
}

async function clearReloadFailCount(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OTA_RELOAD_FAIL_COUNT_KEY);
  } catch {}
}

/**
 * Called at cold-start by OtaStartupChecker.
 *
 * If OTA_PENDING_KEY is set (a previous session fetched an update but
 * reloadAsync() never ran — common on Android where the background-listener
 * is unreliable), apply it immediately before the 3-second startup timer.
 *
 * Circuit-breaker: if reloadAsync() fails MAX_RELOAD_ATTEMPTS times in a row,
 * both OTA_PENDING_KEY and the fail counter are cleared so the app can boot
 * normally instead of looping forever on a broken update.
 *
 * Key invariant: OTA_PENDING_KEY is only removed on successful reload or after
 * MAX_RELOAD_ATTEMPTS failures. Errors are reported via reportOtaEvent so they
 * appear in the admin OTA dashboard.
 *
 * Returns true when a pending reload was triggered (caller should skip the
 * normal 3-second OTA check timer).
 */
export async function applyPendingOtaIfNeeded(
  isMounted: () => boolean,
): Promise<boolean> {
  if (__DEV__ || Platform.OS === "web") return false;
  try {
    const pending = await AsyncStorage.getItem(OTA_PENDING_KEY);
    if (pending !== "1") {
      // No pending reload — clear any stale fail counter so it doesn't
      // carry over into a future pending update.
      clearReloadFailCount().catch(() => {});
      return false;
    }
    if (!isMounted()) return false;

    const failCount = await getReloadFailCount();
    if (failCount >= MAX_RELOAD_ATTEMPTS) {
      // Circuit-breaker: too many consecutive failures — abandon this pending
      // reload so the app can boot normally.
      reportOtaEvent({
        phase: "reload-failed",
        source: "startup",
        currentUpdateId: Updates.updateId ?? "embedded",
        runtimeVersion: Updates.runtimeVersion ?? "unknown",
        error: `[reload-failed/startup] circuit-breaker: ${failCount} consecutive failures, clearing flag`,
      });
      await Promise.allSettled([
        AsyncStorage.removeItem(OTA_PENDING_KEY),
        clearReloadFailCount(),
      ]);
      return false;
    }

    try {
      Updates.reloadAsync()
        .then(() => {
          // Success: clear both the pending flag and the failure counter.
          Promise.allSettled([
            AsyncStorage.removeItem(OTA_PENDING_KEY),
            clearReloadFailCount(),
          ]).catch(() => {});
        })
        .catch(async (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          const newCount = await incrementReloadFailCount();
          reportOtaEvent({
            phase: "reload-failed",
            source: "startup",
            currentUpdateId: Updates.updateId ?? "embedded",
            runtimeVersion: Updates.runtimeVersion ?? "unknown",
            error: `[reload-failed/startup] attempt ${newCount}/${MAX_RELOAD_ATTEMPTS}: ${msg}`.substring(0, 500),
          });
          // Circuit-breaker: clear pending flag immediately on the final failure
          // so the next cold start does not loop again on a broken update.
          if (newCount >= MAX_RELOAD_ATTEMPTS) {
            Promise.allSettled([
              AsyncStorage.removeItem(OTA_PENDING_KEY),
              clearReloadFailCount(),
            ]).catch(() => {});
          }
        });
    } catch (syncErr: unknown) {
      // reloadAsync() itself threw synchronously (should not happen, but guard it)
      const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      const newCount = await incrementReloadFailCount();
      reportOtaEvent({
        phase: "reload-failed",
        source: "startup",
        currentUpdateId: Updates.updateId ?? "embedded",
        runtimeVersion: Updates.runtimeVersion ?? "unknown",
        error: `[reload-failed/startup/sync] attempt ${newCount}/${MAX_RELOAD_ATTEMPTS}: ${msg}`.substring(0, 500),
      });
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
