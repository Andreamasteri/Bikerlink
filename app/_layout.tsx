import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/query-client";
import { Platform, AppState, ActivityIndicator, View, Text, StyleSheet } from "react-native";
import NativeUpdateChecker from "@/components/NativeUpdateChecker";
import MatchPopupAlert from "@/components/MatchPopupAlert";
import UpdateNudgeModal from "@/components/UpdateNudgeModal";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import AlwaysPermissionNotice from "@/components/AlwaysPermissionNotice";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { triggerOtaCheck } from "@/lib/ota-check";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {}


if (Platform.OS === "web" && typeof window !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);

  window.addEventListener("unhandledrejection", (event) => {
    const msg: string = event?.reason?.message ?? "";
    if (msg.includes("timeout exceeded") || msg.includes("fontfaceobserver")) {
      event.preventDefault();
    }
  });

  window.addEventListener("error", (event) => {
    const msg: string = event?.message ?? "";
    if (msg.includes("timeout exceeded") || msg.includes("fontfaceobserver")) {
      event.preventDefault();
      return true;
    }
  });
}
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient, apiRequest } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ChatSseProvider } from "@/lib/chat-sse-provider";
import { LocationProvider, useLocationGate } from "@/lib/location-context";
import { LanguageProvider, useLanguage } from "@/lib/language-context";
import { MapSettingsProvider, useMapConfig } from "@/lib/map-context";
import { TaskbarStyleProvider } from "@/lib/taskbar-style-context";
import { ThemeProvider, useTheme } from "@/lib/theme-context";
import { UnitsProvider } from "@/lib/units-context";
import { PlayerProvider } from "@/lib/player-context";
import { FloatingWidgetProvider } from "@/lib/floating-widget-context";
import FloatingWidget from "@/components/FloatingWidget";
import UptimeWidget from "@/components/UptimeWidget";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendStartupBeacon, recoverLastBeacon } from "@/lib/startup-beacon";
import { isTrackingActive, registerLayoutWatcherCallbacks } from "@/lib/tracking-active";
import { initCrashLogger, resetCrashLogger, markClean } from "@/lib/crash-logger";
import {
  BACKGROUND_LOCATION_TASK_NAME,
  startBackgroundLocationTask,
  stopBackgroundLocationTask,
  isBackgroundLocationSupported,
} from "@/lib/background-location-task";

SplashScreen.preventAutoHideAsync();

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
async function sendHeartbeat() {
  try {
    const appVersion = Constants.expoConfig?.version ?? "0.0.0";
    const platform = Platform.OS;
    await apiRequest("POST", "/api/auth/heartbeat", { appVersion, platform, otaNumber: CURRENT_OTA_NUMBER });
  } catch {}
}

async function sendWebLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  try {
    const coords = await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 60000 }
      );
    });
    if (coords) {
      await apiRequest("PUT", "/api/users/location", coords);
    }
  } catch {}
}

function AppStateHandler() {
  const { user } = useAuth();
  const { hasBackgroundPermission } = useLocationGate();
  const appStateRef = useRef(AppState.currentState);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webLocationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const nativeWatcherStartingRef = useRef(false);

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
            } catch {}
          }
        );
      } catch {
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
    if (Platform.OS === "web") {
      sendWebLocation();
      webLocationTimerRef.current = setInterval(sendWebLocation, 30000);
    } else {
      startNativeWatcher();
    }

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const prev = appStateRef.current;

      if (nextAppState.match(/inactive|background/) && prev === "active") {
        apiRequest("POST", "/api/users/app-close").catch(() => {});
      }

      if (prev.match(/inactive|background/) && nextAppState === "active") {
        sendHeartbeat();
        queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });

        if (Platform.OS === "web") {
          sendWebLocation();
        } else {
          if (!locationWatcherRef.current && !hasBackgroundPermission) {
            startNativeWatcher();
          }
        }
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      cancelled = true;
      subscription.remove();
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (webLocationTimerRef.current) clearInterval(webLocationTimerRef.current);
      stopNativeWatcher();
      markClean().catch(() => {});
      resetCrashLogger();
    };
  }, [user]);

  useEffect(() => {
    if (Platform.OS === "web") return;
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
        } catch {}

        await startBackgroundLocationTask(intervalSeconds, notificationText);
        sendStartupBeacon("bg_location_task_started");
      } catch {}
    }

    maybeStartBgTask();
  }, [user, hasBackgroundPermission]);

  return null;
}

function GpsAlwaysGate({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { hasBackgroundPermission, backgroundPermissionChecked, backgroundPermissionRevoked } = useLocationGate();
  const [dismissed, setDismissed] = useState(false);

  if (Platform.OS === "web" || !isAuthenticated || !backgroundPermissionChecked || hasBackgroundPermission) return null;
  if (!dismissed) return <AlwaysPermissionNotice onDismiss={() => setDismissed(true)} />;
  if (backgroundPermissionRevoked) return <BackgroundRevocationBanner />;
  return null;
}

function GpsAlwaysGateWrapper() {
  const { user } = useAuth();
  return <GpsAlwaysGate key={user?.id ?? "logged-out"} isAuthenticated={!!user} />;
}

function BackgroundRevocationBanner() {
  const { backgroundPermissionRevoked } = useLocationGate();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (backgroundPermissionRevoked) {
      stopBackgroundLocationTask().catch(() => {});
    }
  }, [backgroundPermissionRevoked]);

  if (!backgroundPermissionRevoked || Platform.OS === "web") return null;

  return (
    <View
      style={[
        revocationBannerStyles.banner,
        { top: insets.top, backgroundColor: colors.accent },
      ]}
    >
      <Text style={revocationBannerStyles.text}>
        Posizione in background disattivata — vai in Impostazioni {">"} Permessi {">"} Sempre
      </Text>
    </View>
  );
}

function StartupGate({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  if (!ready) return null;
  return <>{children}</>;
}

function MapReadyGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isLoading } = useMapConfig();
  const { colors } = useTheme();
  if (user && isLoading) {
    return (
      <View style={[styles.mapGateLoader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

function OtaStartupChecker() {
  useEffect(() => {
    const timer = setTimeout(() => {
      triggerOtaCheck("startup");
    }, 3000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") triggerOtaCheck("appstate");
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return null;
}

function navigateFromNotifData(data: { type?: string; unreadChat?: number } | undefined, router: ReturnType<typeof useRouter>) {
  if (data?.type === "match") {
    router.push("/(tabs)/match");
    return;
  }
  if (data?.type !== "background_badge") return;
  if ((data?.unreadChat ?? 0) > 0) {
    router.push("/(tabs)/chat");
  } else {
    router.push("/notifications");
  }
}

function BackgroundNotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Notifications) return;

    (async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          const data = lastResponse.notification.request.content.data as { type?: string; unreadChat?: number } | undefined;
          navigateFromNotifData(data, router);
        }
      } catch {}
    })();

    let sub: { remove: () => void } | null = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { type?: string; unreadChat?: number } | undefined;
        navigateFromNotifData(data, router);
      });
    } catch {}
    return () => { sub?.remove(); };
  }, [router]);

  return null;
}

function PushTokenRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || Platform.OS === "web" || !Notifications) return;

    (async () => {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;
        if (!token) return;

        await apiRequest("PUT", "/api/users/me/push-token", { token });
      } catch {}
    })();
  }, [user?.id]);

  return null;
}

function AdminUptimeOverlay() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (user?.role !== "admin") return;
    AsyncStorage.getItem("uptime_widget_enabled").then((val) => {
      setEnabled(val === null ? true : val === "true");
    });
    const id = setInterval(() => {
      AsyncStorage.getItem("uptime_widget_enabled").then((val) => {
        setEnabled(val === null ? true : val === "true");
      });
    }, 2000);
    return () => clearInterval(id);
  }, [user]);

  if (user?.role !== "admin" || !enabled) return null;
  return <UptimeWidget />;
}

function UpdateNudgeWrapper() {
  const { user } = useAuth();
  const { needsUpdate } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);
  if (Platform.OS === "web" || !user || !needsUpdate || dismissed) return null;
  return <UpdateNudgeModal onDismiss={() => setDismissed(true)} />;
}

function ChatSseGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ChatSseProvider enabled={!!user}>
      {children}
    </ChatSseProvider>
  );
}

function LanguageKeyedRoot() {
  const { renderKey } = useLanguage();
  return (
    <View style={{ flex: 1 }} key={renderKey}>
      <RootLayoutNav />
    </View>
  );
}

function RootLayoutNav() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: "fade" }} />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="proposals" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="motoclub/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="route" options={{ headerShown: false }} />
      <Stack.Screen name="evento" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="moderator" options={{ headerShown: false }} />
      <Stack.Screen name="contest" options={{ headerShown: false }} />
      <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
      <Stack.Screen name="ota-gate" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="feedback/index" options={{ headerShown: true, headerTitle: "Feedback", headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, headerTitle: "Notifiche", headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <Stack.Screen name="sprint-history" options={{ headerShown: false }} />
    </Stack>
  );
}

function reportClientError(error: Error, componentStack: string) {
  try {
    const url = getApiUrl() + "/api/admin/client-error";
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message || "unknown",
        stack: (error?.stack || "").substring(0, 2000),
        componentStack: (componentStack || "").substring(0, 1000),
        platform: Platform.OS,
        appVersion: `rv${Updates.runtimeVersion || "?"}`,
      }),
    }).catch(() => {});
  } catch {}
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web"
      ? {}
      : { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold }
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await recoverLastBeacon();
      sendStartupBeacon("layout_mount");
    })();
  }, []);

  useEffect(() => {
    const forceReady = () => {
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    };

    const timeout = setTimeout(forceReady, 5000);

    if (fontsLoaded || fontError) {
      sendStartupBeacon("fonts_ready");
      clearTimeout(timeout);
      forceReady();
    }

    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    type ErrorHandler = (error: Error, isFatal?: boolean) => void;
    interface ErrorUtilsType {
      getGlobalHandler: () => ErrorHandler;
      setGlobalHandler: (callback: ErrorHandler) => void;
    }
    const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsType }).ErrorUtils;
    if (!errorUtils) return;
    const prev = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
      console.error("[GlobalError]", error?.message, "isFatal:", isFatal, error?.stack);
      try {
        fetch(new URL("/api/admin/client-error", getApiUrl()).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: error?.message || "unknown",
            stack: (error?.stack || "").substring(0, 2000),
            componentStack: "",
            platform: Platform.OS,
            appVersion: `rv${Updates.runtimeVersion || "?"}`,
            isFatal: !!isFatal,
          }),
        }).catch(() => {});
      } catch {}
      if (prev) prev(error, isFatal);
    });
    return () => { if (prev) errorUtils.setGlobalHandler?.(prev); };
  }, []);

  return (
    <ErrorBoundary onError={reportClientError}>
      <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ChatSseGate>
            <MapSettingsProvider>
              <TaskbarStyleProvider>
              <UnitsProvider>
              <LocationProvider>
                <PlayerProvider>
                <FloatingWidgetProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                <StartupGate ready={ready}>
                  <OtaStartupChecker />
                  <NativeUpdateChecker />
                  <MapReadyGate>
                    <AppStateHandler />
                    <GpsAlwaysGateWrapper />
                    <AdminUptimeOverlay />
                    <BackgroundNotificationHandler />
                    <PushTokenRegistrar />
                    <LanguageKeyedRoot />
                    <MatchPopupAlert />
                    <UpdateNudgeWrapper />
                  </MapReadyGate>
                </StartupGate>
                </GestureHandlerRootView>
                <FloatingWidget />
                </FloatingWidgetProvider>
                </PlayerProvider>
              </LocationProvider>
              </UnitsProvider>
              </TaskbarStyleProvider>
            </MapSettingsProvider>
            </ChatSseGate>
          </AuthProvider>
        </QueryClientProvider>
      </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  mapGateLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

const revocationBannerStyles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 9999,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    textAlign: "center",
  },
});

