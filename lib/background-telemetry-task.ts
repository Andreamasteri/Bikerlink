import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TelemetrySample } from "@shared/tracking-fusion";
import { stopBackgroundLocationTask } from "./background-location-task";
import { locationSessionManager } from "./location-session-manager";

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

    // Stop the social location task before starting high-frequency telemetry.
    // Both tasks share the GPS hardware; running them in parallel drains battery
    // and causes conflicting location writes to /api/users/location.
    // Ownership contract: telemetry task is the sole GPS authority during rides;
    // the social location task (bikerlink-background-location) must not run
    // concurrently. The social task already skips its API write when
    // @bikerlink/tracking_active is set, but stopping it entirely eliminates
    // the unnecessary OS wakeups as well.
    await stopBackgroundLocationTask();

    return await locationSessionManager.startBackgroundTask(TASK_TELEMETRY, {
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
  } catch {
    return false;
  }
}

export async function stopTelemetryBackgroundTask(): Promise<void> {
  // NOTE: do NOT restart the social location task here.
  // This function is called from both the toForeground transition (ride still
  // active, app resumed to foreground) and the stop transition (ride ended).
  // Restarting the social task here would wrongly re-enable it mid-ride.
  // The restart is handled exclusively in finishSession (useTelemetry.ts),
  // which is only called at true ride-end.
  try {
    await locationSessionManager.stopBackgroundTask(TASK_TELEMETRY);
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
