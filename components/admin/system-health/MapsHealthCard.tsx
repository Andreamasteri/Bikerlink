// Task #2686 — Card "Maps Health" per app/admin/system-health.tsx.
// Visualizza score derivato dai problems source==='maps', breakdown
// (renderer/engine), kill-switch flags e mini-sparkline buckets.
import React from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest, getQueryFnWithTimeout, ServerBusyError } from "@/lib/query-client";
import { ErrorRetryCard } from "@/components/admin/shared/ErrorRetryCard";
import Colors from "@/constants/colors";
import { router } from "expo-router";

type FlagKey = "telemetry" | "collector" | "llm" | "alerts";

interface SummaryResp {
  telemetry: {
    windowMs: number;
    counts: { mapInit: number; mapInitFailed: number; webviewCrash: number; tileLoadError: number; routingFailed: number; gpsLost: number };
    renderCount: number; renderAvgMs: number;
  };
  health: { at: number; results: Array<{ kind: string; id: string; ok: boolean; latencyMs: number | null; statusCode?: number; error?: string }> };
  routing: { successes: number; fallbacks: number; failures: number; enginesDown: Record<string, number | null> };
  flags: Record<FlagKey, boolean>;
}
interface BucketsResp {
  minutes: number;
  buckets: Array<{ at: string; events: number; errors: number }>;
}

const FLAG_LABELS: Record<FlagKey, string> = {
  telemetry: "Telemetria client", collector: "Collector lato server",
  llm: "Diagnosi LLM mappe", alerts: "Push alert maps",
};

export function MapsHealthCard() {
  const qc = useQueryClient();
  const summaryQ = useQuery<SummaryResp>({
    queryKey: ["/api/admin/watchdog/maps/summary"],
    queryFn: getQueryFnWithTimeout<SummaryResp>(10_000),
    refetchInterval: 20_000,
    retry: (count, err) => {
      if (err instanceof ServerBusyError) return count < 3;
      return false;
    },
    retryDelay: (index, err) => {
      if (err instanceof ServerBusyError) return Math.min(8_000, 2_000 * Math.pow(2, index));
      return 1_000;
    },
  });
  const bucketsQ = useQuery<BucketsResp>({
    queryKey: ["/api/admin/watchdog/maps/buckets?minutes=1440"],
    queryFn: getQueryFnWithTimeout<BucketsResp>(10_000),
    refetchInterval: 30_000,
    retry: (count, err) => {
      if (err instanceof ServerBusyError) return count < 3;
      return false;
    },
    retryDelay: (index, err) => {
      if (err instanceof ServerBusyError) return Math.min(8_000, 2_000 * Math.pow(2, index));
      return 1_000;
    },
  });
  const toggleFlag = useMutation({
    mutationFn: async (vars: { flag: FlagKey; enabled: boolean }) =>
      (await apiRequest("POST", "/api/admin/watchdog/maps/flags", vars)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/maps/summary"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });
  const runHealth = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/watchdog/maps/health/run")).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/maps/summary"] }),
  });

  if (summaryQ.isLoading) {
    return <View style={s.card}><ActivityIndicator color={Colors.accent} /></View>;
  }
  if (summaryQ.isError) {
    return (
      <ErrorRetryCard
        message={
          summaryQ.error instanceof Error && summaryQ.error.name === "AbortError"
            ? "Il backend sta rispondendo lentamente — riprova"
            : "Impossibile caricare Maps Health — riprova"
        }
        onRetry={() => { summaryQ.refetch(); bucketsQ.refetch(); }}
      />
    );
  }
  if (!summaryQ.data) {
    return <View style={s.card}><Text style={s.muted}>Maps health non disponibile.</Text></View>;
  }
  const d = summaryQ.data;
  const totalErr = d.telemetry.counts.webviewCrash + d.telemetry.counts.tileLoadError + d.telemetry.counts.routingFailed + d.telemetry.counts.mapInitFailed;
  const total = d.telemetry.counts.mapInit + d.telemetry.renderCount + totalErr || 1;
  const score = Math.max(0, Math.min(100, Math.round(100 - (totalErr / total) * 100)));
  const status: "green" | "yellow" | "red" = score >= 90 ? "green" : score >= 70 ? "yellow" : "red";

  const buckets = bucketsQ.data?.buckets ?? [];
  const maxB = Math.max(1, ...buckets.map((b) => b.events));

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.row}>
          <View style={[s.dot, status === "green" ? s.dotGreen : status === "yellow" ? s.dotYellow : s.dotRed]} />
          <Text style={s.title}>Maps Health  ·  {score}/100</Text>
        </View>
        <View style={s.btnRow}>
          <TouchableOpacity style={s.smallBtn} onPress={() => runHealth.mutate()} disabled={runHealth.isPending}>
            <MaterialCommunityIcons name="lan-check" size={14} color="#fff" />
            <Text style={s.smallBtnText}>Health-check</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.smallBtn} onPress={() => router.push("/admin/maps")}>
            <MaterialCommunityIcons name="map-marker-radius" size={14} color="#fff" />
            <Text style={s.smallBtnText}>Maps admin</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.metricsRow}>
        <Metric label="Init OK" value={d.telemetry.counts.mapInit} />
        <Metric label="Init KO" value={d.telemetry.counts.mapInitFailed} bad={d.telemetry.counts.mapInitFailed > 0} />
        <Metric label="Crash WV" value={d.telemetry.counts.webviewCrash} bad={d.telemetry.counts.webviewCrash > 0} />
        <Metric label="Tile err" value={d.telemetry.counts.tileLoadError} bad={d.telemetry.counts.tileLoadError > 5} />
        <Metric label="GPS lost" value={d.telemetry.counts.gpsLost} bad={d.telemetry.counts.gpsLost > 3} />
        <Metric label="Render ms" value={Math.round(d.telemetry.renderAvgMs)} />
      </View>

      <View style={s.routingRow}>
        <Text style={s.muted}>
          Routing (5m): {d.routing.successes} OK · {d.routing.fallbacks} fb · {d.routing.failures} err
        </Text>
        {Object.entries(d.routing.enginesDown).filter(([, v]) => v !== null).map(([eng]) => (
          <Text key={eng} style={s.errInline}>· {eng} DOWN</Text>
        ))}
      </View>

      {buckets.length > 0 ? (
        <View style={s.spark}>
          {buckets.slice(-30).map((b, i) => {
            const h = Math.max(2, Math.round((b.events / maxB) * 28));
            return (
              <View
                key={i}
                style={[s.sparkBar, { height: h, backgroundColor: b.errors > 0 ? "#ef4444" : Colors.accent }]}
              />
            );
          })}
        </View>
      ) : null}

      <View style={s.healthList}>
        {d.health.results.slice(0, 6).map((r) => (
          <View key={`${r.kind}-${r.id}`} style={s.healthItem}>
            <MaterialCommunityIcons
              name={r.ok ? "check-circle" : "alert-circle"}
              size={14}
              color={r.ok ? "#22c55e" : "#ef4444"}
            />
            <Text style={s.healthLabel}>{r.kind === "tile" ? "tile" : "engine"} {r.id}</Text>
            <Text style={[s.muted, !r.ok && r.latencyMs == null ? s.errInline : null]}>
              {r.latencyMs != null ? `${r.latencyMs}ms` : r.ok ? "—" : (r.error?.slice(0, 35) ?? "offline")}
            </Text>
          </View>
        ))}
      </View>

      <View style={s.flagsBox}>
        {(Object.keys(FLAG_LABELS) as FlagKey[]).map((k) => (
          <View key={k} style={s.flagRow}>
            <Text style={s.flagLabel}>{FLAG_LABELS[k]}</Text>
            <Switch
              value={!!d.flags[k]}
              onValueChange={(v) => toggleFlag.mutate({ flag: k, enabled: v })}
              disabled={toggleFlag.isPending}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <View style={s.metric}>
      <Text style={[s.metricValue, bad ? s.metricBad : null]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#f3f4f6", fontSize: 15, fontWeight: "700" as const },
  muted: { color: "#9ca3af", fontSize: 12 },
  errInline: { color: "#ef4444", fontSize: 12, marginLeft: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: "#22c55e" }, dotYellow: { backgroundColor: "#f59e0b" }, dotRed: { backgroundColor: "#ef4444" },
  btnRow: { flexDirection: "row", gap: 6 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1f2937", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  smallBtnText: { color: "#fff", fontSize: 11, fontWeight: "600" as const },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  metric: { backgroundColor: "#1f2937", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 64, alignItems: "center" },
  metricValue: { color: "#f3f4f6", fontSize: 16, fontWeight: "700" as const },
  metricBad: { color: "#ef4444" },
  metricLabel: { color: "#9ca3af", fontSize: 10, marginTop: 1 },
  routingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 10 },
  spark: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 32, marginTop: 12 },
  sparkBar: { width: 6, borderRadius: 2 },
  healthList: { marginTop: 12, gap: 4 },
  healthItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  healthLabel: { color: "#d1d5db", fontSize: 12, flex: 1 },
  flagsBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#1f2937", paddingTop: 10, gap: 6 },
  flagRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  flagLabel: { color: "#d1d5db", fontSize: 12 },
});
