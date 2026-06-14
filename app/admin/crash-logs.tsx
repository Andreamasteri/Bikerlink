import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
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
} from "@/components/admin/crash-logs/CrashLogTypes";
import { CrashLogCard } from "@/components/admin/crash-logs/CrashLogCard";
import { CrashLogFilters } from "@/components/admin/crash-logs/CrashLogFilters";
import { CrashStackTrace } from "@/components/admin/crash-logs/CrashStackTrace";
import { CrashLogStats } from "@/components/admin/crash-logs/CrashLogStats";

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

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const alerts = alertsData?.alerts ?? [];

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
    if (!isNaN(n) && n > 0) {
      setThreshold(n);
    }
    setShowThresholdEdit(false);
    setThresholdInput("");
  }

  const brandStats: BrandStat[] = data?.brandStats ?? [];

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
            <View>
              {/* Alert banners */}
              {alerts.length > 0 && (
                <View style={styles.alertsSection}>
                  <View style={styles.alertsHeader}>
                    <MaterialCommunityIcons name="alert" size={14} color="#FF6B35" />
                    <Text style={[styles.alertsTitle, { color: "#FF6B35" }]}>
                      Alert dispositivi critici (24h)
                    </Text>
                    <TouchableOpacity
                      style={styles.thresholdBtn}
                      onPress={() => {
                        setShowThresholdEdit((v) => !v);
                        setThresholdInput(String(threshold));
                      }}
                    >
                      <Text style={[styles.thresholdBtnText, { color: colors.textSecondary }]}>
                        soglia: {threshold}
                      </Text>
                      <Ionicons name="pencil-outline" size={12} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {showThresholdEdit && (
                    <View style={[styles.thresholdRow, { borderColor: colors.border }]}>
                      <TextInput
                        style={[styles.thresholdInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                        value={thresholdInput}
                        onChangeText={setThresholdInput}
                        keyboardType="number-pad"
                        placeholder="Soglia crash"
                        placeholderTextColor={colors.textSecondary}
                        onSubmitEditing={handleThresholdSubmit}
                        returnKeyType="done"
                      />
                      <TouchableOpacity
                        style={[styles.thresholdSaveBtn, { backgroundColor: colors.accent }]}
                        onPress={handleThresholdSubmit}
                      >
                        <Text style={styles.thresholdSaveBtnText}>OK</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {alerts.map((alert, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.alertBanner, { backgroundColor: "#FF6B3514", borderColor: "#FF6B3540" }]}
                      onPress={() => applyDeviceFilter(alert.device_model)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.alertLeft}>
                        <MaterialCommunityIcons name="cellphone-remove" size={16} color="#FF6B35" />
                        <View>
                          <Text style={[styles.alertModel, { color: colors.text }]} numberOfLines={1}>
                            {alert.device_model}
                            {alert.device_brand ? ` · ${alert.device_brand}` : ""}
                          </Text>
                          <Text style={[styles.alertCount, { color: "#FF6B35" }]}>
                            {alert.cnt} crash nelle ultime 24h
                          </Text>
                        </View>
                      </View>
                      <View style={styles.alertRight}>
                        <Text style={[styles.alertFilterHint, { color: colors.accent }]}>
                          Filtra
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {statsData && <CrashLogStats stats={statsData} />}
              <Text style={[styles.totalText, { color: colors.textSecondary, marginTop: statsData ? 12 : 4 }]}>
                {total} crash
                {filterType ? ` · ${filterType === "crash_js" ? "JS Error" : filterType === "restart_loop" ? "Restart Loop" : "Sistema"}` : ""}
                {filterVersion.trim() ? ` · v${filterVersion.trim()}` : ""}
                {filterDevice.trim() ? ` · ${filterDevice.trim()}` : ""}
              </Text>

              {/* Top dispositivi — tab model / brand */}
              {((data?.deviceStats && data.deviceStats.length > 0) || brandStats.length > 0) && (
                <View style={[styles.deviceStatsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.deviceTabRow}>
                    <TouchableOpacity
                      style={[styles.deviceTab, deviceTab === "model" && { borderBottomColor: colors.accent }]}
                      onPress={() => setDeviceTab("model")}
                    >
                      <Text style={[styles.deviceTabText, { color: deviceTab === "model" ? colors.accent : colors.textSecondary }]}>
                        Per modello
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deviceTab, deviceTab === "brand" && { borderBottomColor: colors.accent }]}
                      onPress={() => setDeviceTab("brand")}
                    >
                      <Text style={[styles.deviceTabText, { color: deviceTab === "brand" ? colors.accent : colors.textSecondary }]}>
                        Per marca
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {deviceTab === "model" && data?.deviceStats?.map((stat, i) => {
                    const label = [stat.platform, stat.deviceModel].filter(Boolean).join(" · ") || "Sconosciuto";
                    return (
                      <TouchableOpacity
                        key={i}
                        style={styles.deviceStatRow}
                        onPress={() => stat.deviceModel ? applyDeviceFilter(stat.deviceModel) : undefined}
                        activeOpacity={stat.deviceModel ? 0.6 : 1}
                      >
                        <Text style={[styles.deviceStatLabel, { color: colors.text }]} numberOfLines={1}>
                          {label}
                        </Text>
                        <View style={[styles.deviceStatBadge, { backgroundColor: "#FF6B3522" }]}>
                          <Text style={[styles.deviceStatCount, { color: "#FF6B35" }]}>{stat.total}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {deviceTab === "brand" && (
                    brandStats.length === 0 ? (
                      <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                        Nessun dato marca disponibile
                      </Text>
                    ) : (
                      brandStats.map((b, i) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.deviceStatRow}
                          onPress={() => applyDeviceFilter(b.brand === "Sconosciuto" ? "" : b.brand)}
                          activeOpacity={0.6}
                        >
                          <View style={styles.brandLabelWrap}>
                            <Text style={[styles.deviceStatLabel, { color: colors.text }]} numberOfLines={1}>
                              {b.brand}
                            </Text>
                            <View style={[styles.brandPctBar, { backgroundColor: colors.border }]}>
                              <View style={[styles.brandPctFill, { width: `${b.pct}%` as `${number}%`, backgroundColor: "#FF6B35" }]} />
                            </View>
                          </View>
                          <View style={styles.brandBadgeGroup}>
                            <Text style={[styles.brandPct, { color: colors.textSecondary }]}>{b.pct}%</Text>
                            <View style={[styles.deviceStatBadge, { backgroundColor: "#FF6B3522" }]}>
                              <Text style={[styles.deviceStatCount, { color: "#FF6B35" }]}>{b.total}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))
                    )
                  )}
                </View>
              )}
            </View>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center" },
  emptyInList: { alignItems: "center", gap: 12, padding: 32 },
  retryBtn: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  totalText: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12, marginTop: 4 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 16 },
  pageBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pageText: { fontFamily: "Inter_500Medium", fontSize: 14 },

  alertsSection: {
    gap: 8,
    marginBottom: 12,
  },
  alertsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  alertsTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  thresholdBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  thresholdBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  thresholdRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  thresholdInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  thresholdSaveBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  thresholdSaveBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  alertLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  alertModel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  alertCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  alertRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  alertFilterHint: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },

  deviceStatsContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  deviceTabRow: {
    flexDirection: "row",
    gap: 0,
    marginBottom: 4,
  },
  deviceTab: {
    paddingBottom: 8,
    marginRight: 16,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  deviceTabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deviceStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 2,
  },
  deviceStatLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flex: 1,
  },
  deviceStatBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deviceStatCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  brandLabelWrap: {
    flex: 1,
    gap: 3,
  },
  brandPctBar: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  brandPctFill: {
    height: 4,
    borderRadius: 2,
    minWidth: 2,
  },
  brandBadgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  brandPct: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    minWidth: 30,
    textAlign: "right",
  },
  noDataText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 8,
  },
});
