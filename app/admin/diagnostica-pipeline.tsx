import React, { useCallback, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import s from "./diagnostica-styles";
import {
  PipelineStep, PipelineResult, PipelineRunResult,
  adminFetch, overallColor, statusColor, overallIcon, timeAgo,
} from "./diagnostica-types";
import { TelemetryProbeCard } from "./diagnostica-monitor";

function StepRow({ step }: { step: PipelineStep }) {
  return (
    <View style={s.stepRow}>
      <View style={[s.stepDot, { backgroundColor: statusColor(step.status) }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.stepName}>{step.name}</Text>
        {step.message ? <Text style={s.stepMsg}>{step.message}</Text> : null}
      </View>
      <Text style={[s.stepDur, { color: statusColor(step.status) }]}>{step.durationMs}ms</Text>
    </View>
  );
}

function PipelineCard({ result }: { result: PipelineResult }) {
  const [expanded, setExpanded] = useState(result.overall !== "ok");
  return (
    <View style={[s.pipelineCard, { borderLeftColor: overallColor(result.overall) }]}>
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.75} style={s.pipelineHeader}>
        <View style={s.pipelineHeaderLeft}>
          {overallIcon(result.overall)}
          <Text style={s.pipelineLabel}>{result.label}</Text>
        </View>
        <View style={s.pipelineHeaderRight}>
          <Text style={s.pipelineDur}>{result.durationMs}ms</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={s.pipelineBody}>
          {result.steps.map((step, i) => <StepRow key={i} step={step} />)}
          {result.suggestedFix && (
            <View style={s.suggestedFix}>
              <Ionicons name="bulb-outline" size={14} color="#f59e0b" />
              <Text style={s.suggestedFixText}>{result.suggestedFix}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function TabRadiografia() {
  const qc = useQueryClient();
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scope, setScope] = useState<string>("all");

  const { data: lastData, isLoading } = useQuery<{ result: PipelineRunResult | null; inProgress: boolean }>({
    queryKey: ["/api/admin/pipeline-check/last"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/pipeline-check/last");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: polling ? 3_000 : 30_000,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const r = await adminFetch("/api/admin/pipeline-check/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<PipelineRunResult>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pipeline-check/last"] });
      setPolling(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    },
    onError: () => {
      setPolling(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    },
  });

  const handleRun = useCallback(() => {
    setPolling(true);
    runMutation.mutate();
  }, [runMutation]);

  const result = lastData?.result;
  const inProgress = lastData?.inProgress || runMutation.isPending;

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <TelemetryProbeCard />

      <View style={s.controlRow}>
        <TouchableOpacity
          style={[s.runButton, inProgress && s.runButtonDisabled]}
          onPress={handleRun}
          disabled={inProgress}
          activeOpacity={0.75}
        >
          {inProgress
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="play" size={16} color="#fff" />}
          <Text style={s.runButtonText}>{inProgress ? "In corso…" : "Esegui ora"}</Text>
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scopeScroll}>
          {["all", "telemetry_ride", "matching", "campaigns", "ota", "gps", "chat"].map(sc => (
            <TouchableOpacity
              key={sc}
              style={[s.scopeChip, scope === sc && s.scopeChipActive]}
              onPress={() => setScope(sc)}
            >
              <Text style={[s.scopeChipText, scope === sc && s.scopeChipTextActive]}>
                {sc === "all" ? "Tutto" : sc.replace(/_/g, " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {result && (
        <View style={s.runMeta}>
          <View style={[s.overallBadge, { backgroundColor: overallColor(result.overall) + "22", borderColor: overallColor(result.overall) }]}>
            <Text style={[s.overallBadgeText, { color: overallColor(result.overall) }]}>
              {result.overall.toUpperCase()}
            </Text>
          </View>
          <Text style={s.runMetaText}>
            {timeAgo(result.generatedAt)} fa · {result.pipelines.length} pipeline · {result.durationMs}ms
          </Text>
        </View>
      )}

      {isLoading && !result && (
        <View style={s.centered}><ActivityIndicator color={Colors.accent} /></View>
      )}

      {result?.pipelines.map((p) => (
        <PipelineCard key={p.pipeline} result={p} />
      ))}

      {!result && !isLoading && (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="stethoscope" size={40} color={Colors.textSecondary} />
          <Text style={s.emptyStateText}>Nessun run eseguito</Text>
          <Text style={s.emptyStateSub}>Premi "Esegui ora" per avviare la diagnostica</Text>
        </View>
      )}
    </ScrollView>
  );
}
