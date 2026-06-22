import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, Switch, StyleSheet,
} from "react-native";
import Svg, { Polyline, Line, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

// ── Tipi ──────────────────────────────────────────────────────────────────

interface DiskMount {
  path: string;
  usedGb: number;
  totalGb: number;
  usedPct: number;
}

interface MetricsSample {
  cpuTempC:     number | null;
  gpuTempC:     number | null;
  loadAvg1:     number;
  loadAvg5:     number;
  ramUsedMb:    number;
  ramTotalMb:   number;
  swapUsedMb:   number;
  swapTotalMb:  number;
  netRxKBs:     number;
  netTxKBs:     number;
  diskReadKBs:  number;
  diskWriteKBs: number;
  diskMounts:   DiskMount[];
  sampledAt:    string;
}

interface ApiResponse extends MetricsSample {
  online: boolean;
  reason?: string;
}

// ── Costanti ──────────────────────────────────────────────────────────────

const RING_SIZE   = 60;   // ultimi 60 campioni
const POLL_MS     = 5_000;

// ── Linee del grafico SVG ─────────────────────────────────────────────────

const CHART_W  = 260;
const CHART_H  = 60;
const PAD_LEFT = 34;
const PAD_BOT  = 14;

function buildPoints(
  data: (number | null)[],
  minVal: number,
  maxVal: number,
): string {
  const range = maxVal - minVal || 1;
  const w = CHART_W - PAD_LEFT;
  const h = CHART_H - PAD_BOT;
  return data
    .map((v, i) => {
      if (v === null) return null;
      const x = PAD_LEFT + (i / (RING_SIZE - 1)) * w;
      const y = PAD_BOT + h - ((v - minVal) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}

interface LineChartProps {
  title: string;
  unit: string;
  lines: { color: string; label: string; data: (number | null)[] }[];
  min?: number;
  max?: number;
  threshold?: number;
  thresholdColor?: string;
}

function LineChart({ title, unit, lines, min, max, threshold, thresholdColor }: LineChartProps) {
  const allVals = lines.flatMap(l => l.data).filter((v): v is number => v !== null);
  const minVal  = min  ?? (allVals.length ? Math.min(...allVals) : 0);
  const maxVal  = max  ?? (allVals.length ? Math.max(...allVals) * 1.1 : 1);

  const threshY = threshold !== undefined && maxVal > minVal
    ? PAD_BOT + (CHART_H - PAD_BOT) - ((threshold - minVal) / (maxVal - minVal)) * (CHART_H - PAD_BOT)
    : null;

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
      <Svg width={CHART_W} height={CHART_H}>
        {/* Asse Y labels */}
        <SvgText x={PAD_LEFT - 2} y={PAD_BOT + 4}     fontSize={9} fill={Colors.textSecondary} textAnchor="end">
          {formatVal(maxVal, unit)}
        </SvgText>
        <SvgText x={PAD_LEFT - 2} y={CHART_H - 1}     fontSize={9} fill={Colors.textSecondary} textAnchor="end">
          {formatVal(minVal, unit)}
        </SvgText>

        {/* Griglia leggera */}
        <Line x1={PAD_LEFT} y1={PAD_BOT}   x2={CHART_W} y2={PAD_BOT}   stroke={Colors.border} strokeWidth={0.5} />
        <Line x1={PAD_LEFT} y1={CHART_H - PAD_BOT + PAD_BOT} x2={CHART_W} y2={CHART_H - PAD_BOT + PAD_BOT} stroke={Colors.border} strokeWidth={0.5} />

        {/* Soglia */}
        {threshY !== null && (
          <Line
            x1={PAD_LEFT} y1={threshY} x2={CHART_W} y2={threshY}
            stroke={thresholdColor ?? "#ef4444"} strokeWidth={1} strokeDasharray="4 3"
          />
        )}

        {/* Dati */}
        {lines.map(l => {
          const pts = buildPoints(l.data, minVal, maxVal);
          return pts
            ? <Polyline key={l.label} points={pts} fill="none" stroke={l.color} strokeWidth={1.5} strokeLinejoin="round" />
            : null;
        })}
      </Svg>

      {/* Ultimo valore */}
      <View style={ch.lastRow}>
        {lines.map(l => {
          const last = [...l.data].reverse().find(v => v !== null);
          return (
            <Text key={l.label} style={[ch.lastVal, { color: l.color }]}>
              {last !== undefined && last !== null ? `${formatVal(last, unit)}` : "—"}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function formatVal(v: number, unit: string): string {
  if (unit === "°C" || unit === "%" || unit === "KB/s") return `${Math.round(v)}`;
  if (unit === "GB") return v.toFixed(1);
  return `${v}`;
}

// ── Barra spazio disco ────────────────────────────────────────────────────

function DiskBar({ mount }: { mount: DiskMount }) {
  const pct  = Math.min(100, mount.usedPct);
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

// ── Ring buffer ───────────────────────────────────────────────────────────

function makeRing<T>(size: number, fill: T): T[] {
  return Array(size).fill(fill) as T[];
}

const NULL_RING: (number | null)[] = makeRing(RING_SIZE, null);

function pushRing<T>(ring: T[], value: T): T[] {
  const next = [...ring.slice(1), value];
  return next;
}

// ── Componente principale ─────────────────────────────────────────────────

export function ThinkCentreSystemMonitor() {
  const [enabled, setEnabled] = useState(false);
  const [online,  setOnline]  = useState<boolean | null>(null);
  const [reason,  setReason]  = useState<string>("");
  const [lastMounts, setLastMounts] = useState<DiskMount[]>([]);

  const cpuTemp   = useRef<(number | null)[]>([...NULL_RING]);
  const gpuTemp   = useRef<(number | null)[]>([...NULL_RING]);
  const loadAvg   = useRef<(number | null)[]>([...NULL_RING]);
  const ramPct    = useRef<(number | null)[]>([...NULL_RING]);
  const netRx     = useRef<(number | null)[]>([...NULL_RING]);
  const netTx     = useRef<(number | null)[]>([...NULL_RING]);
  const diskRead  = useRef<(number | null)[]>([...NULL_RING]);
  const diskWrite = useRef<(number | null)[]>([...NULL_RING]);

  const [, setTick] = useState(0);

  const poll = useCallback(async () => {
    try {
      const url = new URL("/api/admin/thinkcentre-metrics", getApiUrl()).toString();
      const res = await fetch(url, {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        setOnline(false);
        setReason(`HTTP ${res.status}`);
        return;
      }
      const data: ApiResponse = await res.json();
      if (!data.online) {
        setOnline(false);
        setReason(data.reason ?? "non raggiungibile");
        return;
      }

      setOnline(true);
      setReason("");
      setLastMounts(data.diskMounts ?? []);

      const ramPctVal = data.ramTotalMb > 0
        ? Math.round((data.ramUsedMb / data.ramTotalMb) * 100)
        : null;

      cpuTemp.current   = pushRing(cpuTemp.current,   data.cpuTempC ?? null);
      gpuTemp.current   = pushRing(gpuTemp.current,   data.gpuTempC ?? null);
      loadAvg.current   = pushRing(loadAvg.current,   data.loadAvg1);
      ramPct.current    = pushRing(ramPct.current,    ramPctVal);
      netRx.current     = pushRing(netRx.current,     data.netRxKBs);
      netTx.current     = pushRing(netTx.current,     data.netTxKBs);
      diskRead.current  = pushRing(diskRead.current,  data.diskReadKBs);
      diskWrite.current = pushRing(diskWrite.current, data.diskWriteKBs);

      setTick(t => t + 1);
    } catch {
      setOnline(false);
      setReason("timeout / non raggiungibile");
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // reset buffer quando si disattiva
      cpuTemp.current   = [...NULL_RING];
      gpuTemp.current   = [...NULL_RING];
      loadAvg.current   = [...NULL_RING];
      ramPct.current    = [...NULL_RING];
      netRx.current     = [...NULL_RING];
      netTx.current     = [...NULL_RING];
      diskRead.current  = [...NULL_RING];
      diskWrite.current = [...NULL_RING];
      setOnline(null);
      setReason("");
      setLastMounts([]);
      return;
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, poll]);

  return (
    <ScrollView contentContainerStyle={ch.container}>
      {/* Toggle + badge */}
      <View style={ch.toggleRow}>
        <View style={ch.toggleLeft}>
          <Ionicons name="server-outline" size={18} color={enabled ? Colors.accent : Colors.textSecondary} />
          <Text style={ch.toggleLabel}>Monitor live ThinkCentre</Text>
        </View>
        <View style={ch.rightRow}>
          {online !== null && (
            <View style={[ch.badge, { backgroundColor: online ? "#22c55e22" : "#ef444422" }]}>
              <View style={[ch.badgeDot, { backgroundColor: online ? "#22c55e" : "#ef4444" }]} />
              <Text style={[ch.badgeText, { color: online ? "#22c55e" : "#ef4444" }]}>
                {online ? "ONLINE" : "OFFLINE"}
              </Text>
            </View>
          )}
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
            thumbColor={enabled ? Colors.accent : Colors.textSecondary}
          />
        </View>
      </View>

      {!enabled && (
        <View style={ch.offState}>
          <Ionicons name="power-outline" size={28} color={Colors.textSecondary} />
          <Text style={ch.offText}>Abilita il toggle per avviare il monitoraggio</Text>
          <Text style={ch.offSub}>Polling ogni 5s — finestra 5 minuti</Text>
        </View>
      )}

      {enabled && !online && online !== null && (
        <View style={ch.offlineState}>
          <Ionicons name="cloud-offline-outline" size={28} color="#ef4444" />
          <Text style={ch.offlineTitle}>Server non raggiungibile</Text>
          {reason ? <Text style={ch.offlineReason}>{reason}</Text> : null}
        </View>
      )}

      {enabled && (
        <>
          <LineChart
            title="CPU Temperatura"
            unit="°C"
            lines={[{ color: "#f97316", label: "CPU", data: cpuTemp.current }]}
            threshold={85}
            thresholdColor="#ef4444"
          />

          <LineChart
            title="GPU Temperatura"
            unit="°C"
            lines={[{ color: "#3b82f6", label: "GPU", data: gpuTemp.current }]}
          />

          <LineChart
            title="CPU Load Avg 1m"
            unit=""
            lines={[{ color: "#22c55e", label: "load1", data: loadAvg.current }]}
            min={0}
          />

          <LineChart
            title="RAM Usata"
            unit="%"
            lines={[{ color: "#a855f7", label: "RAM", data: ramPct.current }]}
            min={0}
            max={100}
          />

          <LineChart
            title="Rete"
            unit="KB/s"
            lines={[
              { color: "#06b6d4", label: "RX",  data: netRx.current },
              { color: "#eab308", label: "TX",  data: netTx.current },
            ]}
            min={0}
          />

          <LineChart
            title="I/O Disco"
            unit="KB/s"
            lines={[
              { color: "#86efac", label: "Read",  data: diskRead.current },
              { color: "#fca5a5", label: "Write", data: diskWrite.current },
            ]}
            min={0}
          />

          {/* Spazio disco — widget statico */}
          {lastMounts.length > 0 && (
            <View style={ch.diskBox}>
              <Text style={ch.sectionTitle}>Spazio Disco</Text>
              {lastMounts.map(m => <DiskBar key={m.path} mount={m} />)}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ── Stili ─────────────────────────────────────────────────────────────────

const ch = StyleSheet.create({
  container: { padding: 12, gap: 10 },

  toggleRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.card, borderRadius: 10,
    padding: 12, gap: 10,
  },
  toggleLeft:  { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: Colors.text },
  rightRow:    { flexDirection: "row", alignItems: "center", gap: 8 },

  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  badgeDot:  { width: 7, height: 7, borderRadius: 3.5 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  offState: {
    alignItems: "center", padding: 40, gap: 8,
    backgroundColor: Colors.card, borderRadius: 10,
  },
  offText: { fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  offSub:  { fontSize: 12, color: Colors.textSecondary },

  offlineState: {
    alignItems: "center", padding: 30, gap: 6,
    backgroundColor: "#ef444411", borderRadius: 10,
    borderWidth: 1, borderColor: "#ef444433",
  },
  offlineTitle:  { fontSize: 15, fontWeight: "700", color: "#ef4444" },
  offlineReason: { fontSize: 12, color: Colors.textSecondary, textAlign: "center" },

  chartBox: {
    backgroundColor: Colors.card, borderRadius: 10,
    padding: 10, gap: 4,
  },
  chartHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  chartTitle:  { fontSize: 12, fontWeight: "600", color: Colors.text },
  legendRow:   { flexDirection: "row", gap: 8 },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: Colors.textSecondary },

  lastRow: { flexDirection: "row", gap: 12 },
  lastVal: { fontSize: 12, fontWeight: "700" },

  diskBox: {
    backgroundColor: Colors.card, borderRadius: 10, padding: 12, gap: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: Colors.text, marginBottom: 2 },

  diskItem:     { gap: 4 },
  diskLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  diskPath:     { fontSize: 12, fontWeight: "600", color: Colors.text, flex: 1 },
  diskPct:      { fontSize: 13, fontWeight: "700" },
  diskDetail:   { fontSize: 11, color: Colors.textSecondary },
  diskTrack:    {
    height: 8, borderRadius: 4,
    backgroundColor: Colors.border, overflow: "hidden",
  },
  diskFill:     { height: "100%", borderRadius: 4 },
});
