// Task #64 — Grafico trend per il Database Monitor. SVG inline, niente librerie.
// Disegna fino a due serie (una in %, una in valore assoluto scalato al suo max)
// e ombreggia le fasce temporali in cui è stato registrato un sovraccarico.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line, Rect, Text as SvgText } from "react-native-svg";
import Colors from "@/constants/colors";

export interface ChartSeries {
  /** Valori (null = buco nella serie). */
  values: (number | null)[];
  color: string;
  label: string;
  /** Se true la serie è una percentuale 0..100; altrimenti scala su maxAbs. */
  isPct?: boolean;
  /** Suffisso unità per la legenda (es. "%", "ms"). */
  unit?: string;
}

interface Props {
  series: ChartSeries[];
  /** Timestamp (ISO) di ogni punto, per le etichette dell'asse X. */
  timestamps: string[];
  /** Flag di sovraccarico per punto — ombreggia le fasce corrispondenti. */
  overload?: boolean[];
  overloadColor?: string;
  width: number;
  height?: number;
}

const PAD = { top: 12, bottom: 26, left: 34, right: 10 };

function buildPath(
  values: (number | null)[],
  maxVal: number,
  chartW: number,
  chartH: number,
): string {
  if (values.length < 2 || maxVal <= 0) return "";
  let d = "";
  let started = false;
  values.forEach((v, i) => {
    if (v == null) {
      started = false;
      return;
    }
    const x = PAD.left + (i / (values.length - 1)) * chartW;
    const y = PAD.top + chartH - (Math.min(v, maxVal) / maxVal) * chartH;
    d += `${started ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    started = true;
  });
  return d.trim();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const ageH = (now - d.getTime()) / 3600000;
  // Oltre 24h fa mostriamo giorno/mese, altrimenti ora:minuti.
  if (ageH > 24) return `${d.getDate()}/${d.getMonth() + 1}`;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DbMonitorChart({
  series,
  timestamps,
  overload,
  overloadColor = "#ef4444",
  width,
  height = 180,
}: Props) {
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;
  const n = timestamps.length;

  if (n < 2) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>Dati insufficienti per il grafico</Text>
      </View>
    );
  }

  const gridPct = [0, 25, 50, 75, 100];

  // maxAbs per le serie non-percentuali (asse destro condiviso).
  const absVals = series
    .filter((s) => !s.isPct)
    .flatMap((s) => s.values.filter((v): v is number => v != null));
  const maxAbs = Math.max(1, ...absVals);

  const xLabels = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <View style={{ width }}>
      <Svg width={width} height={height}>
        {/* fasce di sovraccarico */}
        {overload?.map((ov, i) => {
          if (!ov) return null;
          const x = PAD.left + (i / (n - 1)) * chartW - chartW / (n - 1) / 2;
          const w = chartW / (n - 1);
          return (
            <Rect
              key={`ov-${i}`}
              x={Math.max(PAD.left, x).toFixed(1)}
              y={PAD.top}
              width={Math.max(1, w).toFixed(1)}
              height={chartH}
              fill={overloadColor}
              opacity={0.14}
            />
          );
        })}

        {/* griglia orizzontale + etichette % */}
        {gridPct.map((g) => {
          const y = PAD.top + chartH - (g / 100) * chartH;
          return (
            <React.Fragment key={`g-${g}`}>
              <Line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke={Colors.border} strokeWidth={0.5} />
              <SvgText x={PAD.left - 4} y={y + 3} fontSize={8} fill={Colors.textSecondary} textAnchor="end">
                {g}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* serie */}
        {series.map((s) => (
          <Path
            key={s.label}
            d={buildPath(s.values, s.isPct ? 100 : maxAbs, chartW, chartH)}
            stroke={s.color}
            strokeWidth={1.6}
            fill="none"
          />
        ))}

        {/* etichette asse X */}
        {xLabels.map((i) => {
          const x = PAD.left + (i / (n - 1)) * chartW;
          return (
            <SvgText
              key={`x-${i}`}
              x={x}
              y={height - 8}
              fontSize={8}
              fill={Colors.textSecondary}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {fmtTime(timestamps[i])}
            </SvgText>
          );
        })}
      </Svg>

      {/* legenda */}
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>
              {s.label}
              {s.unit ? ` (${s.unit})` : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 10 },
});
