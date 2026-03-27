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
import { Platform, AppState, ActivityIndicator, View, StyleSheet, Modal, Text, TouchableOpacity } from "react-native";

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

const OTA_ACTIVE_VERSION_KEY = "ota_active_version";

interface OtaCheckResponse {
  hasUpdate: boolean;
  version: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  bundlePath: string | null;
  manifestUrl: string | null;
}

function OtaUpdateChecker() {
  const { user } = useAuth();
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    releaseNotes: string | null;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!user || checkedRef.current || Platform.OS === "web") return;
    checkedRef.current = true;

    (async () => {
      try {
        const res = await apiRequest("GET", "/api/updates/check");
        if (!res.ok) return;
        const data = (await res.json()) as OtaCheckResponse;
        if (!data.hasUpdate || !data.version) return;

        const storedVersion = await AsyncStorage.getItem(OTA_ACTIVE_VERSION_KEY);
        if (storedVersion === data.version) return;

        let localVersion: string | null = null;
        try {
          const Updates = await import("expo-updates");
          if (Updates.updateId) {
            const manifest = Updates.manifest;
            if (manifest && "metadata" in manifest) {
              const meta = manifest.metadata as Record<string, unknown> | undefined;
              localVersion = (meta?.otaVersion as string) ?? null;
            }
          }
        } catch {}

        if (localVersion && localVersion === data.version) {
          await AsyncStorage.setItem(OTA_ACTIVE_VERSION_KEY, data.version).catch(() => {});
          return;
        }

        setUpdateInfo({ version: data.version, releaseNotes: data.releaseNotes ?? null });
      } catch {}
    })();
  }, [user]);

  if (!updateInfo || dismissed) return null;

  async function handleReload() {
    setApplying(true);
    try {
      const Updates = await import("expo-updates");
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        await AsyncStorage.setItem(OTA_ACTIVE_VERSION_KEY, updateInfo!.version).catch(() => {});
        await Updates.reloadAsync();
      } else {
        await AsyncStorage.setItem(OTA_ACTIVE_VERSION_KEY, updateInfo!.version).catch(() => {});
        setDismissed(true);
      }
    } catch {
      setApplying(false);
      setDismissed(true);
    }
  }

  function handleDismiss() {
    setDismissed(true);
  }

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={otaStyles.overlay}>
        <View style={otaStyles.card}>
          <Text style={otaStyles.title}>Aggiornamento disponibile</Text>
          <Text style={otaStyles.version}>Versione {updateInfo.version}</Text>
          {updateInfo.releaseNotes ? (
            <Text style={otaStyles.notes}>{updateInfo.releaseNotes}</Text>
          ) : null}
          <TouchableOpacity
            style={otaStyles.primaryBtn}
            onPress={handleReload}
            disabled={applying}
          >
            {applying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={otaStyles.primaryBtnText}>Aggiorna ora</Text>
            )}
          </TouchableOpacity>
          {!applying && (
            <TouchableOpacity style={otaStyles.secondaryBtn} onPress={handleDismiss}>
              <Text style={otaStyles.secondaryBtnText}>Più tardi</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
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
                  <MapReadyGate>
                    <AppStateHandler />
                    <AdminUptimeOverlay />
                    <OtaUpdateChecker />
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

const otaStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  version: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.primary,
    marginBottom: 12,
  },
  notes: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  secondaryBtn: {
    paddingVertical: 10,
    width: "100%",
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
