import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  CrashLogRow,
  CrashLogsResponse,
  CrashStatsResponse,
  CrashAlertsResponse,
  CrashType,
  BrandStat,
  getTypeMeta,
  RestartLoopSummaryResponse,
  SignalFrequencyResponse,
} from "@/components/admin/crash-logs/CrashLogTypes";
import { CrashLogCard } from "@/components/admin/crash-logs/CrashLogCard";
import { CrashLogFilters } from "@/components/admin/crash-logs/CrashLogFilters";
import { CrashStackTrace } from "@/components/admin/crash-logs/CrashStackTrace";
import { styles } from "@/components/admin/crash-logs/CrashLogsStyles";
import { CrashLogsHeader } from "@/components/admin/crash-logs/CrashLogsHeader";

const LIMIT = 20;
const ALERT_THRESHOLD_KEY = "@bikerlink/crash_alert_threshold";
const DEFAULT_THRESHOLD = 3;

function useAlertThreshold() {
  const [threshold, setThresholdState] = useState(DEFAULT_THRESHOLD);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(ALERT_THRESHOLD_KEY)
      .then((v) => {
        if (v) {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) setThresholdState(n);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setThreshold = (n: number) => {
    setThresholdState(n);
    AsyncStorage.setItem(ALERT_THRESHOLD_KEY, String(n)).catch(() => {});
  };

  return { threshold, setThreshold, loaded };
}

export default function CrashLogsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [filterType, setFilterType] = useState<"" | CrashType>("");
  const [filterUser, setFilterUser] = useState("");
  const [filterVersion, setFilterVersion] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDevice, setFilterDevice] = useState("");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCrash, setSelectedCrash] = useState<CrashLogRow | null>(null);
  const [deviceTab, setDeviceTab] = useState<"model" | "brand">("model");
  const [thresholdInput, setThresholdInput] = useState("");
  const [showThresholdEdit, setShowThresholdEdit] = useState(false);

  const { threshold, setThreshold } = useAlertThreshold();

  function buildQueryString() {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filterType) p.set("crashType", filterType);
    if (filterUser.trim()) p.set("userId", filterUser.trim());
    if (filterVersion.trim()) p.set("appVersion", filterVersion.trim());
    if (filterDateFrom.trim()) p.set("dateFrom", filterDateFrom.trim());
    if (filterDateTo.trim()) p.set("dateTo", filterDateTo.trim());
    if (filterDevice.trim()) p.set("deviceModel", filterDevice.trim());
    return p.toString();
  }

  const { data, isLoading, isError, refetch } = useQuery<CrashLogsResponse>({
    queryKey: ["/api/admin/crash-logs", filterType, filterUser, filterVersion, filterDateFrom, filterDateTo, filterDevice, page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/crash-logs?${buildQueryString()}`);
      return res.json() as Promise<CrashLogsResponse>;
    },
    staleTime: 30_000,
  });

  function buildStatsQueryString() {
    const p = new URLSearchParams();
    if (filterType) p.set("crashType", filterType);
    if (filterUser.trim()) p.set("userId", filterUser.trim());
    if (filterVersion.trim()) p.set("appVersion", filterVersion.trim());
    if (filterDateFrom.trim()) p.set("dateFrom", filterDateFrom.trim());
    if (filterDateTo.trim()) p.set("dateTo", filterDateTo.trim());
    if (filterDevice.trim()) p.set("deviceModel", filterDevice.trim());
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }

  const { data: statsData } = useQuery<CrashStatsResponse>({
    queryKey: ["/api/admin/crash-logs/stats", filterType, filterUser, filterVersion, filterDateFrom, filterDateTo, filterDevice],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/crash-logs/stats${buildStatsQueryString()}`);
      return res.json() as Promise<CrashStatsResponse>;
    },
    staleTime: 30_000,
  });

  const { data: alertsData } = useQuery<CrashAlertsResponse>({
    queryKey: ["/api/admin/crash-logs/alerts", threshold],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/crash-logs/alerts?threshold=${threshold}`);
      return res.json() as Promise<CrashAlertsResponse>;
    },
    staleTime: 60_000,
  });

  const { data: restartSummaryData } = useQuery<RestartLoopSummaryResponse>({
    queryKey: ["/api/admin/crash-logs/restart-loop-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/crash-logs/restart-loop-summary");
      return res.json() as Promise<RestartLoopSummaryResponse>;
    },
    staleTime: 60_000,
  });

  const { data: signalFreqData } = useQuery<SignalFrequencyResponse>({
    queryKey: ["/api/admin/crash-logs/signal-frequency"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/crash-logs/signal-frequency?hours=24&minCount=3");
      return res.json() as Promise<SignalFrequencyResponse>;
    },
    staleTime: 60_000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const alerts = alertsData?.alerts ?? [];
  const brandStats: BrandStat[] = data?.brandStats ?? [];

  function resetFilters() {
    setFilterUser("");
    setFilterVersion("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterType("");
    setFilterDevice("");
    setPage(1);
  }

  function applyDeviceFilter(model: string) {
    setFilterDevice(model);
    setPage(1);
    setShowFilters(true);
  }

  function handleThresholdSubmit() {
    const n = parseInt(thresholdInput, 10);
    if (!isNaN(n) && n > 0) setThreshold(n);
    setShowThresholdEdit(false);
    setThresholdInput("");
  }

  function getFilterLabel(type: "" | CrashType): string {
    if (!type) return "";
    return getTypeMeta(type).label;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CrashStackTrace
        visible={!!selectedCrash}
        item={selectedCrash}
        onClose={() => setSelectedCrash(null)}
      />

      <CrashLogFilters
        filterType={filterType}
        setFilterType={setFilterType}
        filterUser={filterUser}
        setFilterUser={setFilterUser}
        filterVersion={filterVersion}
        setFilterVersion={setFilterVersion}
        filterDateFrom={filterDateFrom}
        setFilterDateFrom={setFilterDateFrom}
        filterDateTo={filterDateTo}
        setFilterDateTo={setFilterDateTo}
        filterDevice={filterDevice}
        setFilterDevice={setFilterDevice}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        resetFilters={resetFilters}
        setPage={setPage}
      />

      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : isError && !data ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Errore caricamento dati</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.accent }]}>
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : logs.length === 0 && !statsData ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nessun crash registrato</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CrashLogCard item={item} onOpenStack={setSelectedCrash} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={
            <CrashLogsHeader
              alerts={alerts}
              threshold={threshold}
              showThresholdEdit={showThresholdEdit}
              thresholdInput={thresholdInput}
              setShowThresholdEdit={setShowThresholdEdit}
              setThresholdInput={setThresholdInput}
              handleThresholdSubmit={handleThresholdSubmit}
              applyDeviceFilter={applyDeviceFilter}
              statsData={statsData}
              total={total}
              filterType={filterType}
              filterTypeLabel={getFilterLabel(filterType)}
              filterVersion={filterVersion}
              filterDevice={filterDevice}
              brandStats={brandStats}
              deviceStats={data?.deviceStats}
              deviceTab={deviceTab}
              setDeviceTab={setDeviceTab}
              restartSummaryData={restartSummaryData}
              signalFreqData={signalFreqData}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyInList}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nessun crash registrato</Text>
            </View>
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: page <= 1 ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.pageText, { color: colors.textSecondary }]}>
                  {page} / {totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: page >= totalPages ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <Ionicons name="chevron-forward" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
