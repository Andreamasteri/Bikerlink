import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/query-client";
import { Platform, View, Text, StyleSheet } from "react-native";
import NativeUpdateChecker from "@/components/NativeUpdateChecker";
import MatchPopupAlert from "@/components/MatchPopupAlert";
import UpdateNudgeModal from "@/components/UpdateNudgeModal";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { GpsAlwaysGate } from "@/components/GpsAlwaysGate";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import { useAuth } from "@/lib/auth-context";
import { useUptimeWidget } from "@/lib/uptime-widget-context";

import { useLocationGate } from "@/lib/location-context";
import { useLanguage } from "@/lib/language-context";
import { useTheme } from "@/lib/theme-context";
import UptimeWidget from "@/components/UptimeWidget";
import FloatingWidget from "@/components/FloatingWidget";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { MapReadyGate } from "@/components/layout/MapReadyGate";
import { useMapConfig } from "@/lib/map-context";
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
import { DataRefreshIndicator } from "@/components/layout/DataRefreshIndicator";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
// Task #2698 — AI Assistant utente.
import AssistantOnboardingTour from "@/components/user/ai-assistant/AssistantOnboardingTour";
import { useOtaStagingBanner } from "@/hooks/useOtaStagingBanner";
import { useDeviceMetrics } from "@/hooks/useDeviceMetrics";
import { useJsThreadWatchdog } from "@/hooks/useJsThreadWatchdog";
import { initOnlineFocusManager } from "@/lib/online-focus-manager";
SplashScreen.preventAutoHideAsync();

import("@/lib/sentry").then(s => s.initSentry()).catch(() => {});

// Wire React Query's onlineManager/focusManager to NetInfo + AppState once at
// boot so queries pause offline and resume coordinated on reconnect/resume.
initOnlineFocusManager();

function DeviceMetricsReporter({ tokenReady }: { tokenReady: boolean }) {
  useDeviceMetrics(tokenReady);
  useJsThreadWatchdog(true);
  return null;
}

function GpsAlwaysGateWrapper() {
  const { user } = useAuth();
  return <GpsAlwaysGate key={user?.id ?? "logged-out"} isAuthenticated={!!user} />;
}

function PermissionGrantBeacon() {
  const { hasLocationPermission } = useLocationGate();
  const { isLoading: mapLoading } = useMapConfig();
  const { user } = useAuth();
  const prevGranted = useRef(hasLocationPermission);

  useEffect(() => {
    // Emette il beacon nel momento esatto in cui il permesso passa da
    // non-concesso a concesso (es. l'utente accetta il dialog OS), così da
    // correlare il grant con lo stato del gate mappe.
    if (!prevGranted.current && hasLocationPermission) {
      sendStartupBeacon("permission_granted_gate_state", {
        mapLoading,
        hasUser: !!user,
      });
    }
    prevGranted.current = hasLocationPermission;
  }, [hasLocationPermission, mapLoading, user]);

  return null;
}

function StartupGate({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const beaconSent = useRef(false);
  useEffect(() => {
    if (ready && !beaconSent.current) {
      beaconSent.current = true;
      sendStartupBeacon("startup_gate_open");
    }
  }, [ready]);
  // NEVER return null: restituire null smonta lo Stack → Expo Router va su
  // +not-found e non riesce più a tornare → loop "Maximum update depth" →
  // crash immediato, specialmente su fresh install dove il token non è in
  // cache e `ready` resta false più a lungo. Lo SplashScreen nasconde la UI
  // finché useAppBootstrap non chiama hideAsync(). Stessa fix già applicata
  // a MapReadyGate.
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
  const stackScreenOptions = React.useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.background } }),
    [colors.background]
  );
  const feedbackOptions = React.useMemo(
    () => ({ headerShown: true, headerTitle: "Feedback", headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }),
    [colors.surface, colors.text]
  );
  const notificationsOptions = React.useMemo(
    () => ({ headerShown: true, headerTitle: "Notifiche", headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }),
    [colors.surface, colors.text]
  );
  return (
    <Stack screenOptions={stackScreenOptions}>
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
      <Stack.Screen name="feedback/index" options={feedbackOptions} />
      <Stack.Screen name="notifications" options={notificationsOptions} />
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
  const { renderKey } = useLanguage();
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
          <PermissionGrantBeacon />
          <DeviceMetricsReporter tokenReady={tokenReady} />
          <AppStateHandler />
          <GpsAlwaysGateWrapper />
          <OtaPendingBanner />
          <DataRefreshIndicator />
          <OfflineBanner />
          <BackgroundNotificationHandler />
          <PushTokenRegistrar />
          <View style={{ flex: 1 }} pointerEvents="box-none" key={renderKey}>
            <RootLayoutNav />
          </View>
          <MatchPopupAlert />
          <UpdateNudgeWrapper />
          <AssistantOnboardingTour />
          <FloatingWidget />
          <AdminUptimeOverlay />
        </MapReadyGate>
      </StartupGate>
    </RootProviders>
  );
}


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

