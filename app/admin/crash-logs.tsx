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
  getTypeMeta,
  RestartLoopSummaryResponse,
  RestartLoopSummaryItem,
  SignalFrequencyResponse,
  SignalFrequencyItem,
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
  filterTypeLabel: string;
  filterVersion: string;
  filterDevice: string;
  brandStats: BrandStat[];
  deviceStats: Array<{ platform?: string | null; deviceModel?: string | null; total: number }> | undefined;
  deviceTab: "model" | "brand";
  setDeviceTab: (tab: "model" | "brand") => void;
  restartSummaryData?: RestartLoopSummaryResponse;
  signalFreqData?: SignalFrequencyResponse;
}

function CrashLogsHeader({
  alerts, threshold, showThresholdEdit, thresholdInput,
  setShowThresholdEdit, setThresholdInput, handleThresholdSubmit,
  applyDeviceFilter, statsData, total, filterType, filterTypeLabel, filterVersion,
  filterDevice, brandStats, deviceStats, deviceTab, setDeviceTab,
  restartSummaryData, signalFreqData,
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
            const meta = getTypeMeta(dominant === "mixed" ? "crash_system" : dominant);
            return (
              <TouchableOpacity
                key={i}
                style={[styles.alertBanner, { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}40` }]}
                onPress={() => applyDeviceFilter(alert.device_model)}
                activeOpacity={0.7}
              >
                <View style={styles.alertLeft}>
                  <MaterialCommunityIcons name={meta.icon} size={16} color={accentColor} />
                  <View>
                    <Text style={[styles.alertModel, { color: colors.text }]} numberOfLines={1}>
                      {alert.device_model}{alert.device_brand ? ` · ${alert.device_brand}` : ""}
                    </Text>
                    <View style={styles.alertCountRow}>
                      <Text style={[styles.alertCount, { color: accentColor }]}>{alert.cnt} eventi nelle ultime 24h</Text>
                      <View style={[styles.alertTypeBadge, { backgroundColor: `${accentColor}22` }]}>
                        <Text style={[styles.alertTypeBadgeText, { color: accentColor }]}>{dominantLabel}</Text>
                      </View>
                    </View>
                    {dominant === "mixed" && (
                      <Text style={[styles.alertBreakdown, { color: colors.textSecondary }]}>
                        {alert.crash_system > 0 ? `Sis: ${alert.crash_system}  ` : ""}
                        {alert.crash_js > 0 ? `JS: ${alert.crash_js}  ` : ""}
                        {alert.restart_loop > 0 ? `Loop: ${alert.restart_loop}  ` : ""}
                        {(alert.js_thread_freeze ?? 0) > 0 ? `Freeze: ${alert.js_thread_freeze}  ` : ""}
                        {(alert.gps_flood ?? 0) > 0 ? `GPS: ${alert.gps_flood}  ` : ""}
                        {(alert.memory_pressure ?? 0) > 0 ? `RAM: ${alert.memory_pressure}  ` : ""}
                        {(alert.native_module_missing ?? 0) > 0 ? `Mod: ${alert.native_module_missing}` : ""}
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

      {/* Restart-Loop Summary */}
      {restartSummaryData && restartSummaryData.summary.length > 0 && (
        <View style={[styles.restartSummaryContainer, { backgroundColor: colors.surface, borderColor: "#9B59B640" }]}>
          <View style={styles.restartSummaryHeader}>
            <MaterialCommunityIcons name="restart" size={14} color="#9B59B6" />
            <Text style={[styles.restartSummaryTitle, { color: colors.textSecondary }]}>
              Top riavvii per utente (24h)
            </Text>
          </View>
          {restartSummaryData.summary.map((item: RestartLoopSummaryItem, i: number) => (
            <View key={`${item.userId}-${i}`} style={styles.restartSummaryRow}>
              <View style={styles.restartSummaryLeft}>
                <Text style={[styles.restartSummaryRank, { color: colors.textSecondary }]}>
                  {i + 1}.
                </Text>
                <View style={styles.restartSummaryInfo}>
                  <Text style={[styles.restartSummaryNickname, { color: colors.text }]} numberOfLines={1}>
                    {item.nickname ?? item.userId}
                  </Text>
                  <Text style={[styles.restartSummaryMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[item.platform, item.appVersion ? `v${item.appVersion}` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {" · "}
                    {item.sessionCount} {item.sessionCount === 1 ? "sessione" : "sessioni"}
                  </Text>
                </View>
              </View>
              <View style={[styles.restartSummaryBadge, { backgroundColor: "#9B59B622" }]}>
                <Text style={[styles.restartSummaryCount, { color: "#9B59B6" }]}>
                  {item.totalRestarts}
                </Text>
                <Text style={[styles.restartSummaryUnit, { color: "#9B59B6" }]}>
                  {item.totalRestarts === 1 ? "riavvio" : "riavvii"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Signal Frequency — high-frequency anomaly summary */}
      {signalFreqData && signalFreqData.items.length > 0 && (
        <SignalFrequencySection items={signalFreqData.items} />
      )}

      {statsData && <CrashLogStats stats={statsData} />}
      <Text style={[styles.totalText, { color: colors.textSecondary, marginTop: statsData ? 12 : 4 }]}>
        {total} eventi
        {filterType && filterTypeLabel ? ` · ${filterTypeLabel}` : ""}
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

function formatWindowSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function SignalFrequencySection({ items }: { items: SignalFrequencyItem[] }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <View style={[freqStyles.container, { backgroundColor: colors.surface, borderColor: "#F59E0B40" }]}>
      <View style={freqStyles.header}>
        <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={14} color="#F59E0B" />
        <Text style={[freqStyles.title, { color: colors.textSecondary }]}>
          Ripetizione anomala (24h, min 3×)
        </Text>
        <View style={[freqStyles.countBadge, { backgroundColor: "#F59E0B22" }]}>
          <Text style={[freqStyles.countBadgeText, { color: "#F59E0B" }]}>{items.length}</Text>
        </View>
      </View>
      <Text style={[freqStyles.subtitle, { color: colors.textSecondary }]}>
        Pattern a mitragliatrice — stesso segnale per utente/sessione
      </Text>
      {shown.map((item, i) => {
        const meta = (() => {
          const m: Record<string, { label: string; color: string }> = {
            js_thread_freeze:      { label: "Thread Freeze", color: "#F59E0B" },
            gps_flood:             { label: "GPS Flood",     color: "#3B82F6" },
            memory_pressure:       { label: "RAM",           color: "#EF4444" },
            native_module_missing: { label: "Modulo Nativo", color: "#8B5CF6" },
          };
          return m[item.signal_type] ?? { label: item.signal_type, color: "#6B7280" };
        })();
        return (
          <View key={`${item.userId}-${item.sessionId ?? ""}-${i}`} style={freqStyles.row}>
            <View style={[freqStyles.typeDot, { backgroundColor: meta.color + "33", borderColor: meta.color }]}>
              <Text style={[freqStyles.typeDotText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={freqStyles.info}>
              <Text style={[freqStyles.user, { color: colors.text }]} numberOfLines={1}>
                {item.nickname ?? item.userId.slice(0, 10)}
              </Text>
              <Text style={[freqStyles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                {[item.platform, item.appVersion ? `v${item.appVersion}` : null, item.deviceModel]
                  .filter(Boolean).join(" · ") || "—"}
              </Text>
              {item.window_sec > 0 && (
                <Text style={[freqStyles.window, { color: colors.textSecondary }]}>
                  finestra: {formatWindowSec(item.window_sec)}
                </Text>
              )}
            </View>
            <View style={[freqStyles.badge, { backgroundColor: meta.color + "22" }]}>
              <Text style={[freqStyles.badgeCount, { color: meta.color }]}>{item.occurrences}×</Text>
            </View>
          </View>
        );
      })}
      {items.length > 5 && (
        <TouchableOpacity style={freqStyles.expandBtn} onPress={() => setExpanded((v) => !v)}>
          <Text style={[freqStyles.expandBtnText, { color: colors.accent }]}>
            {expanded ? "Mostra meno" : `Mostra tutti (${items.length})`}
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

import { StyleSheet } from "react-native";

const freqStyles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  countBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  countBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: -4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ffffff15",
  },
  typeDot: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 70,
    alignItems: "center",
  },
  typeDotText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  info: { flex: 1, gap: 1 },
  user: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  window: { fontFamily: "Inter_400Regular", fontSize: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: "center" },
  badgeCount: { fontFamily: "Inter_700Bold", fontSize: 14 },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 6,
  },
  expandBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
