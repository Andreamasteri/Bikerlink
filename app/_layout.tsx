import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Platform, AppState, ActivityIndicator, View, StyleSheet } from "react-native";
import { useUpdates } from "expo-updates";

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
import { LocationProvider } from "@/lib/location-context";
import { LanguageProvider, useLanguage } from "@/lib/language-context";
import { MapSettingsProvider, useMapConfig } from "@/lib/map-context";
import Colors from "@/constants/colors";
import UptimeWidget from "@/components/UptimeWidget";
import AsyncStorage from "@react-native-async-storage/async-storage";

SplashScreen.preventAutoHideAsync();

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

async function sendHeartbeat() {
  try {
    await apiRequest("POST", "/api/auth/heartbeat");
  } catch {}
}

function AppStateHandler() {
  const { user } = useAuth();
  const wasAvailableRef = useRef<boolean | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    sendHeartbeat();
    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        try {
          const profileRes = await apiRequest("GET", "/api/users/profile");
          const profile = await profileRes.json();
          wasAvailableRef.current = profile?.isAvailable ?? false;
          if (wasAvailableRef.current) {
            await apiRequest("PUT", "/api/users/me/availability", { isAvailable: false });
          }
        } catch {}
      } else if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
        sendHeartbeat();
        if (wasAvailableRef.current === true) {
          try {
            await apiRequest("PUT", "/api/users/me/availability", { isAvailable: true });
          } catch {}
          wasAvailableRef.current = null;
        }
        queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [user]);

  return null;
}

function StartupGate({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  if (!ready) return null;
  return <>{children}</>;
}

function MapReadyGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isLoading } = useMapConfig();
  if (user && isLoading) {
    return (
      <View style={styles.mapGateLoader}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

function OtaStartupChecker() {
  const reloadedRef = useRef(false);
  let updates: ReturnType<typeof useUpdates> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    updates = useUpdates();
  } catch {
    // expo-updates non disponibile (runtime non supportato)
  }

  useEffect(() => {
    if (__DEV__ || Platform.OS === "web") return;
    if (!updates) return;
    if (reloadedRef.current || !updates.isUpdatePending) return;
    reloadedRef.current = true;
    import("expo-updates").then((Updates) => {
      Updates.reloadAsync().catch(() => {});
    });
  }, [updates?.isUpdatePending]);

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

function LanguageKeyedRoot() {
  const { renderKey } = useLanguage();
  return (
    <GestureHandlerRootView style={{ flex: 1 }} key={renderKey}>
      <RootLayoutNav />
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="proposals" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="motoclub/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="route" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="moderator" options={{ headerShown: false }} />
      <Stack.Screen name="contest" options={{ headerShown: false }} />
      <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
      <Stack.Screen name="feedback/index" options={{ headerShown: true, headerTitle: "Feedback", headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web"
      ? {}
      : { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold }
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const forceReady = () => {
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    };

    const timeout = setTimeout(forceReady, 5000);

    if (fontsLoaded || fontError) {
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
      if (prev) prev(error, isFatal);
    });
    return () => { if (prev) errorUtils.setGlobalHandler?.(prev); };
  }, []);

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MapSettingsProvider>
              <LocationProvider>
                <StartupGate ready={ready}>
                  <OtaStartupChecker />
                  <MapReadyGate>
                    <AppStateHandler />
                    <AdminUptimeOverlay />
                    <LanguageKeyedRoot />
                  </MapReadyGate>
                </StartupGate>
              </LocationProvider>
            </MapSettingsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  mapGateLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
});
