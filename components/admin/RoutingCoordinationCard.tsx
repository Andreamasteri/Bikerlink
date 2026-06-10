import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { DotStatus } from "./SystemHealthContainer";

type PipelineOutcome = "ok" | "fallback" | "error";

interface PipelineEvent {
  ts: number;
  areaCode: string | null;
  engineSelected: string;
  engineUsed: string;
  fallbackReason: string | null;
  latencyMs: number;
  geocodingOk: boolean;
  outcome: PipelineOutcome;
  error: string | null;
}

interface PipelineSummary {
  windowMs: number;
  total: number;
  ok: number;
  fallback: number;
  error: number;
  fallbackRate: number;
  byEngineUsed: Record<string, { ok: number; fallback: number; error: number }>;
}

interface PipelineLogResponse {
  events: PipelineEvent[];
  summary: PipelineSummary;
  volatile: boolean;
}

interface RoutingStatusResponse {
  activeEngine: string;
  metrics: {
    windowMs: number;
    successes: number;
    fallbacks: number;
    failures: number;
    byEngine: Record<string, { success: number; fallback: number; failure: number }>;
  };
}

interface AiDecision {
  ts: number;
  mode: string;
  chosenEngine: string;
  confidence: number | null;
  reason: string;
  provider: string | null;
}

interface CoherenceLeg {
  ok: boolean;
  distanceKm: number | null;
  durationMinutes: number | null;
  latencyMs: number;
  error: string | null;
}

interface CoherenceResponse {
  ok: boolean;
  area: string;
  from: string;
  to: string;
  graphhopper: CoherenceLeg;
  valhalla: CoherenceLeg;
  comparison: {
    coherent: boolean | null;
    distanceDiffPct: number | null;
    durationDiffPct: number | null;
    thresholdPct: number;
  };
}

async function authGet<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, getApiUrl()).toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color={Colors.textSecondary} />
  );
}

const OUTCOME_COLOR: Record<PipelineOutcome, string> = {
  ok: "#22c55e",
  fallback: "#f59e0b",
  error: "#ef4444",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function overallColor(summary: PipelineSummary | undefined): string {
  if (!summary || summary.total === 0) return "#6b7280";
  if (summary.error > 0) return "#ef4444";
  if (summary.fallback > 0) return "#f59e0b";
  return "#22c55e";
}

function metricsToStatus(metrics: RoutingStatusResponse["metrics"] | undefined): DotStatus {
  if (!metrics) return "unknown";
  const total = metrics.successes + metrics.fallbacks + metrics.failures;
  if (total === 0) return "unknown";
  if (metrics.failures > 0) return "offline";
  if (metrics.fallbacks > 0) return "degraded";
  return "ok";
}

export function RoutingCoordinationCard({
  onStatus,
  onCollapsedChange,
}: {
  onStatus?: (s: DotStatus) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [openFlow, setOpenFlow] = useState(true);
  const [openLog, setOpenLog] = useState(true);
  const [openAi, setOpenAi] = useState(false);

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  const { data: status } = useQuery<RoutingStatusResponse>({
    queryKey: ["/api/admin/routing/status"],
    queryFn: () => authGet<RoutingStatusResponse>("/api/admin/routing/status"),
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const aiMode = status?.activeEngine === "ai";

  const { data: pipeline, isLoading: pipeLoading } = useQuery<PipelineLogResponse>({
    queryKey: ["/api/admin/routing/pipeline-log"],
    queryFn: () => authGet<PipelineLogResponse>("/api/admin/routing/pipeline-log"),
    refetchInterval: 15_000,
    staleTime: 10_000,
    refetchOnMount: "always",
    enabled: !collapsed,
  });

  const { data: aiData } = useQuery<{ decisions: AiDecision[] }>({
    queryKey: ["/api/admin/maps/ai-decisions", 10],
    queryFn: () => authGet<{ decisions: AiDecision[] }>("/api/admin/maps/ai-decisions?limit=10"),
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchOnMount: "always",
    enabled: !collapsed && !!aiMode,
  });

  const coherence = useMutation<CoherenceResponse, Error>({
    mutationFn: async () => {
      const res = await fetch(new URL("/api/admin/routing/coherence-test", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
        credentials: "include",
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      return json as CoherenceResponse;
    },
  });

  useEffect(() => {
    if (!onStatus) return;
    onStatus(metricsToStatus(status?.metrics));
  }, [status?.metrics, onStatus]);

  const headerColor = overallColor(pipeline?.summary);
  const summary = pipeline?.summary;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="routing-coordination-header"
      >
        <MaterialCommunityIcons name="sitemap-outline" size={18} color={headerColor} />
        <Text style={styles.cardTitle}>Routing Engine System</Text>
        <View style={styles.headerRight}>
          {summary && summary.total > 0 && (
            <Text style={styles.headerCount}>
              {summary.ok}/{summary.total}
            </Text>
          )}
          <View style={[styles.healthDot, { backgroundColor: headerColor }]} />
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.body}>
          <TouchableOpacity
            style={[styles.coherenceBtn, coherence.isPending && styles.coherenceBtnBusy]}
            onPress={() => { if (!coherence.isPending) coherence.mutate(); }}
            activeOpacity={coherence.isPending ? 1 : 0.7}
            disabled={coherence.isPending}
            testID="routing-coherence-btn"
          >
            {coherence.isPending ? (
              <ActivityIndicator size={13} color="#60a5fa" />
            ) : (
              <MaterialCommunityIcons name="scale-balance" size={15} color="#60a5fa" />
            )}
            <Text style={styles.coherenceBtnText}>
              {coherence.isPending ? "Confronto in corso…" : "Test coerenza GH ↔ Valhalla"}
            </Text>
          </TouchableOpacity>

          {coherence.isError && (
            <Text style={styles.errorText}>{coherence.error.message}</Text>
          )}
          {coherence.data && <CoherenceResult data={coherence.data} />}

          {/* Sezione: Stato flusso */}
          <Section title="Stato flusso" icon="sine-wave" open={openFlow} onToggle={() => setOpenFlow((v) => !v)}>
            <View style={styles.flowRow}>
              <Text style={styles.flowLabel}>Engine attivo</Text>
              <Text style={styles.flowValue}>{status?.activeEngine ?? "—"}</Text>
            </View>
            <View style={styles.flowRow}>
              <Text style={styles.flowLabel}>Modalità AI</Text>
              <Text style={[styles.flowValue, { color: aiMode ? "#22c55e" : Colors.textSecondary }]}>
                {aiMode ? "ON" : "OFF"}
              </Text>
            </View>
            <View style={styles.flowRow}>
              <Text style={styles.flowLabel}>Esiti (5 min)</Text>
              <Text style={styles.flowValue}>
                {summary ? `${summary.ok} ok · ${summary.fallback} fallback · ${summary.error} errore` : "—"}
              </Text>
            </View>
            <View style={styles.flowRow}>
              <Text style={styles.flowLabel}>Tasso fallback</Text>
              <Text style={styles.flowValue}>
                {summary ? `${Math.round(summary.fallbackRate * 100)}%` : "—"}
              </Text>
            </View>
            {status?.metrics && (
              <Text style={styles.metricsLine}>
                Metriche engine (5 min):{" "}
                {Object.keys(status.metrics.byEngine).length === 0
                  ? "nessun campione"
                  : Object.entries(status.metrics.byEngine)
                      .map(([e, c]) => `${e} ${c.success}/${c.fallback}/${c.failure}`)
                      .join("  ·  ")}
              </Text>
            )}
          </Section>

          {/* Sezione: Log eventi pipeline */}
          <Section title="Log eventi pipeline" icon="format-list-bulleted" open={openLog} onToggle={() => setOpenLog((v) => !v)}>
            {pipeLoading && <ActivityIndicator size="small" color={Colors.textSecondary} />}
            {!pipeLoading && (!pipeline || pipeline.events.length === 0) && (
              <Text style={styles.emptyText}>Nessun evento di routing registrato.</Text>
            )}
            {pipeline?.events.map((ev, i) => (
              <View
                key={`${ev.ts}-${i}`}
                style={[
                  styles.eventRow,
                  (ev.outcome === "error" || ev.outcome === "fallback") && {
                    backgroundColor: ev.outcome === "error" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                  },
                ]}
              >
                <View style={[styles.eventDot, { backgroundColor: OUTCOME_COLOR[ev.outcome] }]} />
                <View style={styles.eventBody}>
                  <Text style={styles.eventLine}>
                    <Text style={styles.eventTime}>{formatTime(ev.ts)}</Text>
                    {"  "}
                    {ev.areaCode ?? "fuori-area"} · {ev.engineSelected}
                    {ev.engineUsed !== ev.engineSelected ? ` → ${ev.engineUsed}` : ""}
                    {" · "}
                    {ev.latencyMs} ms
                  </Text>
                  {ev.fallbackReason && (
                    <Text style={[styles.eventSub, { color: "#f59e0b" }]}>{ev.fallbackReason}</Text>
                  )}
                  {ev.error && (
                    <Text style={[styles.eventSub, { color: "#ef4444" }]} numberOfLines={2}>
                      {ev.error}
                    </Text>
                  )}
                </View>
              </View>
            ))}
            {pipeline?.volatile && (
              <Text style={styles.volatileNote}>
                ⚠︎ Log volatile in memoria: si azzera al riavvio del server.
              </Text>
            )}
          </Section>

          {/* Sezione: AI Decisioni (solo se AI attiva) */}
          {aiMode && (
            <Section title="AI Decisioni" icon="robot-outline" open={openAi} onToggle={() => setOpenAi((v) => !v)}>
              {(!aiData || aiData.decisions.length === 0) && (
                <Text style={styles.emptyText}>Nessuna decisione AI registrata.</Text>
              )}
              {aiData?.decisions.slice(0, 10).map((d, i) => (
                <View key={`${d.ts}-${i}`} style={styles.aiRow}>
                  <Text style={styles.aiLine}>
                    <Text style={styles.eventTime}>{formatTime(d.ts)}</Text>
                    {"  "}
                    {d.chosenEngine} · conf {d.confidence != null ? `${Math.round(d.confidence * 100)}%` : "—"}
                    {d.provider ? ` · ${d.provider}` : ""}
                  </Text>
                  <Text style={styles.aiReason} numberOfLines={2}>{d.mode} — {d.reason}</Text>
                </View>
              ))}
            </Section>
          )}
        </View>
      )}
    </View>
  );
}

function Section({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
        <MaterialCommunityIcons name={icon} size={15} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionChevron}>
          <CollapseChevron collapsed={!open} />
        </View>
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function CoherenceResult({ data }: { data: CoherenceResponse }) {
  const { comparison: c, graphhopper: gh, valhalla: val } = data;
  const color = c.coherent === true ? "#22c55e" : c.coherent === false ? "#ef4444" : "#f59e0b";
  const label = c.coherent === true ? "Coerenti" : c.coherent === false ? "Divergenti" : "Confronto incompleto";
  return (
    <View style={[styles.coherenceResult, { borderColor: color }]}>
      <View style={styles.coherenceHeader}>
        <View style={[styles.healthDot, { backgroundColor: color }]} />
        <Text style={[styles.coherenceLabel, { color }]}>{label}</Text>
        <Text style={styles.coherenceRoute}>
          {data.from} → {data.to} ({data.area})
        </Text>
      </View>
      <View style={styles.coherenceLegs}>
        <CoherenceLegView name="GraphHopper" leg={gh} />
        <CoherenceLegView name="Valhalla" leg={val} />
      </View>
      {c.coherent != null && (
        <Text style={styles.coherenceDiff}>
          Δ distanza {c.distanceDiffPct ?? "—"}% · Δ durata {c.durationDiffPct ?? "—"}% (soglia ±{c.thresholdPct}%)
        </Text>
      )}
    </View>
  );
}

function CoherenceLegView({ name, leg }: { name: string; leg: CoherenceLeg }) {
  return (
    <View style={styles.legBox}>
      <Text style={styles.legName}>{name}</Text>
      {leg.ok ? (
        <Text style={styles.legValue}>
          {leg.distanceKm} km · {leg.durationMinutes} min · {leg.latencyMs} ms
        </Text>
      ) : (
        <Text style={[styles.legValue, { color: "#ef4444" }]} numberOfLines={2}>
          {leg.error ?? "errore"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  headerRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  headerCount: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
  body: { marginTop: 14, gap: 12 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#ef4444" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },

  coherenceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.25)",
  },
  coherenceBtnBusy: { opacity: 0.6 },
  coherenceBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#60a5fa" },

  coherenceResult: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
    backgroundColor: Colors.background,
  },
  coherenceHeader: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  coherenceLabel: { fontFamily: "Inter_700Bold", fontSize: 13 },
  coherenceRoute: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginLeft: "auto" },
  coherenceLegs: { flexDirection: "row", gap: 8 },
  legBox: { flex: 1, gap: 2 },
  legName: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.text },
  legValue: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  coherenceDiff: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },

  section: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  sectionChevron: { marginLeft: "auto" },
  sectionBody: { marginTop: 8, gap: 6 },

  flowRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flowLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  flowValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  metricsLine: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2 },

  eventRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 6, padding: 4 },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  eventBody: { flex: 1 },
  eventLine: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text },
  eventTime: { fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  eventSub: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 1 },
  volatileNote: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 4 },

  aiRow: { gap: 1 },
  aiLine: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text },
  aiReason: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
});
