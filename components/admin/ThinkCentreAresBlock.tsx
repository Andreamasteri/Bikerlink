import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Polyline, Line, Text as SvgText } from "react-native-svg";
import Colors from "@/constants/colors";
import { ErrorHistory, ProbeLog } from "./ThinkCentreCardParts";
import type { ProbeLogEntry } from "./ThinkCentreCardParts";

export interface AresSample {
  ts: number;
  cpuPct: number | null;
  ramPct: number | null;
  gpuPct: number | null;
}

export interface AresDetailedHealth {
  configured: boolean;
  online: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  metricsConfigured: boolean;
  cpuPct: number | null;
  ramPct: number | null;
  gpuPct: number | null;
  gpuName?: string;
  samples: AresSample[];
  history: Array<{ timestamp: number; error: string }>;
  probeLog?: ProbeLogEntry[];
}

const CPU_COLOR = "#0A84FF";
const RAM_COLOR = "#FF6B35";
const GPU_COLOR = "#34C759";

function pctColor(v: number | null): string {
  if (v == null) return Colors.textSecondary;
  if (v >= 85) return "#ef4444";
  if (v >= 60) return "#f59e0b";
  return "#22c55e";
}

function formatAxisTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("it", { hour: "2-digit", minute: "2-digit" });
}

function MetricRow({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value ?? 0;
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <View style={[styles.metricDot, { backgroundColor: color }]} />
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, { color: pctColor(value) }]}>
          {value != null ? `${value}%` : "—"}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: pctColor(value) }]} />
      </View>
    </View>
  );
}

function AresChart({ samples, width }: { samples: AresSample[]; width: number }) {
  const height = 120;
  if (samples.length < 2 || width < 80) return null;

  const pad = { top: 10, bottom: 26, left: 26, right: 8 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  function toPoints(values: (number | null)[]): string {
    return values
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v != null)
      .map(({ v, i }) => {
        const x = pad.left + (i / (values.length - 1)) * chartW;
        const y = pad.top + chartH - ((v as number) / 100) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const cpuPoints = toPoints(samples.map((s) => s.cpuPct));
  const ramPoints = toPoints(samples.map((s) => s.ramPct));
  const gpuPoints = toPoints(samples.map((s) => s.gpuPct));
  const gridLines = [0, 25, 50, 75, 100];

  const firstTs = samples[0].ts;
  const lastTs = samples[samples.length - 1].ts;
  const midTs = (firstTs + lastTs) / 2;
  const xAxisY = pad.top + chartH + 14;

  return (
    <Svg width={width} height={height}>
      {gridLines.map((p) => {
        const y = pad.top + chartH - (p / 100) * chartH;
        return (
          <React.Fragment key={p}>
            <Line x1={pad.left} y1={y} x2={pad.left + chartW} y2={y} stroke="#ffffff10" strokeWidth={1} />
            <SvgText x={pad.left - 4} y={y + 3} fontSize={8} fill="#888" textAnchor="end">{p}</SvgText>
          </React.Fragment>
        );
      })}
      {cpuPoints ? <Polyline points={cpuPoints} fill="none" stroke={CPU_COLOR} strokeWidth={1.5} /> : null}
      {ramPoints ? <Polyline points={ramPoints} fill="none" stroke={RAM_COLOR} strokeWidth={1.5} /> : null}
      {gpuPoints ? <Polyline points={gpuPoints} fill="none" stroke={GPU_COLOR} strokeWidth={1.5} /> : null}
      <Line x1={pad.left} y1={pad.top + chartH} x2={pad.left + chartW} y2={pad.top + chartH} stroke="#ffffff18" strokeWidth={1} />
      <SvgText x={pad.left} y={xAxisY} fontSize={8} fill="#888" textAnchor="start">{formatAxisTime(firstTs)}</SvgText>
      <SvgText x={pad.left + chartW / 2} y={xAxisY} fontSize={8} fill="#888" textAnchor="middle">{formatAxisTime(midTs)}</SvgText>
      <SvgText x={pad.left + chartW} y={xAxisY} fontSize={8} fill="#888" textAnchor="end">{formatAxisTime(lastTs)}</SvgText>
    </Svg>
  );
}

function ChartLegend() {
  return (
    <View style={styles.legendRow}>
      {[
        { color: CPU_COLOR, label: "CPU" },
        { color: RAM_COLOR, label: "RAM" },
        { color: GPU_COLOR, label: "GPU" },
      ].map((l) => (
        <View key={l.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: l.color }]} />
          <Text style={styles.legendText}>{l.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function AresBlock({
  detail,
  isLoading,
  hasError,
}: {
  detail?: AresDetailedHealth | null;
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);

  const onBodyLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - chartWidth) > 1) setChartWidth(w);
  };

  const statusColor =
    detail == null
      ? hasError
        ? "#ef4444"
        : "#6b7280"
      : !detail.configured
        ? "#6b7280"
        : detail.online
          ? "#22c55e"
          : "#ef4444";

  const subtitleText =
    detail == null
      ? isLoading
        ? "…"
        : hasError
          ? "Errore connessione"
          : "…"
      : !detail.configured
        ? "non configurato"
        : detail.online
          ? `Online${detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}${detail.url ? ` · ${detail.url}` : ""}`
          : detail.error
            ? `Offline · ${detail.error}`
            : "offline";

  const showMetrics = detail != null && detail.online && detail.metricsConfigured;

  return (
    <View style={styles.block}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <MaterialCommunityIcons name="desktop-tower-monitor" size={18} color={statusColor} style={styles.headerIcon} />
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Ares</Text>
            <Text style={styles.titleSub}>Ollama · PC fisso</Text>
          </View>
          <Text style={[styles.subtitle, hasError && detail == null && styles.subtitleError]} numberOfLines={1}>
            {subtitleText}
          </Text>
        </View>
        {detail != null && detail.online && detail.metricsConfigured && (
          <View style={styles.miniStats}>
            {detail.cpuPct != null && <Text style={[styles.miniStat, { color: CPU_COLOR }]}>{detail.cpuPct}%</Text>}
            {detail.gpuPct != null && <Text style={[styles.miniStat, { color: GPU_COLOR }]}>{detail.gpuPct}%</Text>}
          </View>
        )}
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body} onLayout={onBodyLayout}>
          {detail == null && (
            <Text style={[styles.statusLabel, hasError && styles.statusLabelError]}>
              {hasError ? "Errore connessione" : "…"}
            </Text>
          )}

          {detail != null && !detail.configured && (
            <View style={styles.configNote}>
              <Ionicons name="information-circle-outline" size={11} color="#f59e0b" />
              <Text style={styles.configNoteText}>
                Aggiungere DIAG_OLLAMA_URL nei secret Replit (es. https://ollama.biker-link.net).
              </Text>
            </View>
          )}

          {detail != null && detail.configured && (
            <>
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusLabel, !detail.online && styles.statusLabelError]}>
                  {detail.online
                    ? `Online${detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}`
                    : detail.error
                      ? `Offline · ${detail.error}`
                      : "Offline"}
                </Text>
              </View>

              {showMetrics && (
                <>
                  <MetricRow label="CPU" value={detail.cpuPct} color={CPU_COLOR} />
                  <MetricRow label="RAM" value={detail.ramPct} color={RAM_COLOR} />
                  <MetricRow
                    label={detail.gpuName ? `GPU · ${detail.gpuName}` : "GPU"}
                    value={detail.gpuPct}
                    color={GPU_COLOR}
                  />
                  {detail.samples.length >= 2 ? (
                    <>
                      <AresChart samples={detail.samples} width={chartWidth} />
                      <ChartLegend />
                    </>
                  ) : (
                    <Text style={styles.hintText}>Raccolta dati in corso per il grafico storico…</Text>
                  )}
                </>
              )}

              {detail.online && !detail.metricsConfigured && (
                <View style={styles.configNote}>
                  <Ionicons name="information-circle-outline" size={11} color="#f59e0b" />
                  <Text style={styles.configNoteText}>
                    Metriche RAM/CPU/GPU non disponibili: serve un endpoint metriche sul PC fisso
                    (secret ARES_METRICS_URL → JSON {"{ cpu, ram, gpu }"} in %). Prerequisito: l'endpoint
                    va predisposto sul PC, non viene installato da qui.
                  </Text>
                </View>
              )}

              {detail.online && detail.metricsConfigured &&
                detail.cpuPct == null && detail.ramPct == null && detail.gpuPct == null && (
                  <Text style={styles.hintText}>Endpoint metriche raggiunto ma nessun valore leggibile.</Text>
                )}

              {!detail.online && (detail.history?.length ?? 0) > 0 && <ErrorHistory history={detail.history} />}
              {detail.probeLog && detail.probeLog.length > 0 && <ProbeLog entries={detail.probeLog} />}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    backgroundColor: "rgba(148, 163, 184, 0.04)",
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  headerIcon: { marginRight: 2 },
  headerText: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  titleSub: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textSecondary },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  subtitleError: { color: "#ef4444" },
  miniStats: { alignItems: "flex-end", marginRight: 2 },
  miniStat: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.12)",
    paddingTop: 8,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  statusLabelError: { color: "#ef4444" },
  metricRow: { gap: 4 },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  metricDot: { width: 7, height: 7, borderRadius: 4 },
  metricLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary, flex: 1 },
  metricValue: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(148, 163, 184, 0.15)", overflow: "hidden" },
  barFill: { height: 5, borderRadius: 3 },
  legendRow: { flexDirection: "row", gap: 14, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#888" },
  hintText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, fontStyle: "italic" },
  configNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    padding: 8,
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  configNoteText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#f59e0b", flex: 1, lineHeight: 14 },
});
