import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import { useAuth } from "@/lib/auth-context";
import { useLocationGate } from "@/lib/location-context";
import { queryClient, apiRequest } from "@/lib/query-client";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { isTrackingActive, registerLayoutWatcherCallbacks } from "@/lib/tracking-active";
import { initCrashLogger, markClean } from "@/lib/crash-logger";
import {
  startBackgroundLocationTask,
  stopBackgroundLocationTask,
  isBackgroundLocationSupported,
} from "@/lib/background-location-task";
import Constants from "expo-constants";
import { getDeviceModel } from "@/lib/device-model";

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

// Module-level export so auth-context can read the current session ID
// before issuing the logout request (client-side per-session close).
let _currentSessionId: string | null = null;
export function getCurrentSessionId(): string | null { return _currentSessionId; }
export function clearCurrentSessionId(): void { _currentSessionId = null; }

async function sendHeartbeat() {
  try {
    const appVersion = Constants.expoConfig?.version ?? "0.0.0";
    const platform = Platform.OS;
    const deviceModel = getDeviceModel();
    const osVersion = Platform.Version != null ? String(Platform.Version) : null;
    const payload: Record<string, string> = { appVersion, platform };
    if (deviceModel) payload.deviceModel = deviceModel;
    if (osVersion) payload.osVersion = osVersion;
    // Include current sessionId so the server can update last_heartbeat_at per-session
    const sid = _currentSessionId;
    if (sid) payload.sessionId = sid;
    await apiRequest("POST", "/api/auth/heartbeat", payload);
  } catch {
    // no-op: ignore heartbeat failures
  }
}

async function startSession(): Promise<string | null> {
  try {
    const appVersion = Constants.expoConfig?.version ?? "0.0.0";
    const platform = Platform.OS;
    const deviceModel = getDeviceModel();
    const result = await apiRequest("POST", "/api/sessions/start", {
      appVersion,
      platform,
      deviceModel: deviceModel ?? null,
    }) as { sessionId?: string };
    return result?.sessionId ?? null;
  } catch {
    return null;
  }
}

async function endSession(sessionId: string, exitType: "background" | "logout" | "crash") {
  try {
    await apiRequest("POST", "/api/sessions/end", { sessionId, exitType });
  } catch {
    // no-op: ignore session end failures
  }
}

export function AppStateHandler() {
  const { user } = useAuth();
  const { hasBackgroundPermission } = useLocationGate();
  const appStateRef = useRef(AppState.currentState);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const nativeWatcherStartingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasBackgroundPermission && locationWatcherRef.current) {
      locationWatcherRef.current.remove();
      locationWatcherRef.current = null;
    }
  }, [hasBackgroundPermission]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function startNativeWatcher() {
      if (locationWatcherRef.current) return;
      if (hasBackgroundPermission) return;
      if (nativeWatcherStartingRef.current) {
        sendStartupBeacon("watch_position_concurrent_blocked");
        return;
      }
      nativeWatcherStartingRef.current = true;
      try {
        sendStartupBeacon("gps_check_start");
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        if (isTrackingActive()) return;
        sendStartupBeacon("watch_position_start");
        let cbFired = false;
        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 20,
          },
          async (loc) => {
            if (!cbFired) {
              cbFired = true;
              sendStartupBeacon("watch_position_callback");
            }
            try {
              await apiRequest("PUT", "/api/users/location", {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              });
            } catch {
              // no-op: ignore location update failures in foreground watcher
            }
          }
        );
      } catch {
        // no-op: ignore GPS permission or watcher failures
      } finally {
        nativeWatcherStartingRef.current = false;
      }
    }

    function stopNativeWatcher() {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    }

    registerLayoutWatcherCallbacks(stopNativeWatcher, () => {
      if (!locationWatcherRef.current && !hasBackgroundPermission) {
        startNativeWatcher();
      }
    });

    queryClient.prefetchQuery({ queryKey: ["/api/settings/music-provider"], staleTime: 120_000 }).catch(() => {});
    queryClient.prefetchQuery({ queryKey: ["/api/lastfm/status"], staleTime: 60_000 }).catch(() => {});

    initCrashLogger(user.id).catch(() => {});

    sendHeartbeat();
    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    sendStartupBeacon("app_state_handler_mount");
    startNativeWatcher();

    startSession().then((id) => {
      if (!cancelled) {
        sessionIdRef.current = id;
        _currentSessionId = id;
      }
    });

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const prev = appStateRef.current;

      if (nextAppState.match(/inactive|background/) && prev === "active") {
        apiRequest("POST", "/api/users/app-close").catch(() => {});
        const sid = sessionIdRef.current;
        if (sid) {
          sessionIdRef.current = null;
          _currentSessionId = null;
          endSession(sid, "background");
        }
      }

      if (prev.match(/inactive|background/) && nextAppState === "active") {
        sendHeartbeat();
        queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });

        if (!locationWatcherRef.current && !hasBackgroundPermission) {
          startNativeWatcher();
        }

        startSession().then((id) => {
          sessionIdRef.current = id;
          _currentSessionId = id;
        });
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      cancelled = true;
      subscription.remove();
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      stopNativeWatcher();
      markClean().catch(() => {});
      const sid = sessionIdRef.current;
      if (sid) {
        sessionIdRef.current = null;
        _currentSessionId = null;
        endSession(sid, "background");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) {
      resetCrashLogger();
    }
  }, [user]);

  useEffect(() => {
    if (!user || !hasBackgroundPermission) {
      stopBackgroundLocationTask().catch(() => {});
      return;
    }

    async function maybeStartBgTask() {
      try {
        const supported = await isBackgroundLocationSupported();
        if (!supported) return;

        let intervalSeconds = 30;
        let notificationText = "BikerLink: {motivo} — posizione attiva in background";
        try {
          const domain = process.env.EXPO_PUBLIC_DOMAIN || "biker-link.replit.app";
          const res = await fetch(`https://${domain}/api/admin/settings/bg-location`, {
            credentials: "include",
          });
          if (res.ok) {
            const settings = await res.json();
            if (settings.enabled === false) return;
            intervalSeconds = settings.intervalSeconds || 30;
            notificationText = settings.notificationText || notificationText;
          }
        } catch {
          // no-op: use default settings if fetch fails
        }

        await startBackgroundLocationTask(intervalSeconds, notificationText);
        sendStartupBeacon("bg_location_task_started");
      } catch {
        // no-op: ignore background task start failures
      }
    }

    maybeStartBgTask();
  }, [user, hasBackgroundPermission]);

  return null;
}
