import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTheme } from "@/lib/theme-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useNavigation, useRouter } from "expo-router";
import Constants from "expo-constants";
import { getApiUrl, authFetchHeaders, silentAuthRecheck, apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { evaluateUpdateOutcome, type UpdateOutcome } from "@/lib/semver";
import {
  forceRecheck,
} from "@/components/NativeUpdateChecker";
import { useT } from "@/lib/language-context";

import { SystemStatusCard } from "@/components/admin/system/SystemStatusCard";
import { ServerRestartSection } from "@/components/admin/system/ServerRestartSection";
import { DatabaseSection } from "@/components/admin/system/DatabaseSection";
import { NativeVersionConfig } from "@/components/admin/system/NativeVersionConfig";
import { PurgeConfirmationModal } from "@/components/admin/system/PurgeConfirmationModal";
import { SystemErrorDisplay } from "@/components/admin/system/SystemErrorDisplay";
import { SystemLoadingDisplay } from "@/components/admin/system/SystemLoadingDisplay";
import { RecentEventsSection } from "@/components/admin/system/RecentEventsSection";
import OtaPanel from "@/components/admin/ota/OtaPanel";

import {
  AdminFetchError,
  isAdminError,
  formatDuration,
  formatTimestamp,
  type SystemEvent,
  type SystemHealth,
  type RestartHistory,
  type NativeVersionConfigData
} from "@/components/admin/system/systemUtils";


function OtaSectionWrapper() {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 16, marginTop: 16, borderWidth: 1, borderColor: colors.border }}>
      <OtaPanel />
    </View>
  );
}

function outcomeMeta(o: UpdateOutcome, t: (key: string) => string): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (o === "force") return { label: "Force update richiesto", color: "#FF4444", icon: "alert-circle" };
  if (o === "soft") return { label: "Soft update disponibile", color: "#FFAA00", icon: "arrow-up-circle" };
  return { label: t("admin.noUpdate"), color: "#44AA44", icon: "checkmark-circle" };
}

export default function SystemScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [backendUptimeSec, setBackendUptimeSec] = useState<number>(0);

  const [nativeAndroidLatest, setNativeAndroidLatest] = useState("");
  const [nativeAndroidMin, setNativeAndroidMin] = useState("");
  const [nativeAndroidUrl, setNativeAndroidUrl] = useState("");
  const [nativeIosLatest, setNativeIosLatest] = useState("");
  const [nativeIosMin, setNativeIosMin] = useState("");
  const [nativeIosUrl, setNativeIosUrl] = useState("");
  const [savingNative, setSavingNative] = useState(false);

  const { data: nativeVerData, refetch: refetchNativeVer } = useQuery<NativeVersionConfigData>({
    queryKey: ["/api/settings/native-version"],
  });

  const installedVersion = Constants.expoConfig?.version ?? "0.0.0";
  const installedPlatform: "android" | "ios" = Platform.OS === "ios" ? "ios" : "android";

  const checkOutcome: UpdateOutcome | null = useMemo(() => {
    if (!nativeVerData) return null;
    const cfg = installedPlatform === "android" ? nativeVerData.android : nativeVerData.ios;
    return evaluateUpdateOutcome(installedVersion, cfg.minVersion, cfg.latestVersion);
  }, [nativeVerData, installedPlatform, installedVersion]);

  const [isCleanupRunning, setIsCleanupRunning] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeModalVisible, setPurgeModalVisible] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");

  const handleCacheCleanup = useCallback(async () => {
    setIsCleanupRunning(true);
    try {
      await apiRequest("POST", "/api/admin/cache/cleanup");
      Alert.alert("Avviata", "Pulizia cache workspace avviata in background.");
    } catch (e: unknown) {
      if ((e as { status?: number })?.status === 409) {
        Alert.alert("In corso", "Pulizia cache già in esecuzione, attendi.");
      } else {
        Alert.alert("Errore", "Impossibile avviare la pulizia della cache.");
      }
    } finally {
      setIsCleanupRunning(false);
    }
  }, []);

  const [isRechecking, setIsRechecking] = useState(false);
  const handleForceRecheck = useCallback(async () => {
    setIsRechecking(true);
    try {
      await Promise.all([refetchNativeVer(), forceRecheck()]);
    } finally {
      setIsRechecking(false);
    }
  }, [refetchNativeVer]);

  useEffect(() => {
    if (!nativeVerData) return;
    setNativeAndroidLatest(nativeVerData.android.latestVersion);
    setNativeAndroidMin(nativeVerData.android.minVersion);
    setNativeAndroidUrl(nativeVerData.android.storeUrl);
    setNativeIosLatest(nativeVerData.ios.latestVersion);
    setNativeIosMin(nativeVerData.ios.minVersion);
    setNativeIosUrl(nativeVerData.ios.storeUrl);
  }, [nativeVerData]);

  const saveNativeVersion = useCallback(async () => {
    setSavingNative(true);
    try {
      await apiRequest("PUT", "/api/admin/settings/native-version", {
        android: { latestVersion: nativeAndroidLatest, minVersion: nativeAndroidMin, storeUrl: nativeAndroidUrl },
        ios: { latestVersion: nativeIosLatest, minVersion: nativeIosMin, storeUrl: nativeIosUrl }
      });
      Alert.alert("Salvato", "Configurazione versioni native aggiornata.");
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Impossibile salvare la configurazione.");
    } finally {
      setSavingNative(false);
    }
  }, [nativeAndroidLatest, nativeAndroidMin, nativeAndroidUrl, nativeIosLatest, nativeIosMin, nativeIosUrl]);

  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { sessionExpired, logoutMutation } = useAuth();
  const logoutMutationRef = useRef(logoutMutation);
  logoutMutationRef.current = logoutMutation;
  const executePurge = useCallback(async () => {
    if (purgeConfirmText.trim().toUpperCase() !== "PURGA") {
      Alert.alert("Conferma errata", "Devi scrivere esattamente PURGA per procedere.");
      return;
    }
    setPurgeModalVisible(false);
    setPurgeConfirmText("");
    setIsPurging(true);
    try {
      const purgeUrl = new URL("/api/admin/purge-non-admin-users", getApiUrl());
      const purgeRes = await fetch(purgeUrl.toString(), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Confirm-Purge": "PURGE-CONFIRMED" },
        credentials: "include"
      });
      const body = await purgeRes.json();
      Alert.alert(
        "Purga completata",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- purge response shape from API
        `Eliminati ${(body as any).deletedUsers} utenti non-admin.\nLe sessioni sono state invalidate.\nVerrai reindirizzato al login.`,
        [
          {
            text: "OK",
            onPress: async () => {
              try { await logoutMutationRef.current.mutateAsync(); } catch {
                // no-op: proceed to login even if logout fails
              }
              routerRef.current.replace("/(auth)/login");
            }
          },
        ]
      );
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || t("admin.serverError"));
    } finally {
      setIsPurging(false);
    }
  }, [purgeConfirmText, t]);

  const handlePurgeNonAdminUsers = useCallback(() => {
    Alert.alert(
      t("admin.purgeDb"),
      t("admin.purgeConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.continue"),
          style: "destructive",
          onPress: () => {
            setPurgeConfirmText("");
            setPurgeModalVisible(true);
          }
        },
      ]
    );
  }, [t]);

  const fetchSystemHealth = useCallback(async (signal?: AbortSignal): Promise<SystemHealth> => {
    const url = new URL("/api/admin/system-health", getApiUrl());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Request timeout after 10000ms")), 10_000);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        controller.abort((signal as AbortSignal & { reason?: unknown }).reason);
      } else {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          controller.abort((signal as AbortSignal & { reason?: unknown }).reason);
        }, { once: true });
      }
    }
    const combinedSignal = controller.signal;
    const doFetch = () =>
      fetch(url.toString(), {
        headers: authFetchHeaders(),
        credentials: "include",
        signal: combinedSignal,
      });

    try {
      let res: Response;
      try {
        res = await doFetch();
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") throw e;
        throw new AdminFetchError("network", "network_unavailable");
      }

      // ── 401: silent re-auth one-shot prima di dichiarare la sessione scaduta.
      // Caso tipico: cookie connect.sid stale dopo cold start, ma il Bearer
      // token in AsyncStorage è ancora valido. Se /api/auth/me risponde 200,
      // ritentiamo la fetch silenziosamente; se risponde 401, la sessione è
      // davvero scaduta e segnaliamo l'errore tipizzato.
      if (res.status === 401) {
        const stillValid = await silentAuthRecheck();
        if (stillValid) {
          try {
            res = await doFetch();
          } catch (e: unknown) {
            if (e instanceof Error && e.name === "AbortError") throw e;
            throw new AdminFetchError("network", "network_unavailable");
          }
        }
      }

      if (res.status === 401 || res.status === 403) {
        let reason: string | undefined;
        try {
          const body = (await res.json()) as { reason?: string };
          reason = body?.reason;
        } catch {
          // no-op: reason stays undefined
        }
        throw new AdminFetchError(
          res.status === 401 ? "session_expired" : "forbidden",
          res.status === 401 ? "session_expired" : "forbidden",
          res.status,
          reason,
        );
      }
      if (!res.ok) {
        throw new AdminFetchError("server_error", `server_${res.status}`, res.status);
      }
      return (await res.json()) as SystemHealth;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery<SystemHealth, AdminFetchError>({
    queryKey: ["/api/admin/system-health"],
    queryFn: ({ signal }) => fetchSystemHealth(signal),
    refetchInterval: 30000,
    retry: (count, e) => {
      if (isAdminError(e) && (e.code === "session_expired" || e.code === "forbidden")) return false;
      return count < 3;
    },
    retryDelay: (index) => Math.min(8_000, 2_000 * Math.pow(2, index)),
  });

  const { data: restartHistory } = useQuery<RestartHistory>({
    queryKey: ["/api/admin/restart-history"],
    refetchInterval: 60000
  });

  const mergedEvents = useMemo<SystemEvent[]>(() => {
    const backendEvents: SystemEvent[] = data?.events ?? [];
    return [...backendEvents].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    });
  }, [data?.events]);

  useEffect(() => {
    if (data) {
      setBackendUptimeSec(data.backendUptimeSec);
    }
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBackendUptimeSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // headerRight è memoizzato con useCallback per evitare che navigation.setOptions
  // riceva una nuova funzione a ogni render → loop "Maximum update depth exceeded".
  // L'effect si riattiva solo quando isFetching o handleRefresh cambiano davvero.
  const headerRight = useCallback(
    () => (
      <TouchableOpacity onPress={handleRefresh} style={{ marginRight: 16 }}>
        {isFetching ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : (
          <Ionicons name="refresh" size={22} color={Colors.accent} />
        )}
      </TouchableOpacity>
    ),
    [handleRefresh, isFetching],
  );

  useEffect(() => {
    navigation.setOptions({ headerRight });
  }, [navigation, headerRight]);

  const topPadding = 0;
  const bottomPadding = insets.bottom;

  if (isLoading) {
    return <SystemLoadingDisplay topPadding={topPadding} />;
  }

  if (error || !data) {
    const goToLogin = async () => {
      try { await logoutMutation.mutateAsync(); } catch {
        // no-op: proceed to login even if logout fails
      }
      router.replace("/(auth)/login");
    };

    return (
      <SystemErrorDisplay
        error={error}
        sessionExpired={sessionExpired}
        t={t}
        handleRefresh={handleRefresh}
        goToLogin={goToLogin}
        topPadding={topPadding}
      />
    );
  }

  return (
    <>
      <PurgeConfirmationModal
        visible={purgeModalVisible}
        purgeConfirmText={purgeConfirmText}
        setPurgeConfirmText={setPurgeConfirmText}
        onClose={() => { setPurgeModalVisible(false); setPurgeConfirmText(""); }}
        onExecute={executePurge}
        t={t}
      />

      <RecentEventsSection
        events={mergedEvents}
        t={t}
        topPadding={topPadding}
        bottomPadding={bottomPadding}
        ListHeaderComponent={
          <>
            <SystemStatusCard
              backendUptimeSec={backendUptimeSec}
              backendStartedAt={data.backendStartedAt}
              formatDuration={formatDuration}
              formatTimestamp={formatTimestamp}
            />

            <ServerRestartSection
              restartHistory={restartHistory}
              formatTimestamp={formatTimestamp}
            />

            <DatabaseSection
              isCleanupRunning={isCleanupRunning}
              onCacheCleanup={handleCacheCleanup}
              isPurging={isPurging}
              onPurgeNonAdminUsers={handlePurgeNonAdminUsers}
              t={t}
            />

            <NativeVersionConfig
              android={{
                latestVersion: nativeAndroidLatest,
                minVersion: nativeAndroidMin,
                storeUrl: nativeAndroidUrl
              }}
              ios={{
                latestVersion: nativeIosLatest,
                minVersion: nativeIosMin,
                storeUrl: nativeIosUrl
              }}
              setNativeAndroidLatest={setNativeAndroidLatest}
              setNativeAndroidMin={setNativeAndroidMin}
              setNativeAndroidUrl={setNativeAndroidUrl}
              setNativeIosLatest={setNativeIosLatest}
              setNativeIosMin={setNativeIosMin}
              setNativeIosUrl={setNativeIosUrl}
              savingNative={savingNative}
              saveNativeVersion={saveNativeVersion}
              isRechecking={isRechecking}
              handleForceRecheck={handleForceRecheck}
              checkOutcome={checkOutcome}
              outcomeMeta={outcomeMeta}
              t={t}
            />

            <OtaSectionWrapper />

          </>
        }
      />
    </>
  );
}

