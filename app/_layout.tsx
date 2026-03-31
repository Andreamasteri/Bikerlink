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

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

async function sendHeartbeat() {
  try {
    await apiRequest("POST", "/api/auth/heartbeat");
  } catch {}
}

function AppStateHandler() {
  const { user } = useAuth();
  const appStateRef = useRef(AppState.currentState);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    sendHeartbeat();
    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const prev = appStateRef.current;

      if (prev.match(/inactive|background/) && nextAppState === "active") {
        sendHeartbeat();
        queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });
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

const OTA_APPLIED_KEY = "ota_last_applied_id";

/**
 * Esegue reloadAsync() solo se l'aggiornamento con targetUpdateId non è già
 * stato applicato nell'ultimo riavvio. Confronta con il valore persistito in
 * AsyncStorage per evitare loop infiniti dopo reloadAsync().
 * Se targetUpdateId è null (ID non disponibile) la funzione esce senza fare nulla.
 */
async function safeReloadAsync(targetUpdateId: string | null): Promise<void> {
  if (!targetUpdateId) return;
  try {
    const alreadyApplied = await AsyncStorage.getItem(OTA_APPLIED_KEY);
    if (alreadyApplied === targetUpdateId) {
      // Questo update è già stato applicato nell'ultimo ciclo — evita loop
      return;
    }
    await AsyncStorage.setItem(OTA_APPLIED_KEY, targetUpdateId);
    const mod = await import("expo-updates");
    await mod.reloadAsync();
  } catch {
    // silent fail
  }
}

function OtaStartupChecker() {
  const fetchStartedRef = useRef(false);
  let updates: ReturnType<typeof useUpdates> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    updates = useUpdates();
  } catch {
    // expo-updates non disponibile (runtime non supportato)
  }

  // Applica aggiornamento se già scaricato (isUpdatePending = true)
  useEffect(() => {
    if (__DEV__ || Platform.OS === "web") return;
    if (!updates) return;
    if (!updates.isUpdatePending) return;
    // Usa updateId dell'update disponibile — se assente non rilanciare
    const targetId = updates.availableUpdate?.updateId ?? null;
    safeReloadAsync(targetId);
  }, [updates?.isUpdatePending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check esplicito se il check automatico ON_LOAD non trova nulla entro 2s
  useEffect(() => {
    if (__DEV__ || Platform.OS === "web") return;
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    const timer = setTimeout(async () => {
      try {
        const mod = await import("expo-updates");
        const result = await mod.checkForUpdateAsync();
        if (result.isAvailable) {
          const manifest = result.manifest as { id?: string } | undefined;
          const targetId = manifest?.id ?? null;
          // Se non riusciamo a leggere un ID stabile, non procediamo
          if (!targetId) return;
          const alreadyApplied = await AsyncStorage.getItem(OTA_APPLIED_KEY);
          if (alreadyApplied === targetId) return;
          await mod.fetchUpdateAsync();
          await AsyncStorage.setItem(OTA_APPLIED_KEY, targetId);
          await mod.reloadAsync();
        }
      } catch {
        // silent fail — EAS non raggiungibile o runtime mismatch
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
