import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import otaUpdates from "@/ota-updates.json";
import { runManualOtaCheck, triggerOtaCheck } from "@/lib/ota-check";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { getStableDeviceId } from "@/lib/device-id";

import { OtaEventCard, OtaUpdate, OtaDbRelease } from "@/components/admin/ota/OtaEventCard";
import { OtaFilters } from "@/components/admin/ota/OtaFilters";
import { OtaErrorList } from "@/components/admin/ota/OtaErrorList";
import { OtaAdoptionCard } from "@/components/admin/ota/OtaAdoptionCard";
import { OtaDeviceHistoryCard, OtaEventRow, OtaDeviceCurrentState } from "@/components/admin/ota/OtaDeviceHistoryCard";
import { OtaStuckEventsCard, OtaStuckEventsResponse } from "@/components/admin/ota/OtaStuckEventsCard";
import { OtaDiagnosticsCard } from "@/components/admin/ota/OtaDiagnosticsCard";

interface AdoptionBreakdown {
  release_id: string;
  runtime_version: string;
  phase: string;
  platform: string;
  event_count: number;
  unique_devices: number;
}

interface AdoptionData {
  breakdown: AdoptionBreakdown[];
}

interface OtaEventsResponse {
  events: OtaEventRow[];
  limit: number;
  filters?: {
    phase: string | null;
    source: string | null;
    platform: string | null;
    updateId: string | null;
  };
}

interface OtaStatRow {
  current_update_id: string;
  release_id: string;
  runtime_version: string;
  platform: string;
  ok_count: string | number;
  error_count: string | number;
  unique_devices: string | number;
  last_seen: string;
}

interface OtaStatsResponse {
  stats: OtaStatRow[];
}

interface OtaDeviceHistoryResponse {
  events: OtaEventRow[];
  currentState: OtaDeviceCurrentState | null;
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  deviceId: string;
  fuzzy: boolean;
}

interface OtaErrorEntry {
  error: string;
  failCount: number;
  updateId: string;
  runtimeVersion: string;
  timestamp: string;
}

interface SystemHealth {
  backendStartedAt: number;
  backendUptimeSec: number;
  events: unknown[];
  otaErrors?: OtaErrorEntry[];
}

interface PendingOtaRelease {
  id: string;
  version: string;
  runtime_version: string | null;
  release_notes: string | null;
  published_at: string | null;
  created_at: string;
  slot: string;
  approved: boolean;
}

function PendingApprovalCard() {
  const queryClient = useQueryClient();
  const [isApplying, setIsApplying] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);

  const { data: pendingRelease, refetch: refetchPending } = useQuery<PendingOtaRelease | null>({
    queryKey: ["/api/admin/ota/pending-approval"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/ota/pending-approval", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const handleApply = useCallback(async () => {
    if (!pendingRelease) return;
    if (Platform.OS === "web") {
      Alert.alert("Non disponibile", "Usa il pannello web admin per applicare l'OTA su desktop.");
      return;
    }
    setIsApplying(true);
    try {
      const deviceId = await getStableDeviceId();
      const res = await fetch(new URL("/api/admin/ota/assign-admin-preview", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
        credentials: "include",
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      Alert.alert(
        "Dispositivo registrato",
        "Questo dispositivo riceverà l'OTA admin-preview. L'app si aggiornerà adesso.",
        [{ text: "OK", onPress: () => {
          triggerOtaCheck("manual", { force: true, immediateReload: true }).catch(() => {});
        }}],
      );
    } catch (e) {
      Alert.alert("Errore", `Impossibile applicare OTA: ${String(e)}`);
    } finally {
      setIsApplying(false);
    }
  }, [pendingRelease]);

  const handleDistribute = useCallback(async () => {
    if (!pendingRelease) return;
    Alert.alert(
      "Distribuisci OTA",
      `Distribuire la versione ${pendingRelease.version} a tutti i dispositivi?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Distribuisci",
          style: "destructive",
          onPress: async () => {
            setIsDistributing(true);
            try {
              const res = await fetch(
                new URL(`/api/admin/ota/${pendingRelease.id}/distribute`, getApiUrl()).toString(),
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
                  credentials: "include",
                },
              );
              if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.message ?? `HTTP ${res.status}`);
              }
              Alert.alert("✓ OTA distribuita", "La versione è ora disponibile a tutti i dispositivi.");
              refetchPending();
              queryClient.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
            } catch (e) {
              Alert.alert("Errore", `Impossibile distribuire: ${String(e)}`);
            } finally {
              setIsDistributing(false);
            }
          },
        },
      ],
    );
  }, [pendingRelease, refetchPending, queryClient]);

  if (!pendingRelease) return null;

  const publishedDate = pendingRelease.published_at
    ? new Date(pendingRelease.published_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <View style={pendingStyles.card}>
      <View style={pendingStyles.header}>
        <Ionicons name="time-outline" size={18} color="#f59e0b" />
        <Text style={pendingStyles.title}>OTA in attesa di test admin</Text>
      </View>
      <View style={pendingStyles.infoRow}>
        <Text style={pendingStyles.version}>v{pendingRelease.version}</Text>
        {pendingRelease.runtime_version && (
          <Text style={pendingStyles.rv}>RV {pendingRelease.runtime_version}</Text>
        )}
      </View>
      <Text style={pendingStyles.date}>Pubblicata: {publishedDate}</Text>
      {pendingRelease.release_notes ? (
        <Text style={pendingStyles.notes}>{pendingRelease.release_notes}</Text>
      ) : null}
      <Text style={pendingStyles.hint}>
        Testa prima su questo dispositivo, poi distribuisci a tutti.
      </Text>
      <View style={pendingStyles.actions}>
        <TouchableOpacity
          style={[pendingStyles.btn, pendingStyles.btnApply, isApplying && { opacity: 0.6 }]}
          onPress={handleApply}
          disabled={isApplying || isDistributing}
          testID="apply-admin-ota-btn"
        >
          {isApplying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="phone-portrait-outline" size={14} color="#fff" />
              <Text style={pendingStyles.btnText}>Applica OTA</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[pendingStyles.btn, pendingStyles.btnDistribute, isDistributing && { opacity: 0.6 }]}
          onPress={handleDistribute}
          disabled={isApplying || isDistributing}
          testID="distribute-ota-btn"
        >
          {isDistributing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
              <Text style={pendingStyles.btnText}>Distribuisci OTA</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pendingStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(245, 158, 11, 0.10)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#f59e0b",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#f59e0b",
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  version: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  rv: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  date: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  notes: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    marginBottom: 8,
    fontStyle: "italic",
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  btnApply: {
    backgroundColor: "#f59e0b",
  },
  btnDistribute: {
    backgroundColor: "#22c55e",
  },
  btnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});

const ROME_TZ = "Europe/Rome";

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      timeZone: ROME_TZ,
    });
    const time = d.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: ROME_TZ,
    });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

function formatOtaDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function statusColor(status?: string): string {
  if (status === "published") return Colors.accent;
  if (status === "superseded") return Colors.textSecondary;
  return Colors.textSecondary;
}

function statusLabel(status?: string): string {
  if (status === "published") return "attivo";
  if (status === "superseded") return "superato";
  return status || "—";
}

export default function OtaHistoryScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const updates = (otaUpdates as unknown as OtaUpdate[]).slice().reverse();

  const { data: adoptionData } = useQuery<AdoptionData>({
    queryKey: ["/api/admin/ota-adoption"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: dbReleasesData } = useQuery<OtaDbRelease[]>({
    queryKey: ["/api/admin/ota/releases"],
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const dbReleaseByVersion = useMemo(() => {
    const map = new Map<string, OtaDbRelease>();
    if (dbReleasesData) {
      for (const r of dbReleasesData) map.set(r.version, r);
    }
    return map;
  }, [dbReleasesData]);

  const { data: otaStats } = useQuery<OtaStatsResponse>({
    queryKey: ["/api/admin/ota-stats"],
    refetchInterval: 30000,
  });

  const { data: systemHealth } = useQuery<SystemHealth>({
    queryKey: ["/api/admin/system-health"],
    refetchInterval: 30000,
  });

  const [stuckRvFilter, setStuckRvFilter] = useState("");

  const stuckEventsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (stuckRvFilter.trim()) params.set("runtimeVersion", stuckRvFilter.trim());
    return [`/api/admin/ota-stuck-events?${params.toString()}`];
  }, [stuckRvFilter]);

  const {
    data: stuckEventsData,
    refetch: refetchStuckEvents,
    isFetching: isFetchingStuckEvents,
  } = useQuery<OtaStuckEventsResponse>({
    queryKey: stuckEventsQueryKey,
    refetchInterval: 30000,
  });

  const [deviceSearchInput, setDeviceSearchInput] = useState("");
  const [deviceFuzzy, setDeviceFuzzy] = useState(false);

  const [deviceHistoryState, setDeviceHistoryState] = useState<{
    events: OtaEventRow[];
    currentState: OtaDeviceCurrentState | null;
    total: number;
    page: number;
    totalPages: number;
    hasMore: boolean;
    deviceId: string;
  } | null>(null);
  const [isFetchingDeviceHistory, setIsFetchingDeviceHistory] = useState(false);
  const [deviceHistoryError, setDeviceHistoryError] = useState<string | null>(null);
  const deviceSearchRef = useRef<string>("");

  const fetchDeviceHistory = useCallback(async (deviceId: string, page: number, fuzzy: boolean, append: boolean) => {
    const trimmed = deviceId.trim();
    if (!trimmed) return;
    setIsFetchingDeviceHistory(true);
    setDeviceHistoryError(null);
    try {
      const params = new URLSearchParams({
        deviceId: trimmed,
        page: String(page),
        pageSize: "100",
      });
      if (fuzzy) params.set("fuzzy", "true");
      const baseUrl = getApiUrl();
      const url = new URL(`/api/admin/ota-device-history?${params.toString()}`, baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: OtaDeviceHistoryResponse = await res.json();
      setDeviceHistoryState(prev => ({
        events: append && prev ? [...prev.events, ...data.events] : data.events,
        currentState: page === 1 ? data.currentState : (prev?.currentState ?? data.currentState),
        total: data.total,
        page: data.page,
        totalPages: data.totalPages,
        hasMore: data.hasMore,
        deviceId: data.deviceId,
      }));
    } catch {
      setDeviceHistoryError("Errore nel caricamento dello storico dispositivo");
    } finally {
      setIsFetchingDeviceHistory(false);
    }
  }, []);

  const handleDeviceSearch = useCallback(() => {
    const trimmed = deviceSearchInput.trim();
    if (!trimmed) return;
    deviceSearchRef.current = trimmed;
    setDeviceHistoryState(null);
    fetchDeviceHistory(trimmed, 1, deviceFuzzy, false);
  }, [deviceSearchInput, deviceFuzzy, fetchDeviceHistory]);

  const handleDeviceLoadMore = useCallback(() => {
    if (!deviceHistoryState?.hasMore || isFetchingDeviceHistory) return;
    fetchDeviceHistory(deviceHistoryState.deviceId, deviceHistoryState.page + 1, deviceFuzzy, true);
  }, [deviceHistoryState, deviceFuzzy, isFetchingDeviceHistory, fetchDeviceHistory]);

  const handleDeviceClear = useCallback(() => {
    setDeviceSearchInput("");
    setDeviceHistoryState(null);
    setDeviceHistoryError(null);
    deviceSearchRef.current = "";
  }, []);

  const handleDeviceRefresh = useCallback(() => {
    const id = deviceSearchRef.current;
    if (!id) return;
    setDeviceHistoryState(null);
    fetchDeviceHistory(id, 1, deviceFuzzy, false);
  }, [deviceFuzzy, fetchDeviceHistory]);

  const [otaFilterPhase, setOtaFilterPhase] = useState("");
  const [otaFilterSource, setOtaFilterSource] = useState("");
  const [otaFilterPlatform, setOtaFilterPlatform] = useState("");
  const [otaFilterUpdateId, setOtaFilterUpdateId] = useState("");

  const otaEventsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (otaFilterPhase.trim()) params.set("phase", otaFilterPhase.trim());
    if (otaFilterSource.trim()) params.set("source", otaFilterSource.trim());
    if (otaFilterPlatform.trim()) params.set("platform", otaFilterPlatform.trim());
    if (otaFilterUpdateId.trim()) params.set("updateId", otaFilterUpdateId.trim());
    return [`/api/admin/ota-events?${params.toString()}`];
  }, [otaFilterPhase, otaFilterSource, otaFilterPlatform, otaFilterUpdateId]);

  const {
    data: otaEventsData,
    refetch: refetchOtaEvents,
    isFetching: isFetchingOtaEvents,
  } = useQuery<OtaEventsResponse>({
    queryKey: otaEventsQueryKey,
    refetchInterval: 10000,
  });

  const [isManualOtaRunning, setIsManualOtaRunning] = useState(false);
  const handleManualOtaCheck = useCallback(async () => {
    setIsManualOtaRunning(true);
    try {
      const result = await runManualOtaCheck();
      if (result.skipped === "dev") {
        Alert.alert(t("admin.otaUnavailable"), t("admin.otaDevDisabled"));
      } else if (result.skipped === "web") {
        Alert.alert(t("admin.otaUnavailable"), t("admin.otaWebDisabled"));
      } else if (result.ok) {
        Alert.alert(
          "Check OTA completato",
          `Esito: ${result.phase}` +
            (result.phase === "reload" ? "\nL'app sta per ricaricarsi." : ""),
        );
      } else {
        Alert.alert(
          "Check OTA fallito",
          `Phase: ${result.phase}\n${result.error ?? "Errore sconosciuto"}`,
        );
      }
      setTimeout(() => {
        refetchOtaEvents();
      }, 800);
    } catch (e) {
      Alert.alert("Errore", `Impossibile avviare il check OTA: ${String(e)}`);
    } finally {
      setIsManualOtaRunning(false);
    }
  }, [refetchOtaEvents, t]);

  const adoptionByRelease = useMemo(() => {
    const map = new Map<string, number>();
    if (!adoptionData?.breakdown) return map;
    for (const row of adoptionData.breakdown) {
      const prev = map.get(row.release_id) ?? 0;
      map.set(row.release_id, Math.max(prev, row.unique_devices));
    }
    return map;
  }, [adoptionData]);

  const updateIdToOtaNum = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of updates) {
      if (u.iosUpdateId) map.set(u.iosUpdateId, u.updateNumber);
      if (u.androidUpdateId) map.set(u.androidUpdateId, u.updateNumber);
    }
    return map;
  }, [updates]);

  const otaErrors = systemHealth?.otaErrors ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: 16, paddingBottom: insets.bottom + 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <PendingApprovalCard />

      <Text style={styles.summary}>{updates.length} aggiornamenti totali</Text>

      {updates.map((u) => {
        const deviceCount = u.releaseId
          ? adoptionByRelease.get(u.releaseId as string)
          : undefined;
        const dbRel = u.releaseId
          ? Array.from(dbReleaseByVersion.values()).find((r) => r.id === u.releaseId)
          : dbReleaseByVersion.get(u.updateNumber?.toString() ?? "") ?? undefined;
        return (
          <OtaEventCard
            key={u.updateNumber}
            update={u}
            deviceCount={deviceCount}
            dbRelease={dbRel}
            statusColor={statusColor}
            statusLabel={statusLabel}
            formatOtaDate={formatOtaDate}
          />
        );
      })}

      <OtaAdoptionCard
        stats={otaStats?.stats ?? []}
        updateIdToOtaNum={updateIdToOtaNum}
        formatTimestamp={formatTimestamp}
      />

      <OtaDeviceHistoryCard
        searchInput={deviceSearchInput}
        onSearchInputChange={setDeviceSearchInput}
        onSearch={handleDeviceSearch}
        onClear={handleDeviceClear}
        onRefresh={handleDeviceRefresh}
        onLoadMore={handleDeviceLoadMore}
        historyState={deviceHistoryState}
        isFetching={isFetchingDeviceHistory}
        error={deviceHistoryError}
        fuzzy={deviceFuzzy}
        onFuzzyToggle={setDeviceFuzzy}
        formatTimestamp={formatTimestamp}
        updateIdToOtaNum={updateIdToOtaNum}
      />

      <OtaStuckEventsCard
        data={stuckEventsData}
        rvFilter={stuckRvFilter}
        onRvFilterChange={setStuckRvFilter}
        onRefresh={refetchStuckEvents}
        isFetching={isFetchingStuckEvents}
        formatTimestamp={formatTimestamp}
      />

      <OtaDiagnosticsCard
        events={otaEventsData?.events ?? []}
        formatTimestamp={formatTimestamp}
      />

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="cloud-done-outline" size={18} color={Colors.accent} />
          <Text style={styles.cardTitle}>Aggiornamenti OTA</Text>
          <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
            <Text style={styles.badgeText}>{otaEventsData?.events.length ?? 0}</Text>
          </View>
          <TouchableOpacity
            onPress={() => refetchOtaEvents()}
            disabled={isFetchingOtaEvents}
            style={{ marginLeft: 8 }}
          >
            {isFetchingOtaEvents ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Ionicons name="refresh" size={18} color={Colors.accent} />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.actionBtnWide, isManualOtaRunning && { opacity: 0.6 }]}
          onPress={handleManualOtaCheck}
          disabled={isManualOtaRunning}
          testID="force-ota-check-btn"
        >
          {isManualOtaRunning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Forza controllo OTA</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.hintText}>
          Bypassa il cooldown e contatta /api/expo-updates. L&apos;esito viene loggato in DB
          e mostrato sotto.
        </Text>

        <OtaFilters
          phase={otaFilterPhase}
          setPhase={setOtaFilterPhase}
          source={otaFilterSource}
          setSource={setOtaFilterSource}
          platform={otaFilterPlatform}
          setPlatform={setOtaFilterPlatform}
          updateId={otaFilterUpdateId}
          setUpdateId={setOtaFilterUpdateId}
          onClear={() => {
            setOtaFilterPhase("");
            setOtaFilterSource("");
            setOtaFilterPlatform("");
            setOtaFilterUpdateId("");
          }}
        />

        {(otaEventsData?.events ?? []).length === 0 ? (
          <Text style={[styles.hintText, { marginTop: 12 }]}>
            Nessun evento OTA registrato.
          </Text>
        ) : (
          (otaEventsData?.events ?? []).slice(0, 100).map((e) => {
            const isErr = !!e.error && !e.error.startsWith("ok:");
            const color = isErr ? "#FF4444" : "#44AA44";
            const icon: keyof typeof Ionicons.glyphMap = isErr
              ? "alert-circle-outline"
              : "checkmark-circle-outline";
            return (
              <View key={e.id} style={styles.row}>
                <Ionicons name={icon} size={14} color={color} />
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={[styles.rowReason, { fontSize: 11 }]} numberOfLines={2}>
                    {e.phase}
                    {e.source ? ` · ${e.source}` : ""}
                    {e.platform ? ` · ${e.platform}` : ""}
                    {e.error ? ` — ${e.error}` : ""}
                  </Text>
                  <Text style={styles.rowTime}>
                    rv={e.runtime_version ?? "?"} · uid=
                    {(e.current_update_id ?? "?").substring(0, 12)}
                    {e.release_id ? ` · rel=${e.release_id.substring(0, 8)}` : ""}
                    {e.fail_count > 0 ? ` · fail#${e.fail_count}` : ""} ·{" "}
                    {formatTimestamp(e.created_at)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <OtaErrorList
        errors={otaErrors}
        formatTimestamp={formatTimestamp}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
  },
  summary: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  rowReason: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  rowTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  actionBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#444",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
