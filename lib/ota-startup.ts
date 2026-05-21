import * as Updates from "expo-updates";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OTA_PENDING_KEY, reportOtaEvent } from "@/lib/ota-check";

/**
 * Called at cold-start by OtaStartupChecker.
 *
 * If OTA_PENDING_KEY is set (a previous session fetched an update but
 * reloadAsync() never ran — common on Android where the background-listener
 * is unreliable), apply it immediately before the 3-second startup timer.
 *
 * Key invariant: removeItem is called ONLY inside the .then() of a successful
 * reloadAsync(), never in .catch(). If the reload throws the flag survives so
 * the next cold-start can retry automatically. Errors are reported via
 * reportOtaEvent so they appear in the admin OTA dashboard.
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
    if (pending === "1" && isMounted()) {
      Updates.reloadAsync()
        .then(() => {
          AsyncStorage.removeItem(OTA_PENDING_KEY).catch(() => {});
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          reportOtaEvent({
            phase: "reload-failed",
            source: "startup",
            currentUpdateId: Updates.updateId ?? "embedded",
            runtimeVersion: Updates.runtimeVersion ?? "unknown",
            error: `[reload-failed/startup] ${msg}`.substring(0, 500),
          });
        });
      return true;
    }
  } catch {}
  return false;
}
