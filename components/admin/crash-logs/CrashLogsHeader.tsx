import React from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
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
} from "./CrashLogTypes";
import { CrashLogStats } from "./CrashLogStats";
import { styles } from "./CrashLogsStyles";
import { SignalFrequencySection } from "./CrashSignalFrequency";

export interface CrashLogsHeaderProps {
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

export function CrashLogsHeader({
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
