import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const BG_LOCATION_TASK = "bikerlink-bg-location";

const STORAGE_KEY_INTERVAL = "bg_location_interval_seconds";
const STORAGE_KEY_ENABLED = "bg_location_enabled";
const STORAGE_KEY_TRIGGER = "bg_location_trigger";
const STORAGE_KEY_GHOST_CONTINUE = "bg_location_ghost_mode_continue";
const STORAGE_KEY_NOTIFICATION_TEXT = "bg_location_notification_text";
const STORAGE_KEY_ACTIVE_ROUTE = "bg_active_route_id";
const STORAGE_KEY_SOS_ACTIVE = "bg_sos_active";
const STORAGE_KEY_GHOST_MODE = "user_ghost_mode";
const STORAGE_KEY_API_URL = "api_base_url";

let lastSentTime = 0;

try { TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn("[BgLocation] task error:", error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  try {
    const [
      enabledRaw,
      triggerRaw,
      intervalRaw,
      ghostContinueRaw,
      activeRouteId,
      sosActiveRaw,
      ghostModeRaw,
      apiBaseUrl,
    ] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_ENABLED),
      AsyncStorage.getItem(STORAGE_KEY_TRIGGER),
      AsyncStorage.getItem(STORAGE_KEY_INTERVAL),
      AsyncStorage.getItem(STORAGE_KEY_GHOST_CONTINUE),
      AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ROUTE),
      AsyncStorage.getItem(STORAGE_KEY_SOS_ACTIVE),
      AsyncStorage.getItem(STORAGE_KEY_GHOST_MODE),
      AsyncStorage.getItem(STORAGE_KEY_API_URL),
    ]);

    const bgEnabled = enabledRaw !== "false";
    if (!bgEnabled) return;

    const trigger = triggerRaw || "always";
    const intervalSeconds = intervalRaw ? parseInt(intervalRaw, 10) : 30;
    const ghostModeContinue = ghostContinueRaw === "true";
    const isGhostMode = ghostModeRaw === "true";
    const isTrackingActive = !!activeRouteId;
    const isSosActive = sosActiveRaw === "true";

    if (isGhostMode && !ghostModeContinue) return;

    let shouldSend = false;
    switch (trigger) {
      case "always":
        shouldSend = true;
        break;
      case "tracking":
        shouldSend = isTrackingActive;
        break;
      case "sos":
        shouldSend = isSosActive;
        break;
      case "tracking_or_sos":
        shouldSend = isTrackingActive || isSosActive;
        break;
      default:
        shouldSend = true;
    }

    if (!shouldSend) return;

    const now = Date.now();
    const minInterval = Math.max(intervalSeconds * 1000, 10000);
    if (now - lastSentTime < minInterval) return;
    lastSentTime = now;

    const loc = locations[locations.length - 1];
    const baseUrl = apiBaseUrl || "";
    if (!baseUrl) return;

    const url = `${baseUrl}/api/location/bg-update`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude,
        accuracy: loc.coords.accuracy,
        timestamp: new Date(loc.timestamp).toISOString(),
        activeRouteId: activeRouteId || null,
        isSosActive,
        isGhostMode,
      }),
    });
  } catch (err) {
    console.warn("[BgLocation] send error:", err);
  }
}); } catch (e) { console.warn("[BgLocation] defineTask non supportato su questa build:", e); }

export interface BgLocationConfig {
  enabled: boolean;
  trigger: string;
  intervalSeconds: number;
  notificationText: string;
  ghostModeContinue: boolean;
}

function buildNotificationBody(
  notificationText: string,
  isTrackingActive: boolean,
  isSosActive: boolean
): string {
  let motivo = "monitoraggio generale";
  if (isTrackingActive && isSosActive) {
    motivo = "tracciamento percorso + SOS attivo";
  } else if (isTrackingActive) {
    motivo = "tracciamento percorso in moto";
  } else if (isSosActive) {
    motivo = "emergenza SOS attiva";
  }
  return notificationText.replace("{motivo}", motivo);
}

export async function startBgLocationTask(config: BgLocationConfig): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    await AsyncStorage.setItem(STORAGE_KEY_ENABLED, config.enabled ? "true" : "false");
    await AsyncStorage.setItem(STORAGE_KEY_TRIGGER, config.trigger);
    await AsyncStorage.setItem(STORAGE_KEY_INTERVAL, String(config.intervalSeconds));
    await AsyncStorage.setItem(STORAGE_KEY_GHOST_CONTINUE, config.ghostModeContinue ? "true" : "false");
    await AsyncStorage.setItem(STORAGE_KEY_NOTIFICATION_TEXT, config.notificationText);

    if (!config.enabled) {
      await stopBgLocationTask();
      return;
    }

    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== "granted") return;

    const isAlreadyRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (isAlreadyRunning) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {});
    }

    const activeRouteRaw = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ROUTE);
    const sosActiveRaw = await AsyncStorage.getItem(STORAGE_KEY_SOS_ACTIVE);
    const isTrackingActive = !!activeRouteRaw;
    const isSosActive = sosActiveRaw === "true";

    const notificationBody = buildNotificationBody(config.notificationText, isTrackingActive, isSosActive);

    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: Math.max(config.intervalSeconds * 1000, 10000),
      distanceInterval: 20,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "BikerLink",
        notificationBody,
        notificationColor: "#E63946",
      },
      pausesUpdatesAutomatically: false,
    });
  } catch (err) {
    console.warn("[BgLocation] start error:", err);
  }
}

export async function stopBgLocationTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } catch (err) {
    console.warn("[BgLocation] stop error:", err);
  }
}

export async function updateBgTaskNotification(
  notificationText: string,
  isTrackingActive: boolean,
  isSosActive: boolean
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (!isRunning) return;

    const enabledRaw = await AsyncStorage.getItem(STORAGE_KEY_ENABLED);
    const triggerRaw = await AsyncStorage.getItem(STORAGE_KEY_TRIGGER);
    const intervalRaw = await AsyncStorage.getItem(STORAGE_KEY_INTERVAL);
    const ghostContinueRaw = await AsyncStorage.getItem(STORAGE_KEY_GHOST_CONTINUE);
    const storedText = await AsyncStorage.getItem(STORAGE_KEY_NOTIFICATION_TEXT);

    const text = storedText || notificationText;
    const notificationBody = buildNotificationBody(text, isTrackingActive, isSosActive);

    await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {});
    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: Math.max((intervalRaw ? parseInt(intervalRaw, 10) : 30) * 1000, 10000),
      distanceInterval: 20,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "BikerLink",
        notificationBody,
        notificationColor: "#E63946",
      },
      pausesUpdatesAutomatically: false,
    });

    await AsyncStorage.setItem(STORAGE_KEY_ENABLED, enabledRaw ?? "true");
    await AsyncStorage.setItem(STORAGE_KEY_TRIGGER, triggerRaw ?? "always");
    await AsyncStorage.setItem(STORAGE_KEY_INTERVAL, intervalRaw ?? "30");
    await AsyncStorage.setItem(STORAGE_KEY_GHOST_CONTINUE, ghostContinueRaw ?? "false");
    await AsyncStorage.setItem(STORAGE_KEY_NOTIFICATION_TEXT, text);
  } catch (err) {
    console.warn("[BgLocation] update notification error:", err);
  }
}

export async function setBgActiveRoute(routeId: string | null): Promise<void> {
  if (routeId) {
    await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ROUTE, routeId);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ROUTE);
  }
}

export async function setBgSosActive(active: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_SOS_ACTIVE, active ? "true" : "false");
}
