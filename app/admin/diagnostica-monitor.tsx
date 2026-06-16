import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import s from "./diagnostica-styles";
import {
  PipelineHole, HolesResult, PipelineRunResult,
  adminFetch, overallColor, statusColor, timeAgo, ageLabel,
} from "./diagnostica-types";

export function TelemetryProbeCard() {
  const qc = useQueryClient();
  const [runningProbe, setRunningProbe] = useState(false);

  const { data: lastData, isLoading } = useQuery<{ result: PipelineRunResult | null; inProgress: boolean }>({
    queryKey: ["/api/admin/pipeline-check/last"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/pipeline-check/last");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const r = await adminFetch("/api/admin/pipeline-check/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "telemetry_ride" }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<PipelineRunResult>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pipeline-check/last"] });
      setRunningProbe(false);
    },
    onError: () => { setRunningProbe(false); },
  });

  const telemetryResult = lastData?.result?.pipelines.find(p => p.pipeline === "telemetry_ride") ?? null;
  const runAt = lastData?.result?.generatedAt ?? null;
  const inProgress = runningProbe || lastData?.inProgress || runMutation.isPending;
  const borderColor = telemetryResult ? overallColor(telemetryResult.overall) : Colors.border;

  return (
    <View style={[s.probeCard, { borderLeftColor: borderColor }]}>
      <View style={s.probeHeader}>
        <View style={s.probeHeaderLeft}>
          <MaterialCommunityIcons name="road-variant" size={18} color={Colors.accent} />
          <Text style={s.probeTitle}>Telemetria Ride</Text>
        </View>
        <TouchableOpacity
          style={[s.probeRunBtn, inProgress && s.runButtonDisabled]}
          onPress={() => { setRunningProbe(true); runMutation.mutate(); }}
          disabled={inProgress}
          activeOpacity={0.75}
        >
          {inProgress
            ? <ActivityIndicator color={Colors.accent} size="small" />
            : <Ionicons name="refresh" size={14} color={Colors.accent} />}
          <Text style={s.probeRunBtnText}>{inProgress ? "In corso…" : "Riesegui"}</Text>
        </TouchableOpacity>
      </View>

      {isLoading && !telemetryResult ? (
        <ActivityIndicator color={Colors.accent} style={{ alignSelf: "flex-start", margin: 8 }} />
      ) : telemetryResult ? (
        <>
          <View style={s.probeStatusRow}>
            {telemetryResult.overall === "ok"
              ? <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
              : <Ionicons name="close-circle" size={22} color="#ef4444" />}
            <Text style={[s.probeStatusText, { color: overallColor(telemetryResult.overall) }]}>
              {telemetryResult.overall === "ok" ? "PASS" : telemetryResult.overall === "degraded" ? "DEGRADED" : "FAIL"}
            </Text>
            <Text style={s.probeDur}>{telemetryResult.durationMs}ms</Text>
            {runAt && <Text style={s.probeTimestamp}>· {timeAgo(runAt)} fa</Text>}
          </View>

          <View style={s.probeSteps}>
            {telemetryResult.steps.map((step, i) => (
              <View key={i} style={s.probeStepRow}>
                <View style={[s.probeStepDot, { backgroundColor: statusColor(step.status) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.probeStepName}>{step.name}</Text>
                  {step.message ? (
                    <Text style={[s.probeStepMsg, step.status === "error" && { color: "#ef4444" }]}>
                      {step.message}
                    </Text>
                  ) : null}
                </View>
                <Text style={[s.probeStepDur, { color: statusColor(step.status) }]}>
                  {step.durationMs}ms
                </Text>
              </View>
            ))}
          </View>

          {telemetryResult.suggestedFix && (
            <View style={s.suggestedFix}>
              <Ionicons name="bulb-outline" size={13} color="#f59e0b" />
              <Text style={s.suggestedFixText}>{telemetryResult.suggestedFix}</Text>
            </View>
          )}
        </>
      ) : (
        <Text style={s.probeNoData}>Nessuna run disponibile — premi Riesegui</Text>
      )}
    </View>
  );
}

function HoleRow({ hole }: { hole: PipelineHole }) {
  return (
    <View style={s.holeRow}>
      <View style={s.holeLeft}>
        <Text style={s.holePipeline}>{hole.pipeline.replace(/_/g, " ")}</Text>
        <Text style={s.holeCheckpoint}>Checkpoint: {hole.lastCheckpoint}</Text>
        <Text style={s.holeAge}>TraceId: {hole.traceId.slice(0, 12)}…</Text>
      </View>
      <View style={s.holeRight}>
        <Text style={s.holeAgeLabel}>{ageLabel(hole.ageMs)}</Text>
        <Text style={s.holeAgeSub}>bloccato</Text>
      </View>
    </View>
  );
}

export function TabMonitor({ onActiveCount }: { onActiveCount: (n: number) => void }) {
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery<HolesResult>({
    queryKey: ["/api/admin/pipeline-check/holes"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/pipeline-check/holes");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    onActiveCount(data?.active.length ?? 0);
  }, [data?.active.length, onActiveCount]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const active = data?.active ?? [];
  const recent = (data?.recent ?? []).filter(h =>
    filterPipeline === "all" || h.pipeline === filterPipeline
  );
  const pipelineOptions = ["all", ...Array.from(new Set((data?.recent ?? []).map(h => h.pipeline)))];

  return (
    <ScrollView
      contentContainerStyle={s.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.accent} />}
    >
      <TelemetryProbeCard />

      <View style={s.sectionHeader}>
        <MaterialCommunityIcons name="alert-circle" size={16} color={active.length > 0 ? "#ef4444" : Colors.textSecondary} />
        <Text style={s.sectionTitle}>Buchi attivi ({active.length})</Text>
      </View>

      {active.length === 0 ? (
        <View style={s.noHoles}>
          <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
          <Text style={s.noHolesText}>Nessun buco attivo</Text>
        </View>
      ) : (
        active.map(h => <HoleRow key={h.id} hole={h} />)
      )}

      <View style={s.sectionHeader}>
        <MaterialCommunityIcons name="history" size={16} color={Colors.textSecondary} />
        <Text style={s.sectionTitle}>Buchi recenti 48h ({recent.length})</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scopeScroll}>
        {pipelineOptions.map(p => (
          <TouchableOpacity
            key={p}
            style={[s.scopeChip, filterPipeline === p && s.scopeChipActive]}
            onPress={() => setFilterPipeline(p)}
          >
            <Text style={[s.scopeChipText, filterPipeline === p && s.scopeChipTextActive]}>
              {p === "all" ? "Tutte" : p.replace(/_/g, " ")}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {recent.length === 0 ? (
        <View style={s.noHoles}>
          <Text style={s.noHolesText}>Nessun buco nelle ultime 48h</Text>
        </View>
      ) : (
        recent.map(h => <HoleRow key={h.id} hole={h} />)
      )}
    </ScrollView>
  );
}
