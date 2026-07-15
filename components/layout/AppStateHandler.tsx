import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useLocationGate } from "@/lib/location-context";
import { queryClient, apiRequest } from "@/lib/query-client";
import { subscribeReconnect } from "@/lib/online-focus-manager";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { isTrackingActive, registerLayoutWatcherCallbacks } from "@/lib/tracking-active";
import { initCrashLogger, markClean, resetCrashLogger, markAsyncError } from "@/lib/crash-logger";
import {
  startBackgroundLocationTask,
  stopBackgroundLocationTask,
  isBackgroundLocationSupported,
  gpsPrecisionToAccuracy,
  GPS_PRECISION_STORAGE_KEY,
} from "@/lib/background-location-task";
import {
  startForegroundLocationService,
  stopForegroundLocationService,
  FOREGROUND_SERVICE_DISABLED_KEY,
} from "@/lib/foreground-location-service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceModel } from "@/lib/device-model";
import { getReliableAppVersion } from "@/lib/device-info";

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
const SOCIAL_LOCATION_THROTTLE_MS = 30000;
// Resume-path network calls must never hang on poor/absent network. Each is
// given an explicit timeout so a stalled request fails fast and silently
// instead of leaving a dangling promise that can surface as a crash.
const RESUME_NET_TIMEOUT_MS = 8000;

// Module-level export so auth-context can read the current session ID
// before issuing the logout request (client-side per-session close).
let _currentSessionId: string | null = null;
export function getCurrentSessionId(): string | null { return _currentSessionId; }
export function clearCurrentSessionId(): void { _currentSessionId = null; }

// Task #5298 — segnala al server che l'app PRINCIPALE è in foreground. Il Bowie
// Terminal standalone legge questo segnale per auto-chiudersi. Best-effort: un
// fallimento (rete lenta/assente) degrada in silenzio e viene ritentato al
// prossimo foreground.
async function signalMainAppForeground() {
  try {
    await apiRequest("POST", "/api/users/me/main-app-foreground", undefined, { timeoutMs: RESUME_NET_TIMEOUT_MS });
  } catch {
    // no-op: ritentato al prossimo resume in foreground
  }
}

async function sendHeartbeat() {
  try {
    const appVersion = getReliableAppVersion();
    const platform = Platform.OS;
    const deviceModel = getDeviceModel();
    const osVersion = Platform.Version != null ? String(Platform.Version) : null;
    const payload: Record<string, string> = { appVersion, platform };
    if (deviceModel) payload.deviceModel = deviceModel;
    if (osVersion) payload.osVersion = osVersion;
    // Include current sessionId so the server can update last_heartbeat_at per-session
    const sid = _currentSessionId;
    if (sid) payload.sessionId = sid;
    await apiRequest("POST", "/api/auth/heartbeat", payload, { timeoutMs: RESUME_NET_TIMEOUT_MS });
  } catch {
    // no-op: ignore heartbeat failures (network down/slow → retried on next interval)
  }
}

async function startSession(): Promise<string | null> {
  try {
    const appVersion = getReliableAppVersion();
    const platform = Platform.OS;
    const deviceModel = getDeviceModel();
    const result = await apiRequest("POST", "/api/sessions/start", {
      appVersion,
      platform,
      deviceModel: deviceModel ?? null,
    }, { timeoutMs: RESUME_NET_TIMEOUT_MS }) as { sessionId?: string };
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
  const { hasBackgroundPermission, currentPosition } = useLocationGate();
  const appStateRef = useRef(AppState.currentState);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastSocialUpdateRef = useRef<number>(0);
  const socialPausedRef = useRef<boolean>(false);
  const fgStartRef = useRef<number | null>(null);
  const stateTransitionCountRef = useRef<number>(0);

  useEffect(() => {
    registerLayoutWatcherCallbacks(
      () => { socialPausedRef.current = true; },
      () => { socialPausedRef.current = false; }
    );
  }, []);

  useEffect(() => {
    if (!user || !currentPosition || hasBackgroundPermission) return;
    if (isTrackingActive() || socialPausedRef.current) return;

    const now = Date.now();
    if (now - lastSocialUpdateRef.current < SOCIAL_LOCATION_THROTTLE_MS) return;

    lastSocialUpdateRef.current = now;
    const lat = currentPosition.latitude;
    const lng = currentPosition.longitude;
    (async () => {
      const ghost = await AsyncStorage.getItem("@bikerlink/ghost_mode_active").catch(() => null);
      if (ghost === "true") return;
      await apiRequest("PUT", "/api/users/location", { latitude: lat, longitude: lng }).catch(() => {});
    })();
  }, [user, currentPosition, hasBackgroundPermission]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    queryClient.prefetchQuery({ queryKey: ["/api/settings/music-provider"], staleTime: 120_000 }).catch(() => {});
    queryClient.prefetchQuery({ queryKey: ["/api/lastfm/status"], staleTime: 60_000 }).catch(() => {});

    initCrashLogger(user.id).catch(() => {});

    sendHeartbeat();
    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Task #5298 — apertura dell'app principale: notifica il server così il
    // Bowie Terminal standalone (stesso account) può auto-chiudersi.
    signalMainAppForeground();

    sendStartupBeacon("app_state_handler_mount");

    startSession().then((id) => {
      if (!cancelled) {
        sessionIdRef.current = id;
        _currentSessionId = id;
      }
    });

    fgStartRef.current = Date.now();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // The whole handler is wrapped so a synchronous throw can never escape the
      // native AppState callback (which the React ErrorBoundary cannot catch).
      try {
        const prev = appStateRef.current;
        const transitionId = ++stateTransitionCountRef.current;
        const transitionAt = new Date().toISOString();

        // Canonical transition beacon (task contract: prev/new state + foreground
        // duration) emitted for every change so a freeze can be correlated with an
        // AppState switch. Computed before the branches reset fgStartRef.
        const leavingForeground = !!nextAppState.match(/inactive|background/) && prev === "active";
        const transitionFgDurationMs =
          leavingForeground && fgStartRef.current ? Date.now() - fgStartRef.current : null;
        sendStartupBeacon("appstate_transition", {
          prevState: prev,
          newState: nextAppState,
          transitionId,
          transitionAt,
          fgDurationMs: transitionFgDurationMs,
        });

        if (nextAppState.match(/inactive|background/) && prev === "active") {
          const fgDurationMs = fgStartRef.current ? Date.now() - fgStartRef.current : null;
          fgStartRef.current = null;
          sendStartupBeacon("appstate_to_background", {
            prev,
            next: nextAppState,
            transitionId,
            transitionAt,
            fgDurationMs,
          });
          apiRequest("POST", "/api/users/app-close", undefined, { timeoutMs: RESUME_NET_TIMEOUT_MS }).catch(() => {});
          const sid = sessionIdRef.current;
          if (sid) {
            sessionIdRef.current = null;
            _currentSessionId = null;
            endSession(sid, "background");
          }
        }

        if (prev.match(/inactive|background/) && nextAppState === "active") {
          fgStartRef.current = Date.now();
          sendStartupBeacon("appstate_to_foreground", {
            prev,
            next: nextAppState,
            transitionId,
            transitionAt,
          });
          // Every resume operation is individually guarded so a single failure
          // (network timeout, rejected refetch) degrades silently and is retried
          // on the next interval/resume, rather than propagating as a fatal
          // unhandled rejection that closes the app.
          sendHeartbeat().catch(() => {});

          // Task #5298 — resume in foreground dell'app principale: ri-notifica
          // il server per l'auto-chiusura del Bowie Terminal standalone.
          signalMainAppForeground().catch(() => {});

          const invalidate = (queryKey: string[]) =>
            queryClient.invalidateQueries({ queryKey }).catch(() => {});
          invalidate(["/api/users/profile"]);
          invalidate(["/api/users/online-count"]);
          invalidate(["/api/users/biker-available-count"]);
          invalidate(["/api/users/zavorrine-available-count"]);
          invalidate(["/api/users/biker-available-list"]);
          invalidate(["/api/users/zavorrine-available-list"]);

          startSession()
            .then((id) => {
              sessionIdRef.current = id;
              _currentSessionId = id;
            })
            .catch(() => {});
        }

        appStateRef.current = nextAppState;
      } catch (e) {
        // Last-resort safety net: record and swallow so the app stays alive.
        appStateRef.current = nextAppState;
        markAsyncError("app_state_handler", e).catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      markClean().catch(() => {});
      const sid = sessionIdRef.current;
      if (sid) {
        sessionIdRef.current = null;
        _currentSessionId = null;
        endSession(sid, "background");
      }
    };
  }, [user]);

  // Relaunch the NON-React-Query resume flows (heartbeat, session start) on the
  // offline→online transition. onlineManager pauses/resumes React Query but does
  // not touch these imperative flows, so they need an explicit reconnect trigger.
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeReconnect(() => {
      // Only relaunch foreground resume flows when the app is actually in the
      // foreground — a reconnect while backgrounded must not churn heartbeat/
      // session-start (the background task / next resume handles that path).
      if (AppState.currentState !== "active") return;
      try {
        sendHeartbeat().catch(() => {});
        startSession()
          .then((id) => {
            sessionIdRef.current = id;
            _currentSessionId = id;
          })
          .catch(() => {});
      } catch (e) {
        markAsyncError("app_state_reconnect", e).catch(() => {});
      }
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) {
      resetCrashLogger();
    }
  }, [user]);

  useEffect(() => {
    if (!user || Platform.OS !== "android" || hasBackgroundPermission) {
      stopForegroundLocationService().catch(() => {});
      return;
    }

    AsyncStorage.getItem(FOREGROUND_SERVICE_DISABLED_KEY)
      .then((disabled) => {
        if (disabled !== "true") {
          startForegroundLocationService().catch(() => {});
          sendStartupBeacon("foreground_location_service_started");
        }
      })
      .catch(() => {});

    return () => {
      stopForegroundLocationService().catch(() => {});
    };
  }, [user, hasBackgroundPermission]);

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
          const domain = process.env.EXPO_PUBLIC_DOMAIN || "bikerlink.replit.app";
          const res = await fetch(`https://${domain}/api/settings/bg-location`, {
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

        let gpsPrecision = await AsyncStorage.getItem(GPS_PRECISION_STORAGE_KEY).catch(() => null);
        if (!gpsPrecision) {
          try {
            const domain = process.env.EXPO_PUBLIC_DOMAIN || "bikerlink.replit.app";
            const meRes = await fetch(`https://${domain}/api/users/me`, { credentials: "include" });
            if (meRes.ok) {
              const meData = await meRes.json();
              gpsPrecision = meData?.profile?.gpsPrecision ?? null;
              if (gpsPrecision) {
                await AsyncStorage.setItem(GPS_PRECISION_STORAGE_KEY, gpsPrecision).catch(() => {});
              }
            }
          } catch {
            // no-op: fallback to default
          }
        }
        const bgAccuracy = gpsPrecisionToAccuracy(gpsPrecision ?? "balanced");
        await startBackgroundLocationTask(intervalSeconds, notificationText, bgAccuracy);
        sendStartupBeacon("bg_location_task_started");
      } catch {
        // no-op: ignore background task start failures
      }
    }

    maybeStartBgTask();
  }, [user, hasBackgroundPermission]);

  return null;
}
