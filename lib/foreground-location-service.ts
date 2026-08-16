import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import type { LocationObject } from "expo-location";
import { locationSessionManager } from "./location-session-manager";

export const FOREGROUND_LOCATION_TASK_NAME = "bikerlink-foreground-service";
export const FOREGROUND_SERVICE_DISABLED_KEY = "@bikerlink/foreground_service_disabled";

const FOREGROUND_INTERVAL_MS = 10_000;

export async function isForegroundLocationServiceRunning(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(FOREGROUND_LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export async function startForegroundLocationService(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const running = await TaskManager.isTaskRegisteredAsync(FOREGROUND_LOCATION_TASK_NAME);
    if (running) return true;
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return false;
    return await locationSessionManager.startBackgroundTask(FOREGROUND_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: FOREGROUND_INTERVAL_MS,
      distanceInterval: 10,
      foregroundService: {
        notificationTitle: "BikerLink",
        notificationBody: "BikerLink sta usando il GPS",
        notificationColor: "#FF6600",
        killServiceOnDestroy: false,
      },
    });
  } catch {
    return false;
  }
}

export async function stopForegroundLocationService(): Promise<void> {
  try {
    await locationSessionManager.stopBackgroundTask(FOREGROUND_LOCATION_TASK_NAME);
  } catch {
    // no-op: best-effort stop
  }
}

TaskManager.defineTask(
  FOREGROUND_LOCATION_TASK_NAME,
  async ({
    data,
    error,
  }: {
    data: { locations: LocationObject[] };
    error: TaskManager.TaskManagerError | null;
  }) => {
    if (error) return;
    try {
      const { locations } = data;
      if (!locations || locations.length === 0) return;
      const location = locations[locations.length - 1];
      const domain = process.env.EXPO_PUBLIC_DOMAIN || "biker-link.net";
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
  }
);
