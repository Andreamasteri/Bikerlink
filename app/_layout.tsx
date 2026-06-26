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
// import FloatingWidget from "@/components/FloatingWidget"; // disabilitato OTA 201
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { MapReadyGate } from "@/components/layout/MapReadyGate";
import { useMapConfig } from "@/lib/map-context";
// Side-effect import: registers the TASK_TELEMETRY background task with expo-task-manager
// so it is available before any component mounts.
import "@/lib/background-telemetry-task";
// Task #4979 — Livello B passivo: checkpoint PRE-React emessi a module-load.
import { passiveCheckpoint } from "@/lib/boot-gate-passive";

import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { usePostUpdateRefresh } from "@/hooks/usePostUpdateRefresh";
import { useOtaAutoUpdate } from "@/hooks/useOtaAutoUpdate";
import { RootProviders } from "@/components/RootProviders";
import { AppStateHandler } from "@/components/layout/AppStateHandler";
import { BackgroundNotificationHandler } from "@/components/layout/BackgroundNotificationHandler";
import { PushTokenRegistrar } from "@/components/layout/PushTokenRegistrar";
import { DataRefreshIndicator } from "@/components/layout/DataRefreshIndicator";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
// Task #2698 — AI Assistant utente. (import disabilitato OTA 201)
// import AssistantOnboardingTour from "@/components/user/ai-assistant/AssistantOnboardingTour";
import { useOtaStagingBanner } from "@/hooks/useOtaStagingBanner";
import { useDeviceMetrics } from "@/hooks/useDeviceMetrics";
import { useJsThreadWatchdog } from "@/hooks/useJsThreadWatchdog";
import { initOnlineFocusManager } from "@/lib/online-focus-manager";
// Task #4979 — BootGate diagnostico (strettamente opt-in). Import a livello modulo:
// è tree-shaken solo a runtime dal branch flag-gated, l'import in sé non ha effetti.
import { BootGateController } from "@/components/boot-gate/BootGateController";
import { resolveBootGateActive } from "@/lib/boot-gate-passive";

// Task #4979 — Livello B passivo: ogni side-effect di module-load registra il suo
// checkpoint PRIMA che React renderizzi. Se l'app crasha qui (valutazione moduli /
// init early), il server conosce comunque l'ultimo checkpoint raggiunto. I ping
// partono SOLO se il BootGate è attivo; altrimenti i checkpoint sono scartati.
//
// background_telemetry_task gira al suo import (in cima al file): lo registriamo
// per primo perché in ordine cronologico è il primo side-effect del modulo.
passiveCheckpoint("background_telemetry_task");

SplashScreen.preventAutoHideAsync();
passiveCheckpoint("splash_prevent");

import("@/lib/sentry").then(s => s.initSentry()).catch(() => {});
passiveCheckpoint("sentry_init");

// Wire React Query's onlineManager/focusManager to NetInfo + AppState once at
// boot so queries pause offline and resume coordinated on reconnect/resume.
initOnlineFocusManager();
passiveCheckpoint("online_focus_manager");

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

const ROOT_HIDDEN_HEADER = { headerShown: false } as const;
const ROOT_ONBOARDING_SCREEN_OPTIONS = { headerShown: false, gestureEnabled: false, animation: "fade" as const } as const;

// ANTI-LOOP (root cause fix OTA #187): stackScreenOptions e le opzioni degli header
// erano useMemo dipendenti da colors.surface/colors.text. Quando il tema cambiava al
// boot → nuovi ref → React Navigation forEach su tutti gli Stack.Screen → setOptions
// con nuovi merged-objects → navigation state cambia → useLayoutEffect([navigation])
// ri-attiva → altro forEach → loop "Maximum update depth exceeded".
// FIX: costanti statiche. Colori header gestiti da NavThemeProviderBridge (ThemeProvider
// di @react-navigation/native) → nessun setOptions, solo re-render visivo degli header.
const STACK_SCREEN_OPTIONS = { headerShown: false } as const;
const FEEDBACK_OPTIONS = { headerShown: true, headerTitle: "Feedback" } as const;
const NOTIFICATIONS_OPTIONS = { headerShown: true, headerTitle: "Notifiche" } as const;

function RootLayoutNav() {
  return (
    <Stack screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="onboarding" options={ROOT_ONBOARDING_SCREEN_OPTIONS} />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="proposals" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="profile" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="chat/[id]" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="motoclub/[id]" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="business/[id]" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="business-reach" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="route" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="evento" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="admin" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="moderator" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="contest" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="privacy-policy" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="feedback/index" options={FEEDBACK_OPTIONS} />
      <Stack.Screen name="notifications" options={NOTIFICATIONS_OPTIONS} />
      <Stack.Screen name="sprint-history" options={ROOT_HIDDEN_HEADER} />
      <Stack.Screen name="diagnostica-risultati" options={ROOT_HIDDEN_HEADER} />
    </Stack>
  );
}

function reportClientError(error: Error, componentStack: string) {
  if (__DEV__) {
    console.error("[reportClientError] componentStack:", componentStack || "(empty)");
  }
  try {
    const url = getApiUrl() + "/api/admin/client-error";
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message || "unknown",
        stack: (error?.stack || "").substring(0, 2000),
        componentStack: (componentStack || "").substring(0, 3000),
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

// BOOT_GATE_ORIGINAL_POSITION: questo è l'albero applicativo ORIGINALE, invariato.
// Nel percorso normale (flag OFF) viene renderizzato direttamente da RootLayout,
// byte-per-byte identico a prima del Task #4979. Nel percorso BootGate (flag ON)
// viene passato a BootGateController come `renderApp()` e montato SOLO a boot
// completato — così l'app reale resta identica in entrambi i casi.
function NormalRootLayout() {
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
      // Leggiamo il componentStack scritto da ErrorBoundary.componentDidCatch prima
      // di chiamare onError. Se il crash è passato dall'ErrorBoundary il valore è
      // valorizzato; altrimenti resta "" (crash fuori da qualsiasi boundary React).
      const g = globalThis as typeof globalThis & { __lastReactComponentStack?: string };
      const componentStack = g.__lastReactComponentStack || "";
      // Reset dopo la lettura: evita che un crash successivo non-React riceva
      // un componentStack stantio appartenente a un errore precedente.
      g.__lastReactComponentStack = undefined;
      console.error("[GlobalError]", error?.message, "isFatal:", isFatal, "componentStack:", componentStack || "(none)", error?.stack);
      try {
        fetch(new URL("/api/admin/client-error", getApiUrl()).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: error?.message || "unknown",
            stack: (error?.stack || "").substring(0, 2000),
            componentStack: componentStack.substring(0, 3000),
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
          {/* Bowie disabilitato temporaneamente — OTA 201 */}
          {/* <AssistantOnboardingTour /> */}
          {/* <FloatingWidget /> */}
          <AdminUptimeOverlay />
        </MapReadyGate>
      </StartupGate>
    </RootProviders>
  );
}

// Task #4979 — gate flag-based del BootGate diagnostico.
//
// FORCE_BOOT_GATE = true: BootGate attivo in modo SINCRONO al primo render,
// senza attendere API né AsyncStorage. Garantisce che l'utente veda la schermata
// di bisect anche se l'app crashava prima che il flag asincrono venisse risolto.
// Imposta a false (e pubblica un nuovo OTA) quando il bisect è completato.
//
// Quando FORCE_BOOT_GATE è false, la risoluzione è flag-based (AsyncStorage locale
// OPPURE manifest remoto `bootGateEnabled`). Con entrambi a false → percorso normale.
const FORCE_BOOT_GATE = true;

export default function RootLayout() {
  const [decision, setDecision] = useState<boolean | null>(
    FORCE_BOOT_GATE ? true : null,
  );

  useEffect(() => {
    if (FORCE_BOOT_GATE) return; // flag hardcoded: salta la risoluzione asincrona
    let cancelled = false;
    (async () => {
      const active = await resolveBootGateActive();
      if (!cancelled) setDecision(active);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (decision === null) {
    // Placeholder neutro mentre decidiamo (mai null). SplashScreen nativo resta
    // comunque visibile sopra finché il bootstrap non chiama hideAsync().
    return <View style={bootGatePlaceholderStyle.fill} />;
  }

  if (decision) {
    return (
      <BootGateController
        reportClientError={reportClientError}
        renderApp={() => <NormalRootLayout />}
      />
    );
  }

  // BOOT_GATE_ORIGINAL_POSITION: percorso normale invariato.
  return <NormalRootLayout />;
}

const bootGatePlaceholderStyle = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0b0f14" },
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

