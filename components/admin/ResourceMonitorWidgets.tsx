import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Polyline, Line, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/useColors";

export interface ResourceSample {
  id: string;
  sampledAt: string;
  avgRamPct: number | null;
  avgBatteryPct: number | null;
  onlineUsers: number | null;
  dbSizeMb: number | null;
  backendRssMb: number | null;
}

export function crashBadgeColor(count: number): string {
  if (count === 0) return "#22C55E";
  if (count <= 2) return "#FFAA00";
  return "#FF4444";
}

interface MiniChartProps {
  samples: ResourceSample[];
  width: number;
  height: number;
}

export function MiniChart({ samples, width, height }: MiniChartProps) {
  if (samples.length < 2) return null;

  const pad = { top: 10, bottom: 20, left: 28, right: 8 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  function toPoints(values: (number | null)[]): string {
    const valid = values.map((v, i) => ({ v, i })).filter((x) => x.v != null);
    if (valid.length < 2) return "";
    return valid
      .map(({ v, i }) => {
        const x = pad.left + (i / (values.length - 1)) * chartW;
        const y = pad.top + chartH - (v! / 100) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function toPointsAbsolute(values: (number | null)[], maxVal: number): string {
    const valid = values.map((v, i) => ({ v, i })).filter((x) => x.v != null);
    if (valid.length < 2 || maxVal === 0) return "";
    return valid
      .map(({ v, i }) => {
        const x = pad.left + (i / (values.length - 1)) * chartW;
        const y = pad.top + chartH - (v! / maxVal) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const ramPcts = samples.map((s) => s.avgRamPct);
  const battPcts = samples.map((s) => s.avgBatteryPct);
  const onlineVals = samples.map((s) => s.onlineUsers);
  const maxOnline = Math.max(1, ...(onlineVals.filter((v) => v != null) as number[]));
  const ramPoints = toPoints(ramPcts);
  const battPoints = toPoints(battPcts);
  const onlinePoints = toPointsAbsolute(onlineVals, maxOnline);
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <Svg width={width} height={height}>
      {gridLines.map((pct) => {
        const y = pad.top + chartH - (pct / 100) * chartH;
        return (
          <React.Fragment key={pct}>
            <Line x1={pad.left} y1={y} x2={pad.left + chartW} y2={y} stroke="#ffffff10" strokeWidth={1} />
            <SvgText x={pad.left - 4} y={y + 3} fontSize={8} fill="#888" textAnchor="end">{pct}</SvgText>
          </React.Fragment>
        );
      })}
      {ramPoints ? <Polyline points={ramPoints} fill="none" stroke="#FF6B35" strokeWidth={1.5} /> : null}
      {battPoints ? <Polyline points={battPoints} fill="none" stroke="#22C55E" strokeWidth={1.5} /> : null}
      {onlinePoints ? <Polyline points={onlinePoints} fill="none" stroke="#6366F1" strokeWidth={1.5} strokeDasharray="4,2" /> : null}
    </Svg>
  );
}

export interface CardProps {
  colors: ReturnType<typeof useColors>;
  title: string;
  icon: string;
  children: React.ReactNode;
}

export function Card({ colors, title, icon, children }: CardProps) {
  return (
    <View style={[widgetStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={widgetStyles.cardHeader}>
        <MaterialCommunityIcons
          name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={18}
          color={colors.accent}
        />
        <Text style={[widgetStyles.cardTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

interface RowProps { label: string; value: string; accent?: boolean; }

export function Row({ label, value, accent }: RowProps) {
  const colors = useColors();
  return (
    <View style={widgetStyles.row}>
      <Text style={[widgetStyles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[widgetStyles.rowValue, { color: accent ? colors.accent : colors.text }]}>{value}</Text>
    </View>
  );
}

interface BadgeCountProps { label: string; count: number; }

export function BadgeCount({ label, count }: BadgeCountProps) {
  const bg = crashBadgeColor(count);
  return (
    <View style={widgetStyles.badge}>
      <View style={[widgetStyles.badgeCircle, { backgroundColor: bg + "22" }]}>
        <Text style={[widgetStyles.badgeNumber, { color: bg }]}>{count}</Text>
      </View>
      <Text style={[widgetStyles.badgeLabel, { color: "#888" }]}>{label}</Text>
    </View>
  );
}

interface LegendProps { color: string; label: string; }

export function Legend({ color, label }: LegendProps) {
  return (
    <View style={widgetStyles.legendItem}>
      <View style={[widgetStyles.legendDot, { backgroundColor: color }]} />
      <Text style={[widgetStyles.legendText, { color: "#888" }]}>{label}</Text>
    </View>
  );
}

export const widgetStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  rowValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, textAlign: "right" },
  badge: { alignItems: "center", gap: 6 },
  badgeCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  badgeNumber: { fontFamily: "Inter_700Bold", fontSize: 22 },
  badgeLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 11 },
});
