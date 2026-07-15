// Task #3098 — AI Stats card: calls, cost, error rate per provider + range filter.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

type Range = "24h" | "7d" | "30d";

interface ProviderData {
  provider: string;
  calls: number;
  costUsd: number;
  errorRate: number;
  degradedCount: number;
}

interface Summary {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  degradedRate: number;
  errorRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
}

interface RecentIssue {
  id: string;
  provider: string;
  modelId: string;
  error: string | null;
  degraded: boolean;
  createdAt: string;
}

// Task #41 — Contatore timeout/troncamenti per tool AI (guardTool).
interface ToolEvent {
  toolName: string;
  roster: string;
  eventType: "timeout" | "truncated";
  occurrences: number;
  lastMessage: string | null;
  lastOccurredAt: string;
}

// Task #51 — Ripartizione chiamate per superficie (chat diretta vs gruppo).
interface SurfaceData {
  surface: string;
  calls: number;
  costUsd: number;
}

interface MetricsResponse {
  range: string;
  summary: Summary;
  perProvider: ProviderData[];
  recentIssues: RecentIssue[];
  bySurface: SurfaceData[];
  toolEvents: ToolEvent[];
}

function useAiMetrics(range: Range) {
  return useQuery<MetricsResponse>({
    queryKey: ["/api/admin/ai/metrics", range],
    queryFn: async () => {
      const url = new URL(`/api/admin/ai/metrics?range=${range}`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("metrics fetch failed");
      return res.json() as Promise<MetricsResponse>;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

const RANGES: { label: string; value: Range }[] = [
  { label: "24h", value: "24h" },
  { label: "7d",  value: "7d" },
  { label: "30d", value: "30d" },
];

const PROVIDER_COLORS: Record<string, string> = {
  groq: "#f55036",
  google: "#4285f4",
  openai: "#10a37f",
  ollama: "#8b5cf6",
};

export default function AiMetricsCard() {
  const colors = useColors();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading, isError } = useAiMetrics(range);

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>AI Stats</Text>
        <View style={styles.rangePicker}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r.value}
              onPress={() => setRange(r.value)}
              style={[
                styles.rangeBtn,
                { borderColor: colors.border },
                range === r.value && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
            >
              <Text style={[
                styles.rangeTxt,
                { color: range === r.value ? "#fff" : colors.textSecondary },
              ]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}

      {isError && (
        <Text style={[styles.err, { color: colors.error }]}>Errore caricamento metriche</Text>
      )}

      {data && (
        <>
          {/* Summary grid */}
          <View style={styles.grid}>
            <StatCell label="Chiamate" value={String(data.summary.calls)} colors={colors} />
            <StatCell label="Costo" value={`$${data.summary.costUsd.toFixed(4)}`} colors={colors} />
            <StatCell
              label="Err%"
              value={`${data.summary.errorRate}%`}
              colors={colors}
              accent={data.summary.errorRate > 5 ? colors.error : undefined}
            />
            <StatCell
              label="Degraded%"
              value={`${data.summary.degradedRate}%`}
              colors={colors}
              accent={data.summary.degradedRate > 10 ? colors.warning : undefined}
            />
            <StatCell label="P50" value={`${data.summary.latencyP50Ms}ms`} colors={colors} />
            <StatCell label="P95" value={`${data.summary.latencyP95Ms}ms`} colors={colors} />
          </View>

          {/* Per-provider rows */}
          {data.perProvider.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Per provider</Text>
              {data.perProvider.map((p) => (
                <ProviderRow key={p.provider} row={p} colors={colors} />
              ))}
            </>
          )}

          {/* Task #51 — Per superficie (chat diretta 1:1 vs conversazione di gruppo) */}
          {data.bySurface.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Per superficie</Text>
              {data.bySurface.map((s) => (
                <View key={s.surface} style={styles.provRow}>
                  <Text style={[styles.provName, { color: colors.text }]}>
                    {s.surface === "group" ? "Gruppo (tavola rotonda)" : "Chat diretta"}
                  </Text>
                  <Text style={[styles.provStat, { color: colors.textSecondary }]}>{s.calls} calls</Text>
                  <Text style={[styles.provStat, { color: colors.textSecondary }]}>${s.costUsd.toFixed(4)}</Text>
                </View>
              ))}
            </>
          )}

          {/* Recent errors */}
          {data.recentIssues.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Ultimi errori</Text>
              {data.recentIssues.slice(0, 5).map((issue) => (
                <IssueRow key={issue.id} issue={issue} colors={colors} />
              ))}
            </>
          )}

          {/* Task #41 — Tool AI: timeout/troncamenti (storico completo, non filtrato per range) */}
          {data.toolEvents.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tool timeout/troncati</Text>
              {data.toolEvents.map((ev) => (
                <ToolEventRow key={`${ev.toolName}:${ev.roster}:${ev.eventType}`} ev={ev} colors={colors} />
              ))}
            </>
          )}

          {data.perProvider.length === 0 && data.recentIssues.length === 0 && data.toolEvents.length === 0 && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun dato nel periodo selezionato</Text>
          )}
        </>
      )}
    </View>
  );
}

function StatCell({
  label, value, colors, accent,
}: {
  label: string; value: string;
  colors: ReturnType<typeof useColors>;
  accent?: string;
}) {
  return (
    <View style={[styles.cell, { backgroundColor: colors.surfaceLight }]}>
      <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.cellValue, { color: accent ?? colors.text }]}>{value}</Text>
    </View>
  );
}

function ProviderRow({
  row, colors,
}: {
  row: ProviderData;
  colors: ReturnType<typeof useColors>;
}) {
  const dot = PROVIDER_COLORS[row.provider.toLowerCase()] ?? colors.accent;
  return (
    <View style={styles.provRow}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.provName, { color: colors.text }]}>{row.provider}</Text>
      <Text style={[styles.provStat, { color: colors.textSecondary }]}>{row.calls} calls</Text>
      <Text style={[styles.provStat, { color: colors.textSecondary }]}>${row.costUsd.toFixed(4)}</Text>
      <Text style={[
        styles.provStat,
        { color: row.errorRate > 5 ? colors.error : colors.textSecondary },
      ]}>
        {row.errorRate}% err
      </Text>
    </View>
  );
}

function IssueRow({
  issue, colors,
}: {
  issue: RecentIssue;
  colors: ReturnType<typeof useColors>;
}) {
  const ts = issue.createdAt ? new Date(issue.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
  const tag = issue.degraded ? "degraded" : "error";
  const tagColor = issue.degraded ? colors.warning : colors.error;
  return (
    <View style={styles.issueRow}>
      <View style={[styles.tag, { backgroundColor: tagColor + "22", borderColor: tagColor }]}>
        <Text style={[styles.tagTxt, { color: tagColor }]}>{tag}</Text>
      </View>
      <Text style={[styles.issueProvider, { color: colors.text }]}>{issue.provider}</Text>
      <Text style={[styles.issueErr, { color: colors.textSecondary }]} numberOfLines={1}>
        {issue.error ?? "—"}
      </Text>
      <Text style={[styles.issueTs, { color: colors.textSecondary }]}>{ts}</Text>
    </View>
  );
}

function ToolEventRow({
  ev, colors,
}: {
  ev: ToolEvent;
  colors: ReturnType<typeof useColors>;
}) {
  const ts = ev.lastOccurredAt
    ? new Date(ev.lastOccurredAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  const tagColor = ev.eventType === "timeout" ? colors.error : colors.warning;
  return (
    <View style={styles.issueRow}>
      <View style={[styles.tag, { backgroundColor: tagColor + "22", borderColor: tagColor }]}>
        <Text style={[styles.tagTxt, { color: tagColor }]}>{ev.eventType}</Text>
      </View>
      <Text style={[styles.issueProvider, { color: colors.text }]} numberOfLines={1}>
        {ev.toolName} ({ev.roster})
      </Text>
      <Text style={[styles.issueErr, { color: colors.textSecondary }]} numberOfLines={1}>
        ×{ev.occurrences} — {ev.lastMessage ?? "—"}
      </Text>
      <Text style={[styles.issueTs, { color: colors.textSecondary }]}>{ts}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: "Inter_700Bold", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  rangePicker: { flexDirection: "row", gap: 4 },
  rangeBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  rangeTxt: { fontFamily: "Inter_500Medium", fontSize: 10 },
  center: { alignItems: "center", paddingVertical: 12 },
  err: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", paddingVertical: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cell: { flex: 1, minWidth: 70, borderRadius: 6, padding: 7, alignItems: "center" },
  cellLabel: { fontFamily: "Inter_500Medium", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 },
  cellValue: { fontFamily: "Inter_700Bold", fontSize: 12 },
  divider: { height: 1 },
  sectionLabel: { fontFamily: "Inter_500Medium", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 },
  provRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  provName: { fontFamily: "Inter_600SemiBold", fontSize: 11, flex: 1 },
  provStat: { fontFamily: "Inter_400Regular", fontSize: 10, minWidth: 52, textAlign: "right" },
  empty: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", paddingVertical: 8, fontStyle: "italic" },
  issueRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tag: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 1 },
  tagTxt: { fontFamily: "Inter_600SemiBold", fontSize: 8, textTransform: "uppercase" },
  issueProvider: { fontFamily: "Inter_600SemiBold", fontSize: 10, width: 48 },
  issueErr: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 10 },
  issueTs: { fontFamily: "Inter_400Regular", fontSize: 9 },
});
