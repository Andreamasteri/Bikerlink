import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKGROUND_LOCATION_TASK_NAME = "bikerlink-background-location";
export const GPS_PRECISION_STORAGE_KEY = "@bikerlink/gps_precision";

const SETTINGS_CACHE_KEY = "@bikerlink/bg_location_settings_cache";
const SETTINGS_CACHE_TS_KEY = "@bikerlink/bg_location_settings_ts";
const SETTINGS_TTL_MS = 5 * 60 * 1000;

export function gpsPrecisionToAccuracy(precision: string): import("expo-location").LocationAccuracy {
  const Location = require("expo-location") as typeof import("expo-location");
  if (precision === "lowest") return Location.Accuracy.Lowest;
  if (precision === "low") return Location.Accuracy.Low;
  if (precision === "high") return Location.Accuracy.High;
  if (precision === "highest") return Location.Accuracy.Highest;
  if (precision === "bestForNavigation") return Location.Accuracy.BestForNavigation;
  return Location.Accuracy.Balanced;
}

export async function isBackgroundLocationSupported(): Promise<boolean> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function startBackgroundLocationTask(
  intervalSeconds: number,
  notificationText: string,
  accuracy?: import("expo-location").LocationAccuracy
): Promise<boolean> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const isRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK_NAME);
    if (isRunning) return true;

    const supported = await isBackgroundLocationSupported();
    if (!supported) return false;

    const body = notificationText.replace("{motivo}", "monitoraggio attivo");

    const resolvedAccuracy = accuracy ?? Location.Accuracy.Balanced;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
      accuracy: resolvedAccuracy,
      timeInterval: intervalSeconds * 1000,
      distanceInterval: 10,
      foregroundService: {
        notificationTitle: "BikerLink — monitoraggio attivo",
        notificationBody: body,
        notificationColor: "#FF6600",
      },
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function restartBackgroundLocationTaskWithPrecision(
  precision: string
): Promise<boolean> {
  try {
    await stopBackgroundLocationTask();
    const domain = process.env.EXPO_PUBLIC_DOMAIN || "bikerlink.replit.app";
    const cached = await getCachedSettings();
    const config = cached || (await fetchAndCacheSettings(domain));
    if (!config.enabled) return false;
    const accuracy = gpsPrecisionToAccuracy(precision);
    return await startBackgroundLocationTask(config.intervalSeconds, config.notificationText, accuracy);
  } catch {
    return false;
  }
}

export async function stopBackgroundLocationTask(): Promise<void> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const isRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
    }
  } catch {
    // no-op: best-effort stopping location task
  }
}

async function getCachedSettings(): Promise<{
  enabled: boolean;
  trigger: string;
  intervalSeconds: number;
  notificationText: string;
  ghostModeContinue: boolean;
} | null> {
  try {
    const tsStr = await AsyncStorage.getItem(SETTINGS_CACHE_TS_KEY);
    if (tsStr) {
      const ts = parseInt(tsStr, 10);
      if (Date.now() - ts < SETTINGS_TTL_MS) {
        const cached = await AsyncStorage.getItem(SETTINGS_CACHE_KEY);
        if (cached) return JSON.parse(cached);
      }
    }
  } catch {
    // no-op: cache retrieval is best-effort
  }
  return null;
}

async function fetchAndCacheSettings(domain: string): Promise<{
  enabled: boolean;
  trigger: string;
  intervalSeconds: number;
  notificationText: string;
  ghostModeContinue: boolean;
}> {
  const defaults = {
    enabled: true,
    trigger: "always",
    intervalSeconds: 30,
    notificationText: "BikerLink — {motivo}: posizione attiva in background",
    ghostModeContinue: false,
  };
  try {
    const res = await fetch(`https://${domain}/api/settings/bg-location`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      await AsyncStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(SETTINGS_CACHE_TS_KEY, String(Date.now()));
      return data;
    }
  } catch {
    // no-op: settings fetching is best-effort, fallback used
  }
  return defaults;
}

TaskManager.defineTask(
  BACKGROUND_LOCATION_TASK_NAME,
  async ({
    data,
    error,
  }: {
    data: { locations: LocationObject[] };
    error: TaskManager.TaskManagerError | null;
  }) => {
  if (error) {
    return;
  }

  try {
    const { locations } = data;
    if (!locations || locations.length === 0) return;

    const location = locations[locations.length - 1];
    const domain = process.env.EXPO_PUBLIC_DOMAIN || "bikerlink.replit.app";

    const cached = await getCachedSettings();
    const settings = cached || (await fetchAndCacheSettings(domain));

    if (!settings.enabled) return;

    // ── Ownership contract ────────────────────────────────────────────────────
    // bikerlink-telemetry-bg is the sole GPS authority during a ride.
    // startTelemetryBackgroundTask() stops this task before the telemetry task
    // starts, and stopTelemetryBackgroundTask() restarts it afterwards, so in
    // practice this guard should rarely fire. It is kept as a second line of
    // defence: if the lifecycle coordination is bypassed (e.g. crash recovery),
    // we still avoid conflicting writes — raw OS GPS here vs. the smoothed
    // tracker point written by flushPoints every 15 s.
    const trackingActive = await AsyncStorage.getItem("@bikerlink/tracking_active");
    if (trackingActive === "true") {
      return;
    }

    if (!settings.ghostModeContinue) {
      const ghostMode = await AsyncStorage.getItem("@bikerlink/ghost_mode_active");
      if (ghostMode === "true") return;
    }

    if (settings.trigger === "tracking") {
      const isTracking = await AsyncStorage.getItem("@bikerlink/tracking_active");
      if (isTracking !== "true") return;
    } else if (settings.trigger === "sos") {
      const isSos = await AsyncStorage.getItem("@bikerlink/sos_active");
      if (isSos !== "true") return;
    } else if (settings.trigger === "tracking_or_sos") {
      const isTracking = await AsyncStorage.getItem("@bikerlink/tracking_active");
      const isSos = await AsyncStorage.getItem("@bikerlink/sos_active");
      if (isTracking !== "true" && isSos !== "true") return;
    }

    await fetch(`https://${domain}/api/users/location`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }),
    });
  } catch {
    // no-op: background location update is best-effort
  }
});
