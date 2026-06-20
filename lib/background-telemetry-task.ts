import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TelemetrySample } from "@shared/tracking-fusion";

export const TASK_TELEMETRY = "bikerlink-telemetry-bg";

// AsyncStorage keys shared with useTelemetry
export const BG_TELEMETRY_BUFFER_KEY  = "@bikerlink/telemetry_bg_buffer";
export const BG_TELEMETRY_SESSION_KEY = "@bikerlink/telemetry_bg_session";

// Cap background buffer at ~8 min (500 samples @ 1 Hz) to avoid unbounded growth
const BG_BUFFER_MAX = 500;

// Canonical telemetry sample shape from @shared/tracking-fusion (single source
// of truth). The background task always writes a GPS fix, so lat/lon are numbers
// here even though the shared type allows null for sensor-only samples.
type BgTelemetrySample = TelemetrySample;

// ── Start / stop helpers called from useTelemetry ──────────────────────────────

export async function startTelemetryBackgroundTask(): Promise<boolean> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== "granted") return false;

    const isRunning = await TaskManager.isTaskRegisteredAsync(TASK_TELEMETRY);
    if (isRunning) return true;

    await Location.startLocationUpdatesAsync(TASK_TELEMETRY, {
      accuracy:         Location.Accuracy.BestForNavigation,
      timeInterval:     1000,
      distanceInterval: 0,
      foregroundService: {
        notificationTitle: "BikerLink — registrazione percorso",
        notificationBody:  "Raccolta dati telemetria in corso",
        notificationColor: "#FF6600",
      },
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopTelemetryBackgroundTask(): Promise<void> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const isRunning = await TaskManager.isTaskRegisteredAsync(TASK_TELEMETRY);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(TASK_TELEMETRY);
    }
  } catch {
    // no-op: best-effort stopping telemetry task
  }
}

/** Reads and clears the AsyncStorage buffer written by the background task. */
export async function drainBackgroundTelemetryBuffer(): Promise<BgTelemetrySample[]> {
  try {
    const raw = await AsyncStorage.getItem(BG_TELEMETRY_BUFFER_KEY);
    if (!raw) return [];
    const samples: BgTelemetrySample[] = JSON.parse(raw);
    await AsyncStorage.removeItem(BG_TELEMETRY_BUFFER_KEY);
    return samples;
  } catch {
    // no-op: buffer recovery is best-effort
    return [];
  }
}

// ── Background task definition ─────────────────────────────────────────────────
// This must be called at module load time (top-level), before the app renders.
TaskManager.defineTask(
  TASK_TELEMETRY,
  async ({
    data,
    error,
  }: {
    data: { locations: LocationObject[] };
    error: TaskManager.TaskManagerError | null;
  }) => {
    if (error) return;

    try {
      // Only collect if an active telemetry session has been registered
      const sessionId = await AsyncStorage.getItem(BG_TELEMETRY_SESSION_KEY);
      if (!sessionId) return;

      const { locations } = data;
      if (!locations || locations.length === 0) return;

      // Take the most recent fix
      const loc = locations[locations.length - 1];
      const { latitude, longitude, altitude, speed, heading } = loc.coords;

      const sample: BgTelemetrySample = {
        ts:  loc.timestamp,
        lat: latitude,
        lon: longitude,
      };

      if (speed != null && speed >= 0) sample.speed_kmh = speed * 3.6;
      if (altitude != null)            sample.altitude_m = altitude;
      if (heading != null && heading >= 0) sample.heading = heading;

      // Append to buffer (with cap to avoid memory bloat)
      const raw = await AsyncStorage.getItem(BG_TELEMETRY_BUFFER_KEY);
      const buffer: BgTelemetrySample[] = raw ? JSON.parse(raw) : [];
      buffer.push(sample);
      if (buffer.length > BG_BUFFER_MAX) {
        buffer.splice(0, buffer.length - BG_BUFFER_MAX);
      }
      await AsyncStorage.setItem(BG_TELEMETRY_BUFFER_KEY, JSON.stringify(buffer));
    } catch {
      // no-op: telemetry collection is best-effort
    }
  }
);
