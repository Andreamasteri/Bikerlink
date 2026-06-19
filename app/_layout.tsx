import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/query-client";
import { Platform, ActivityIndicator, View, Text, StyleSheet } from "react-native";
import NativeUpdateChecker from "@/components/NativeUpdateChecker";
import MatchPopupAlert from "@/components/MatchPopupAlert";
import UpdateNudgeModal from "@/components/UpdateNudgeModal";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import AlwaysPermissionNotice from "@/components/AlwaysPermissionNotice";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import { useAuth } from "@/lib/auth-context";
import { useUptimeWidget } from "@/lib/uptime-widget-context";

import { useLocationGate } from "@/lib/location-context";
import { useLanguage } from "@/lib/language-context";
import { useMapConfig } from "@/lib/map-context";
import { useTheme } from "@/lib/theme-context";
import FloatingWidget from "@/components/FloatingWidget";
import UptimeWidget from "@/components/UptimeWidget";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { loadTelemetryAlwaysActive } from "@/lib/telemetry-prefs";
import {
  stopBackgroundLocationTask,
} from "@/lib/background-location-task";
// Side-effect import: registers the TASK_TELEMETRY background task with expo-task-manager
// so it is available before any component mounts.
import "@/lib/background-telemetry-task";

import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { usePostUpdateRefresh } from "@/hooks/usePostUpdateRefresh";
import { useOtaAutoUpdate } from "@/hooks/useOtaAutoUpdate";
import { RootProviders } from "@/components/RootProviders";
import { AppStateHandler } from "@/components/layout/AppStateHandler";
import { BackgroundNotificationHandler } from "@/components/layout/BackgroundNotificationHandler";
import { PushTokenRegistrar } from "@/components/layout/PushTokenRegistrar";
// Task #2698 — AI Assistant utente.
import AssistantOnboardingTour from "@/components/user/ai-assistant/AssistantOnboardingTour";
import { useOtaStagingBanner } from "@/hooks/useOtaStagingBanner";
import { useDeviceMetrics } from "@/hooks/useDeviceMetrics";
SplashScreen.preventAutoHideAsync();

import("@/lib/sentry").then(s => s.initSentry()).catch(() => {});

function DeviceMetricsReporter({ tokenReady }: { tokenReady: boolean }) {
  useDeviceMetrics(tokenReady);
  return null;
}

function GpsAlwaysGate({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { hasBackgroundPermission, backgroundPermissionChecked, backgroundPermissionRevoked } = useLocationGate();
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !backgroundPermissionChecked || hasBackgroundPermission) return null;
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

  if (!backgroundPermissionRevoked) return null;

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
  const beaconSent = useRef(false);
  useEffect(() => {
    if (ready && !beaconSent.current) {
      beaconSent.current = true;
      sendStartupBeacon("startup_gate_open");
    }
  }, [ready]);
  if (!ready) return null;
  return <>{children}</>;
}

function MapReadyGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isLoading } = useMapConfig();
  const { colors } = useTheme();
  const beaconState = useRef<string>("");

  useEffect(() => {
    sendStartupBeacon("map_ready_gate_enter", { hasUser: !!user, mapLoading: isLoading });
    // Idrata la preferenza "Telemetria sempre attiva" al bootstrap così che il
    // kill-switch venga rispettato/ignorato in modo coerente già dai primi eventi.
    void loadTelemetryAlwaysActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user && isLoading) {
      if (beaconState.current !== "loading") {
        beaconState.current = "loading";
        sendStartupBeacon("map_ready_gate_loading");
      }
    } else if (beaconState.current !== "pass") {
      beaconState.current = "pass";
      sendStartupBeacon("map_ready_gate_pass", { hasUser: !!user });
    }
  }, [user, isLoading]);

  if (user && isLoading) {
    return (
      <View style={[styles.mapGateLoader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

function OtaPendingBanner() {
  const { hasPending } = useOtaStagingBanner();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (!hasPending) return null;

  return (
    <View
      style={[
        revocationBannerStyles.banner,
        { top: insets.top, backgroundColor: colors.accent + "EE" },
      ]}
    >
      <Text
        style={revocationBannerStyles.text}
        onPress={() => router.push("/admin/system")}
      >
        🚀 OTA in staging — Approva o rifiuta in Admin › Sistema
      </Text>
    </View>
  );
}

function AdminUptimeOverlay() {
  const { user } = useAuth();
  const { enabled } = useUptimeWidget();

  if (user?.role !== "admin" || enabled !== true) return null;
  return <UptimeWidget />;
}

function UpdateNudgeWrapper() {
  const { user } = useAuth();
  const { needsUpdate } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);
  if (!user || !needsUpdate || dismissed) return null;
  return <UpdateNudgeModal onDismiss={() => setDismissed(true)} />;
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
      <Stack.Screen name="feedback/index" options={{ headerShown: true, headerTitle: "Feedback", headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, headerTitle: "Notifiche", headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }} />
      <Stack.Screen name="sprint-history" options={{ headerShown: false }} />
      <Stack.Screen name="diagnostica-risultati" options={{ headerShown: false }} />
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
    }).catch(() => {
      // no-op: silent failure for reporting error
    });
  } catch {
    // no-op: general safety for error reporting
  }
}

export default function RootLayout() {
  const { ready, tokenReady } = useAppBootstrap();
  useOtaAutoUpdate(tokenReady);
  usePostUpdateRefresh();

  useEffect(() => {
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
        }).catch(() => {
          // no-op: silent failure for global error reporting
        });
      } catch {
        // no-op: general safety for global error reporting
      }
      if (prev) prev(error, isFatal);
    });
    return () => { if (prev) errorUtils.setGlobalHandler?.(prev); };
  }, []);

  return (
    <RootProviders 
      reportClientError={reportClientError}
    >
      <StartupGate ready={ready}>
        <NativeUpdateChecker />
        <MapReadyGate>
          <DeviceMetricsReporter tokenReady={tokenReady} />
          <AppStateHandler />
          <GpsAlwaysGateWrapper />
          <OtaPendingBanner />
          <AdminUptimeOverlay />
          <BackgroundNotificationHandler />
          <PushTokenRegistrar />
          <View style={{ flex: 1 }} pointerEvents="box-none" key={useLanguage().renderKey}>
            <RootLayoutNav />
          </View>
          <MatchPopupAlert />
          <UpdateNudgeWrapper />
          <AssistantOnboardingTour />
          {/* Task #4456 — Pallino flottante UNICO (drag + menu a 5 voci, incl.
              Assistente AI). PanResponder-only, nessun RNGH: drag e tap robusti
              su Android reale. Sostituisce i vecchi FloatingWidget + AssistantFab. */}
          <FloatingWidget />
        </MapReadyGate>
      </StartupGate>
    </RootProviders>
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

