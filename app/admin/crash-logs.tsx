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
  getAlertDominantType,
  getAlertAccentColor,
  getAlertDominantLabel,
} from "@/components/admin/crash-logs/CrashLogTypes";
import { CrashLogCard } from "@/components/admin/crash-logs/CrashLogCard";
import { CrashLogFilters } from "@/components/admin/crash-logs/CrashLogFilters";
import { CrashStackTrace } from "@/components/admin/crash-logs/CrashStackTrace";
import { CrashLogStats } from "@/components/admin/crash-logs/CrashLogStats";
import { styles } from "@/components/admin/crash-logs/CrashLogsStyles";

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
              filterVersion={filterVersion}
              filterDevice={filterDevice}
              brandStats={brandStats}
              deviceStats={data?.deviceStats}
              deviceTab={deviceTab}
              setDeviceTab={setDeviceTab}
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

interface CrashLogsHeaderProps {
  alerts: CrashAlertsResponse["alerts"];
  threshold: number;
  showThresholdEdit: boolean;
  thresholdInput: string;
  setShowThresholdEdit: (v: boolean | ((prev: boolean) => boolean)) => void;
  setThresholdInput: (v: string) => void;
  handleThresholdSubmit: () => void;
  applyDeviceFilter: (model: string) => void;
  statsData: CrashStatsResponse | undefined;
  total: number;
  filterType: "" | CrashType;
  filterVersion: string;
  filterDevice: string;
  brandStats: BrandStat[];
  deviceStats: Array<{ platform?: string; deviceModel?: string; total: number }> | undefined;
  deviceTab: "model" | "brand";
  setDeviceTab: (tab: "model" | "brand") => void;
}

function CrashLogsHeader({
  alerts, threshold, showThresholdEdit, thresholdInput,
  setShowThresholdEdit, setThresholdInput, handleThresholdSubmit,
  applyDeviceFilter, statsData, total, filterType, filterVersion,
  filterDevice, brandStats, deviceStats, deviceTab, setDeviceTab,
}: CrashLogsHeaderProps) {
  const colors = useColors();

  return (
    <View>
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
          {alerts.map((alert, i) => {
            const dominant = getAlertDominantType(alert);
            const accentColor = getAlertAccentColor(dominant);
            const dominantLabel = getAlertDominantLabel(dominant);
            const iconName = dominant === "restart_loop" ? "restart" : dominant === "crash_js" ? "code-braces" : "phone-alert";
            return (
              <TouchableOpacity
                key={i}
                style={[styles.alertBanner, { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}40` }]}
                onPress={() => applyDeviceFilter(alert.device_model)}
                activeOpacity={0.7}
              >
                <View style={styles.alertLeft}>
                  <MaterialCommunityIcons name={iconName} size={16} color={accentColor} />
                  <View>
                    <Text style={[styles.alertModel, { color: colors.text }]} numberOfLines={1}>
                      {alert.device_model}{alert.device_brand ? ` · ${alert.device_brand}` : ""}
                    </Text>
                    <View style={styles.alertCountRow}>
                      <Text style={[styles.alertCount, { color: accentColor }]}>{alert.cnt} crash nelle ultime 24h</Text>
                      <View style={[styles.alertTypeBadge, { backgroundColor: `${accentColor}22` }]}>
                        <Text style={[styles.alertTypeBadgeText, { color: accentColor }]}>{dominantLabel}</Text>
                      </View>
                    </View>
                    {dominant === "mixed" && (
                      <Text style={[styles.alertBreakdown, { color: colors.textSecondary }]}>
                        {alert.crash_system > 0 ? `Sistema: ${alert.crash_system}  ` : ""}
                        {alert.crash_js > 0 ? `JS: ${alert.crash_js}  ` : ""}
                        {alert.restart_loop > 0 ? `Loop: ${alert.restart_loop}` : ""}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.alertRight}>
                  <Text style={[styles.alertFilterHint, { color: colors.accent }]}>Filtra</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {statsData && <CrashLogStats stats={statsData} />}
      <Text style={[styles.totalText, { color: colors.textSecondary, marginTop: statsData ? 12 : 4 }]}>
        {total} crash
        {filterType ? ` · ${filterType === "crash_js" ? "JS Error" : filterType === "restart_loop" ? "Restart Loop" : "Sistema"}` : ""}
        {filterVersion.trim() ? ` · v${filterVersion.trim()}` : ""}
        {filterDevice.trim() ? ` · ${filterDevice.trim()}` : ""}
      </Text>

      {((deviceStats && deviceStats.length > 0) || brandStats.length > 0) && (
        <View style={[styles.deviceStatsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.deviceTabRow}>
            <TouchableOpacity
              style={[styles.deviceTab, deviceTab === "model" && { borderBottomColor: colors.accent }]}
              onPress={() => setDeviceTab("model")}
            >
              <Text style={[styles.deviceTabText, { color: deviceTab === "model" ? colors.accent : colors.textSecondary }]}>Per modello</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deviceTab, deviceTab === "brand" && { borderBottomColor: colors.accent }]}
              onPress={() => setDeviceTab("brand")}
            >
              <Text style={[styles.deviceTabText, { color: deviceTab === "brand" ? colors.accent : colors.textSecondary }]}>Per marca</Text>
            </TouchableOpacity>
          </View>

          {deviceTab === "model" && deviceStats?.map((stat, i) => {
            const label = [stat.platform, stat.deviceModel].filter(Boolean).join(" · ") || "Sconosciuto";
            return (
              <TouchableOpacity
                key={i}
                style={styles.deviceStatRow}
                onPress={() => stat.deviceModel ? applyDeviceFilter(stat.deviceModel) : undefined}
                activeOpacity={stat.deviceModel ? 0.6 : 1}
              >
                <Text style={[styles.deviceStatLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
                <View style={[styles.deviceStatBadge, { backgroundColor: "#FF6B3522" }]}>
                  <Text style={[styles.deviceStatCount, { color: "#FF6B35" }]}>{stat.total}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {deviceTab === "brand" && (
            brandStats.length === 0 ? (
              <Text style={[styles.noDataText, { color: colors.textSecondary }]}>Nessun dato marca disponibile</Text>
            ) : (
              brandStats.map((b, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.deviceStatRow}
                  onPress={() => applyDeviceFilter(b.brand === "Sconosciuto" ? "" : b.brand)}
                  activeOpacity={0.6}
                >
                  <View style={styles.brandLabelWrap}>
                    <Text style={[styles.deviceStatLabel, { color: colors.text }]} numberOfLines={1}>{b.brand}</Text>
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
  );
}
