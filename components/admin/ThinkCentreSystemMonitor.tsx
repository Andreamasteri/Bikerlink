// Task #354 — Monitor ThinkCentre con storico 24h/7gg e toggle linee.
// I componenti di rendering (LineChart, DiskBar, VramBar, buildPoints) sono
// in ThinkCentreCharts.tsx per mantenere questo file sotto 600 righe.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, Switch, TouchableOpacity, ActivityIndicator, StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import {
  LineChart, DiskBar, VramBar,
  type DiskMount, type XLabel,
} from "./ThinkCentreCharts";

// ── Tipi ──────────────────────────────────────────────────────────────────

interface MetricsSample {
  cpuTempC:     number | null;
  gpuTempC:     number | null;
  gpuUtilPct?:  number | null;
  vramUsedMb?:  number | null;
  vramTotalMb?: number | null;
  gpuName?:     string | null;
  loadAvg1:     number;
  ramUsedMb:    number;
  ramTotalMb:   number;
  netRxKBs:     number;
  netTxKBs:     number;
  diskReadKBs:  number;
  diskWriteKBs: number;
  diskMounts:   DiskMount[];
}

interface ApiResponse extends MetricsSample { online: boolean; reason?: string }

interface TcHistorySample {
  sampledAt:    string;
  online:       boolean;
  cpuTempC:     number | null;
  gpuTempC:     number | null;
  gpuUtilPct:   number | null;
  vramUsedMb:   number | null;
  vramTotalMb:  number | null;
  loadAvg1:     number | null;
  ramUsedPct:   number | null;
  netRxKbs:     number | null;
  netTxKbs:     number | null;
  diskReadKbs:  number | null;
  diskWriteKbs: number | null;
}

interface HistoryResponse { range: string; samples: TcHistorySample[] }

type RangeMode = "live" | "24h" | "7d";

// ── Costanti ──────────────────────────────────────────────────────────────

const RING_SIZE  = 60;
const POLL_MS    = 5_000;
const ASYNC_KEY  = "tc_monitor_visible_lines"; // chiave AsyncStorage
const DAY_IT     = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

// ── Ring buffer ───────────────────────────────────────────────────────────

function makeRing<T>(size: number, fill: T): T[] { return Array(size).fill(fill) as T[]; }
const NULL_RING: (number | null)[] = makeRing(RING_SIZE, null);
function pushRing<T>(ring: T[], value: T): T[] { return [...ring.slice(1), value]; }

// ── Etichette asse X per vista storica ────────────────────────────────────

function buildXLabels(samples: TcHistorySample[], range: "24h" | "7d"): XLabel[] {
  if (samples.length < 2) return [];
  const first = new Date(samples[0].sampledAt).getTime();
  const last  = new Date(samples[samples.length - 1].sampledAt).getTime();
  const intervalMs = range === "24h" ? 4 * 3_600_000 : 24 * 3_600_000;
  const results: XLabel[] = [];

  for (let target = first; target <= last + intervalMs / 2; target += intervalMs) {
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(new Date(samples[i].sampledAt).getTime() - target);
      if (d < minDiff) { minDiff = d; closest = i; }
    }
    if (results.some(r => r.idx === closest)) continue;
    const dt = new Date(samples[closest].sampledAt);
    const label = range === "24h"
      ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`
      : `${DAY_IT[dt.getDay()]} ${dt.getDate()}`;
    results.push({ idx: closest, label });
  }
  return results;
}

// ── Componente principale ─────────────────────────────────────────────────

export function ThinkCentreSystemMonitor() {
  const [enabled,     setEnabled]     = useState(false);
  const [online,      setOnline]      = useState<boolean | null>(null);
  const [reason,      setReason]      = useState("");
  const [lastMounts,  setLastMounts]  = useState<DiskMount[]>([]);
  const [gpu, setGpu] = useState<{ vramUsedMb: number | null; vramTotalMb: number | null; name: string | null } | null>(null);

  // ── Toggle linee persistito ─────────────────────────────────────────────
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const toggleLine = useCallback((label: string) => {
    setHiddenLines(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      AsyncStorage.setItem(ASYNC_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(ASYNC_KEY).then(val => {
      if (val) { try { setHiddenLines(new Set(JSON.parse(val) as string[])); } catch { /* JSON malformato: ignora */ } }
    }).catch(() => {});
  }, []);

  // ── Ring buffer live ────────────────────────────────────────────────────
  const cpuTemp   = useRef<(number | null)[]>([...NULL_RING]);
  const gpuTemp   = useRef<(number | null)[]>([...NULL_RING]);
  const gpuUtil   = useRef<(number | null)[]>([...NULL_RING]);
  const loadAvg   = useRef<(number | null)[]>([...NULL_RING]);
  const ramPct    = useRef<(number | null)[]>([...NULL_RING]);
  const netRx     = useRef<(number | null)[]>([...NULL_RING]);
  const netTx     = useRef<(number | null)[]>([...NULL_RING]);
  const diskRead  = useRef<(number | null)[]>([...NULL_RING]);
  const diskWrite = useRef<(number | null)[]>([...NULL_RING]);
  const [, setTick] = useState(0);

  // ── Storico ────────────────────────────────────────────────────────────
  const [rangeMode,    setRangeMode]    = useState<RangeMode>("live");
  const [historyData,  setHistoryData]  = useState<TcHistorySample[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [histLoading,  setHistLoading]  = useState(false);

  // ── Poll live ──────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const url = new URL("/api/admin/thinkcentre-metrics", getApiUrl()).toString();
      const res = await fetch(url, {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) { setOnline(false); setReason(`HTTP ${res.status}`); return; }
      const data: ApiResponse = await res.json();
      if (!data.online) { setOnline(false); setReason(data.reason ?? "non raggiungibile"); return; }

      setOnline(true);
      setReason("");
      setLastMounts(data.diskMounts ?? []);
      const hasGpu = data.gpuUtilPct != null || data.vramUsedMb != null || data.vramTotalMb != null;
      setGpu(hasGpu ? { vramUsedMb: data.vramUsedMb ?? null, vramTotalMb: data.vramTotalMb ?? null, name: data.gpuName ?? null } : null);

      const ramPctVal = data.ramTotalMb > 0 ? Math.round((data.ramUsedMb / data.ramTotalMb) * 100) : null;
      cpuTemp.current   = pushRing(cpuTemp.current,   data.cpuTempC ?? null);
      gpuTemp.current   = pushRing(gpuTemp.current,   data.gpuTempC ?? null);
      gpuUtil.current   = pushRing(gpuUtil.current,   data.gpuUtilPct ?? null);
      loadAvg.current   = pushRing(loadAvg.current,   data.loadAvg1);
      ramPct.current    = pushRing(ramPct.current,    ramPctVal);
      netRx.current     = pushRing(netRx.current,     data.netRxKBs);
      netTx.current     = pushRing(netTx.current,     data.netTxKBs);
      diskRead.current  = pushRing(diskRead.current,  data.diskReadKBs);
      diskWrite.current = pushRing(diskWrite.current, data.diskWriteKBs);
      setTick(t => t + 1);
    } catch { setOnline(false); setReason("timeout / non raggiungibile"); }
  }, []);

  // ── Fetch storico ──────────────────────────────────────────────────────
  const fetchHistory = useCallback(async (mode: "24h" | "7d") => {
    setHistLoading(true);
    setHistoryError(false);
    try {
      const url = new URL(`/api/admin/tc-metrics-history?range=${mode}`, getApiUrl()).toString();
      const res = await fetch(url, { headers: { ...(await authFetchHeaders()) }, credentials: "include" });
      if (!res.ok) { setHistoryError(true); return; }
      const data: HistoryResponse = await res.json();
      setHistoryData(data.samples);
    } catch { setHistoryError(true); }
    finally { setHistLoading(false); }
  }, []);

  // ── Reset buffer al disattivazione ────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      cpuTemp.current = [...NULL_RING]; gpuTemp.current = [...NULL_RING];
      gpuUtil.current = [...NULL_RING]; loadAvg.current = [...NULL_RING];
      ramPct.current  = [...NULL_RING]; netRx.current   = [...NULL_RING];
      netTx.current   = [...NULL_RING]; diskRead.current = [...NULL_RING];
      diskWrite.current = [...NULL_RING];
      setOnline(null); setReason(""); setLastMounts([]); setHistoryData(null);
      return;
    }
    if (rangeMode === "live") {
      poll();
      const id = setInterval(poll, POLL_MS);
      return () => clearInterval(id);
    }
    // In modalità storica non si fa polling live
    fetchHistory(rangeMode as "24h" | "7d").catch(() => {});
  }, [enabled, rangeMode, poll, fetchHistory]);

  // ── Dati grafici storico ───────────────────────────────────────────────
  const hist = historyData ?? [];
  const xLabels = hist.length > 1 && rangeMode !== "live"
    ? buildXLabels(hist, rangeMode as "24h" | "7d")
    : undefined;

  const hLine = (fn: (s: TcHistorySample) => number | null) => hist.map(fn);

  const isHistory = rangeMode !== "live" && enabled;
  const showCharts = enabled && (rangeMode === "live" || (isHistory && !historyError && hist.length > 0));

  return (
    <ScrollView contentContainerStyle={ch.container}>
      {/* Toggle + badge */}
      <View style={ch.toggleRow}>
        <View style={ch.toggleLeft}>
          <Ionicons name="server-outline" size={18} color={enabled ? Colors.accent : Colors.textSecondary} />
          <Text style={ch.toggleLabel}>Monitor ThinkCentre</Text>
        </View>
        <View style={ch.rightRow}>
          {online !== null && rangeMode === "live" && (
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

      {/* Selettore range */}
      {enabled && (
        <View style={ch.pillRow}>
          {(["live", "24h", "7d"] as RangeMode[]).map(r => (
            <TouchableOpacity key={r} onPress={() => setRangeMode(r)}
              style={[ch.pill, rangeMode === r && ch.pillActive]}>
              <Text style={[ch.pillText, rangeMode === r && ch.pillTextActive]}>
                {r === "live" ? "Live" : r === "24h" ? "24h" : "7gg"}
              </Text>
            </TouchableOpacity>
          ))}
          {isHistory && (
            <TouchableOpacity onPress={() => fetchHistory(rangeMode as "24h" | "7d")} style={ch.refreshBtn}>
              {histLoading
                ? <ActivityIndicator size="small" color={Colors.accent} />
                : <Ionicons name="refresh-outline" size={16} color={Colors.accent} />}
              <Text style={ch.refreshText}>Aggiorna</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {enabled && rangeMode === "live" && !online && online !== null && (
        <View style={ch.offlineState}>
          <Ionicons name="cloud-offline-outline" size={28} color="#ef4444" />
          <Text style={ch.offlineTitle}>Server non raggiungibile</Text>
          {reason ? <Text style={ch.offlineReason}>{reason}</Text> : null}
        </View>
      )}

      {isHistory && historyError && (
        <View style={ch.offlineState}>
          <Ionicons name="warning-outline" size={28} color="#f59e0b" />
          <Text style={ch.offlineTitle}>Storico non disponibile</Text>
          <Text style={ch.offlineReason}>Riprova o torna alla vista Live</Text>
        </View>
      )}

      {isHistory && histLoading && hist.length === 0 && (
        <View style={ch.loadingBox}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={ch.loadingText}>Caricamento storico…</Text>
        </View>
      )}

      {showCharts && (
        <>
          <LineChart
            title="CPU Temperatura" unit="°C"
            lines={[{ color: "#f97316", label: "CPU", data: isHistory ? hLine(s => s.cpuTempC) : cpuTemp.current }]}
            threshold={85} thresholdColor="#ef4444"
            hiddenLines={hiddenLines} onToggleLine={toggleLine}
            xLabels={isHistory ? xLabels : undefined}
          />
          <LineChart
            title="GPU Temperatura" unit="°C"
            lines={[{ color: "#3b82f6", label: "GPU", data: isHistory ? hLine(s => s.gpuTempC) : gpuTemp.current }]}
            hiddenLines={hiddenLines} onToggleLine={toggleLine}
            xLabels={isHistory ? xLabels : undefined}
          />
          {(gpu || (isHistory && hist.some(s => s.gpuUtilPct != null))) && (
            <LineChart
              title={gpu?.name ? `GPU Utilizzo — ${gpu.name}` : "GPU Utilizzo"} unit="%"
              lines={[{ color: "#ec4899", label: "GPU", data: isHistory ? hLine(s => s.gpuUtilPct) : gpuUtil.current }]}
              min={0} max={100}
              hiddenLines={hiddenLines} onToggleLine={toggleLine}
              xLabels={isHistory ? xLabels : undefined}
            />
          )}
          {!isHistory && gpu?.vramTotalMb != null && gpu.vramTotalMb > 0 && (
            <View style={ch.diskBox}>
              <Text style={ch.sectionTitle}>VRAM</Text>
              <VramBar usedMb={gpu.vramUsedMb ?? 0} totalMb={gpu.vramTotalMb} />
            </View>
          )}
          <LineChart
            title="CPU Load Avg 1m" unit=""
            lines={[{ color: "#22c55e", label: "load1", data: isHistory ? hLine(s => s.loadAvg1) : loadAvg.current }]}
            min={0}
            hiddenLines={hiddenLines} onToggleLine={toggleLine}
            xLabels={isHistory ? xLabels : undefined}
          />
          <LineChart
            title="RAM Usata" unit="%"
            lines={[{ color: "#a855f7", label: "RAM", data: isHistory ? hLine(s => s.ramUsedPct) : ramPct.current }]}
            min={0} max={100}
            hiddenLines={hiddenLines} onToggleLine={toggleLine}
            xLabels={isHistory ? xLabels : undefined}
          />
          <LineChart
            title="Rete" unit="KB/s"
            lines={[
              { color: "#06b6d4", label: "RX", data: isHistory ? hLine(s => s.netRxKbs) : netRx.current },
              { color: "#eab308", label: "TX", data: isHistory ? hLine(s => s.netTxKbs) : netTx.current },
            ]}
            min={0}
            hiddenLines={hiddenLines} onToggleLine={toggleLine}
            xLabels={isHistory ? xLabels : undefined}
          />
          <LineChart
            title="I/O Disco" unit="KB/s"
            lines={[
              { color: "#86efac", label: "Read",  data: isHistory ? hLine(s => s.diskReadKbs)  : diskRead.current },
              { color: "#fca5a5", label: "Write", data: isHistory ? hLine(s => s.diskWriteKbs) : diskWrite.current },
            ]}
            min={0}
            hiddenLines={hiddenLines} onToggleLine={toggleLine}
            xLabels={isHistory ? xLabels : undefined}
          />
          {!isHistory && lastMounts.length > 0 && (
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

  toggleRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 10, padding: 12, gap: 10 },
  toggleLeft:  { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: Colors.text },
  rightRow:    { flexDirection: "row", alignItems: "center", gap: 8 },

  badge:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeDot: { width: 7, height: 7, borderRadius: 3.5 },
  badgeText:{ fontSize: 11, fontWeight: "700" },

  pillRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  pill:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.border },
  pillActive:   { backgroundColor: Colors.accent },
  pillText:     { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  pillTextActive: { color: "#fff" },

  refreshBtn:  { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" as never, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.accent + "66" },
  refreshText: { fontSize: 12, color: Colors.accent, fontWeight: "600" },

  offState:   { alignItems: "center", padding: 40, gap: 8, backgroundColor: Colors.card, borderRadius: 10 },
  offText:    { fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  offSub:     { fontSize: 12, color: Colors.textSecondary },

  offlineState: { alignItems: "center", padding: 30, gap: 6, backgroundColor: "#ef444411", borderRadius: 10, borderWidth: 1, borderColor: "#ef444433" },
  offlineTitle: { fontSize: 15, fontWeight: "700", color: "#ef4444" },
  offlineReason:{ fontSize: 12, color: Colors.textSecondary, textAlign: "center" },

  loadingBox:  { alignItems: "center", padding: 30, gap: 8, backgroundColor: Colors.card, borderRadius: 10 },
  loadingText: { fontSize: 13, color: Colors.textSecondary },

  diskBox:     { backgroundColor: Colors.card, borderRadius: 10, padding: 12, gap: 8 },
  sectionTitle:{ fontSize: 13, fontWeight: "600", color: Colors.text, marginBottom: 2 },
});
