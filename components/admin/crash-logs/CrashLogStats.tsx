import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { CrashStatsResponse, DayTrend } from "./CrashLogTypes";

const JS_COLOR = "#FF4444";
const SYS_COLOR = "#FF6B35";
const BAR_MAX_HEIGHT = 36;
const BAR_WIDTH = 14;

export function CrashLogStats({ stats }: { stats: CrashStatsResponse }) {
  const colors = useColors();
  const totalSystem = stats.byType.crash_system ?? 0;
  const totalJs = stats.byType.crash_js ?? 0;
  const grandTotal = totalSystem + totalJs;

  const rawTrend = React.useMemo(() => stats.dailyTrend ?? [], [stats.dailyTrend]);

  const trend: DayTrend[] = React.useMemo(() => {
    const map: Record<string, DayTrend> = {};
    for (const d of rawTrend) map[d.day] = d;
    const days: DayTrend[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const key = d.toISOString().slice(0, 10);
      days.push(map[key] ?? { day: key, crash_system: 0, crash_js: 0 });
    }
    return days;
  }, [rawTrend]);

  const maxDay = Math.max(1, ...trend.map((d) => d.crash_system + d.crash_js));

  const shortDay = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  };

  return (
    <View style={statsStyles.wrapper}>
      {/* Type summary tiles */}
      <View style={statsStyles.tiles}>
        <View style={[statsStyles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[statsStyles.tileCount, { color: SYS_COLOR }]}>{totalSystem}</Text>
          <Text style={[statsStyles.tileLabel, { color: colors.textSecondary }]}>Sistema</Text>
        </View>
        <View style={[statsStyles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[statsStyles.tileCount, { color: JS_COLOR }]}>{totalJs}</Text>
          <Text style={[statsStyles.tileLabel, { color: colors.textSecondary }]}>JS Error</Text>
        </View>
        <View style={[statsStyles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[statsStyles.tileCount, { color: colors.text }]}>{grandTotal}</Text>
          <Text style={[statsStyles.tileLabel, { color: colors.textSecondary }]}>Totale</Text>
        </View>
      </View>

      {/* Daily trend mini-chart */}
      {trend.length > 0 && (
        <View style={[statsStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={statsStyles.cardHeader}>
            <MaterialCommunityIcons name="chart-bar" size={14} color={colors.textSecondary} />
            <Text style={[statsStyles.cardTitle, { color: colors.textSecondary }]}>Trend 14 giorni</Text>
          </View>
          <View style={statsStyles.chartRow}>
            {trend.map((d, i) => {
              const total = d.crash_system + d.crash_js;
              const barH = Math.max(2, Math.round((total / maxDay) * BAR_MAX_HEIGHT));
              const sysH = total > 0 ? Math.round((d.crash_system / total) * barH) : 0;
              const jsH = barH - sysH;
              const isLast = i === trend.length - 1;
              return (
                <View key={d.day} style={[statsStyles.barWrapper, isLast && statsStyles.barWrapperLast]}>
                  <View style={[statsStyles.barContainer, { height: BAR_MAX_HEIGHT }]}>
                    <View style={{ width: BAR_WIDTH, height: barH, justifyContent: "flex-end" }}>
                      {jsH > 0 && (
                        <View style={{ width: BAR_WIDTH, height: jsH, backgroundColor: JS_COLOR, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
                      )}
                      {sysH > 0 && (
                        <View style={{ width: BAR_WIDTH, height: sysH, backgroundColor: SYS_COLOR }} />
                      )}
                    </View>
                  </View>
                  <Text style={[statsStyles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    {shortDay(d.day).slice(0, 5)}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={statsStyles.chartLegend}>
            <View style={statsStyles.legendItem}>
              <View style={[statsStyles.legendDot, { backgroundColor: SYS_COLOR }]} />
              <Text style={[statsStyles.legendText, { color: colors.textSecondary }]}>Sistema</Text>
            </View>
            <View style={statsStyles.legendItem}>
              <View style={[statsStyles.legendDot, { backgroundColor: JS_COLOR }]} />
              <Text style={[statsStyles.legendText, { color: colors.textSecondary }]}>JS Error</Text>
            </View>
          </View>
        </View>
      )}

      {/* Per-version breakdown */}
      {stats.byVersion.length > 0 && (
        <View style={[statsStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={statsStyles.cardHeader}>
            <MaterialCommunityIcons name="tag-multiple-outline" size={14} color={colors.textSecondary} />
            <Text style={[statsStyles.cardTitle, { color: colors.textSecondary }]}>Top versioni</Text>
          </View>
          {stats.byVersion.map((v) => {
            const barTotalW = Math.max(1, grandTotal);
            const pct = Math.round((v.total / barTotalW) * 100);
            const sysPct = v.total > 0 ? Math.round((v.crash_system / v.total) * 100) : 0;
            return (
              <View key={v.version} style={statsStyles.versionRow}>
                <Text style={[statsStyles.versionLabel, { color: colors.text }]} numberOfLines={1}>
                  v{v.version}
                </Text>
                <View style={statsStyles.versionBarWrap}>
                  <View style={[statsStyles.versionBarTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[statsStyles.versionBarFill, { width: `${pct}%` as `${number}%` }]}
                    >
                      <View style={{ flex: sysPct, backgroundColor: SYS_COLOR, borderRadius: 3 }} />
                      <View style={{ flex: 100 - sysPct, backgroundColor: JS_COLOR, borderTopRightRadius: 3, borderBottomRightRadius: 3 }} />
                    </View>
                  </View>
                </View>
                <View style={statsStyles.versionCounts}>
                  <Text style={[statsStyles.versionCountSys, { color: SYS_COLOR }]}>{v.crash_system}</Text>
                  <Text style={[statsStyles.versionCountSep, { color: colors.textSecondary }]}>/</Text>
                  <Text style={[statsStyles.versionCountJs, { color: JS_COLOR }]}>{v.crash_js}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const statsStyles = StyleSheet.create({
  wrapper: { gap: 10, paddingBottom: 4 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  tileCount: { fontFamily: "Inter_700Bold", fontSize: 22 },
  tileLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chartRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "flex-end" },
  barWrapper: { alignItems: "center", gap: 3 },
  barWrapperLast: {},
  barContainer: { justifyContent: "flex-end", alignItems: "center" },
  barLabel: { fontFamily: "Inter_400Regular", fontSize: 9 },
  chartLegend: { flexDirection: "row", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 11 },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  versionLabel: { fontFamily: "Inter_500Medium", fontSize: 12, width: 50 },
  versionBarWrap: { flex: 1 },
  versionBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  versionBarFill: {
    height: 8,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 3,
    minWidth: 4,
  },
  versionCounts: { flexDirection: "row", alignItems: "center", gap: 2, width: 54 },
  versionCountSys: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  versionCountSep: { fontFamily: "Inter_400Regular", fontSize: 11 },
  versionCountJs: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
