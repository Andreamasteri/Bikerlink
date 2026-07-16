// Task #354 — Helper di rendering per ThinkCentreSystemMonitor.
// Estratti in file separato per mantenere il componente principale sotto 600 righe.
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Svg, { Polyline, Line, Text as SvgText } from "react-native-svg";
import Colors from "@/constants/colors";

// ── Tipi condivisi ─────────────────────────────────────────────────────────

export interface DiskMount {
  path: string;
  usedGb: number;
  totalGb: number;
  usedPct: number;
}

// ── Costanti SVG ───────────────────────────────────────────────────────────

export const CHART_W  = 260;
export const CHART_H  = 60;
export const PAD_LEFT = 34;
export const PAD_BOT  = 14;

// ── buildPoints ────────────────────────────────────────────────────────────

/**
 * Converte un array di valori in una stringa di punti SVG.
 * Usa data.length come base dell'asse X, quindi funziona sia per
 * il ring buffer live (60 punti fissi) che per i campioni storici (variabili).
 */
export function buildPoints(
  data: (number | null)[],
  minVal: number,
  maxVal: number,
): string {
  const n = data.length;
  if (n < 2) return "";
  const range = maxVal - minVal || 1;
  const w = CHART_W - PAD_LEFT;
  const h = CHART_H - PAD_BOT;
  return data
    .map((v, i) => {
      if (v === null) return null;
      const x = PAD_LEFT + (i / (n - 1)) * w;
      const y = PAD_BOT + h - ((v - minVal) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}

export function formatVal(v: number, unit: string): string {
  if (unit === "°C" || unit === "%" || unit === "KB/s") return `${Math.round(v)}`;
  if (unit === "GB") return v.toFixed(1);
  return `${v}`;
}

// ── LineChart ──────────────────────────────────────────────────────────────

export interface XLabel { idx: number; label: string }

export interface LineChartProps {
  title: string;
  unit: string;
  lines: { color: string; label: string; data: (number | null)[] }[];
  min?: number;
  max?: number;
  threshold?: number;
  thresholdColor?: string;
  /** Set dei label nascosti. Linee presenti qui non vengono disegnate. */
  hiddenLines?: Set<string>;
  /** Callback per attivare/disattivare una linea. */
  onToggleLine?: (label: string) => void;
  /** Etichette asse X per vista storica. */
  xLabels?: XLabel[];
}

export function LineChart({
  title, unit, lines, min, max, threshold, thresholdColor,
  hiddenLines, onToggleLine, xLabels,
}: LineChartProps) {
  const allVals = lines.flatMap(l => l.data).filter((v): v is number => v !== null);
  const minVal  = min  ?? (allVals.length ? Math.min(...allVals) : 0);
  const maxVal  = max  ?? (allVals.length ? Math.max(...allVals) * 1.1 : 1);

  const threshY = threshold !== undefined && maxVal > minVal
    ? PAD_BOT + (CHART_H - PAD_BOT) - ((threshold - minVal) / (maxVal - minVal)) * (CHART_H - PAD_BOT)
    : null;

  const hasXLabels = xLabels && xLabels.length > 0;
  const svgH = hasXLabels ? CHART_H + 12 : CHART_H;
  const dataLen = lines[0]?.data.length ?? 1;

  return (
    <View style={ch.chartBox}>
      <View style={ch.chartHeader}>
        <Text style={ch.chartTitle}>{title}</Text>
        <View style={ch.legendRow}>
          {lines.map(l => (
            <View key={l.label} style={ch.legendItem}>
              <View style={[ch.legendDot, { backgroundColor: l.color }]} />
              <Text style={ch.legendLabel}>{l.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Svg width={CHART_W} height={svgH}>
        {/* Asse Y labels */}
        <SvgText x={PAD_LEFT - 2} y={PAD_BOT + 4} fontSize={9} fill={Colors.textSecondary} textAnchor="end">
          {formatVal(maxVal, unit)}
        </SvgText>
        <SvgText x={PAD_LEFT - 2} y={CHART_H - 1} fontSize={9} fill={Colors.textSecondary} textAnchor="end">
          {formatVal(minVal, unit)}
        </SvgText>

        {/* Griglia leggera */}
        <Line x1={PAD_LEFT} y1={PAD_BOT}  x2={CHART_W} y2={PAD_BOT}  stroke={Colors.border} strokeWidth={0.5} />
        <Line x1={PAD_LEFT} y1={CHART_H}  x2={CHART_W} y2={CHART_H}  stroke={Colors.border} strokeWidth={0.5} />

        {/* Soglia */}
        {threshY !== null && (
          <Line
            x1={PAD_LEFT} y1={threshY} x2={CHART_W} y2={threshY}
            stroke={thresholdColor ?? "#ef4444"} strokeWidth={1} strokeDasharray="4 3"
          />
        )}

        {/* Dati — linee nascoste passano array vuoto, nessun polyline */}
        {lines.map(l => {
          const visible = !hiddenLines?.has(l.label);
          const pts = buildPoints(visible ? l.data : [], minVal, maxVal);
          return pts
            ? <Polyline key={l.label} points={pts} fill="none" stroke={l.color} strokeWidth={1.5} strokeLinejoin="round" />
            : null;
        })}

        {/* Etichette asse X (solo vista storica) */}
        {hasXLabels && xLabels!.map(({ idx, label }) => {
          const xPos = PAD_LEFT + (idx / Math.max(dataLen - 1, 1)) * (CHART_W - PAD_LEFT);
          return (
            <SvgText key={`xl-${idx}`} x={xPos} y={CHART_H + 9}
              fontSize={8} fill={Colors.textSecondary} textAnchor="middle">
              {label}
            </SvgText>
          );
        })}
      </Svg>

      {/* Chip toggle linee */}
      {onToggleLine && (
        <View style={ch.chipRow}>
          {lines.map(l => {
            const hidden = hiddenLines?.has(l.label) ?? false;
            return (
              <TouchableOpacity key={l.label} onPress={() => onToggleLine(l.label)}
                style={[ch.chip, hidden && ch.chipOff]}>
                <View style={[ch.chipDot, { backgroundColor: hidden ? Colors.textSecondary : l.color }]} />
                <Text style={[ch.chipLabel, hidden && ch.chipLabelOff]}>{l.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Ultimo valore — grigio se linea nascosta */}
      <View style={ch.lastRow}>
        {lines.map(l => {
          const hidden = hiddenLines?.has(l.label) ?? false;
          const last = [...l.data].reverse().find(v => v !== null);
          return (
            <Text key={l.label} style={[ch.lastVal, { color: hidden ? Colors.textSecondary : l.color }]}>
              {last !== undefined && last !== null ? formatVal(last, unit) : "—"}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ── DiskBar ────────────────────────────────────────────────────────────────

export function DiskBar({ mount }: { mount: DiskMount }) {
  const pct   = Math.min(100, mount.usedPct);
  const color = pct > 90 ? "#ef4444" : pct > 75 ? "#f59e0b" : "#22c55e";
  return (
    <View style={ch.diskItem}>
      <View style={ch.diskLabelRow}>
        <Text style={ch.diskPath}>{mount.path}</Text>
        <Text style={[ch.diskPct, { color }]}>{pct}%</Text>
        <Text style={ch.diskDetail}>{mount.usedGb} / {mount.totalGb} GB</Text>
      </View>
      <View style={ch.diskTrack}>
        <View style={[ch.diskFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── VramBar ────────────────────────────────────────────────────────────────

export function VramBar({ usedMb, totalMb }: { usedMb: number; totalMb: number }) {
  const pct   = totalMb > 0 ? Math.min(100, Math.round((usedMb / totalMb) * 100)) : 0;
  const color = pct > 90 ? "#ef4444" : pct > 75 ? "#f59e0b" : "#22c55e";
  const fmtGb = (mb: number) => (mb / 1024).toFixed(1);
  return (
    <View style={ch.diskItem}>
      <View style={ch.diskLabelRow}>
        <Text style={ch.diskPath}>GPU</Text>
        <Text style={[ch.diskPct, { color }]}>{pct}%</Text>
        <Text style={ch.diskDetail}>{fmtGb(usedMb)} / {fmtGb(totalMb)} GB</Text>
      </View>
      <View style={ch.diskTrack}>
        <View style={[ch.diskFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Stili ──────────────────────────────────────────────────────────────────

const ch = StyleSheet.create({
  chartBox:    { backgroundColor: Colors.card, borderRadius: 10, padding: 10, gap: 4 },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartTitle:  { fontSize: 12, fontWeight: "600", color: Colors.text },
  legendRow:   { flexDirection: "row", gap: 8 },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: Colors.textSecondary },

  chipRow:     { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: Colors.border + "88" },
  chipOff:     { opacity: 0.5 },
  chipDot:     { width: 7, height: 7, borderRadius: 3.5 },
  chipLabel:   { fontSize: 10, color: Colors.text, fontWeight: "600" },
  chipLabelOff:{ color: Colors.textSecondary },

  lastRow:  { flexDirection: "row", gap: 12 },
  lastVal:  { fontSize: 12, fontWeight: "700" },

  diskItem:     { gap: 4 },
  diskLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  diskPath:     { fontSize: 12, fontWeight: "600", color: Colors.text, flex: 1 },
  diskPct:      { fontSize: 13, fontWeight: "700" },
  diskDetail:   { fontSize: 11, color: Colors.textSecondary },
  diskTrack:    { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: "hidden" },
  diskFill:     { height: "100%", borderRadius: 4 },
});
