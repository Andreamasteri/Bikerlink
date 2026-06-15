import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, RefreshControl, Alert, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import s from "./diagnostica-styles";

// ─────────────────────────────────── types ────────────────────────────────────

type CheckStatus = "ok" | "warn" | "error";
type OverallStatus = "ok" | "degraded" | "broken";

interface PipelineStep {
  name: string;
  status: CheckStatus;
  durationMs: number;
  message?: string;
}

interface PipelineResult {
  pipeline: string;
  label: string;
  overall: OverallStatus;
  steps: PipelineStep[];
  suggestedFix: string | null;
  durationMs: number;
}

interface PipelineRunResult {
  runId: string;
  scope: string;
  overall: OverallStatus;
  pipelines: PipelineResult[];
  triggeredBy: string;
  generatedAt: string;
  durationMs: number;
}

interface PipelineHole {
  id: string;
  pipeline: string;
  traceId: string;
  lastCheckpoint: string;
  ageMs: number;
  detectedAt: string;
  resolved: boolean;
}

interface HolesResult {
  active: PipelineHole[];
  recent: PipelineHole[];
}

interface DiagnosticReport {
  id: string;
  userId?: string | null;
  appVersion?: string | null;
  platform?: string | null;
  runAt: string;
  summary?: { totalTests: number; passed: number; failed: number } | null;
}

// ─────────────────────────────────── helpers ──────────────────────────────────

async function adminFetch(path: string, opts?: RequestInit): Promise<Response> {
  const url = new URL(path, getApiUrl()).toString();
  const headers = { ...(await authFetchHeaders()), ...(opts?.headers ?? {}) };
  return fetch(url, { ...opts, headers, credentials: "include" });
}

function overallColor(s: OverallStatus | "unknown"): string {
  if (s === "ok") return "#22c55e";
  if (s === "degraded") return "#f59e0b";
  if (s === "broken") return "#ef4444";
  return Colors.textSecondary;
}

function statusColor(s: CheckStatus | "unknown"): string {
  if (s === "ok") return "#22c55e";
  if (s === "warn") return "#f59e0b";
  if (s === "error") return "#ef4444";
  return Colors.textSecondary;
}

function overallIcon(s: OverallStatus): React.ReactNode {
  if (s === "ok") return <Ionicons name="checkmark-circle" size={20} color="#22c55e" />;
  if (s === "degraded") return <Ionicons name="warning" size={20} color="#f59e0b" />;
  return <Ionicons name="close-circle" size={20} color="#ef4444" />;
}

function ageLabel(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}gg`;
}

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  return ageLabel(d);
}

// ─────────────────────────────────── Tab 1: Radiografia ──────────────────────

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

function TabRadiografia() {
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
      {/* Controls */}
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

      {/* Last run info */}
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

// ─────────────────────────────────── Tab 2: Monitor in corsa ─────────────────

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

function TabMonitor({ onActiveCount }: { onActiveCount: (n: number) => void }) {
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
      {/* Active holes */}
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

      {/* Filter */}
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

// ─────────────────────────────────── Export helper ───────────────────────────

async function downloadDiagnosticsExport(): Promise<void> {
  const url = new URL("/api/admin/diagnostics/export", getApiUrl()).toString();
  const headers = await authFetchHeaders();

  if (Platform.OS === "web") {
    const res = await fetch(url, { headers, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const isoDate = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const blob = new Blob([text], { type: "application/json" });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = `bikerlink-diagnostics-${isoDate}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objUrl); }, 1000);
  } else {
    const res = await fetch(url, { headers, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const isoDate = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const filePath = `${FileSystem.cacheDirectory}bikerlink-diagnostics-${isoDate}.json`;
    await FileSystem.writeAsStringAsync(filePath, text, { encoding: FileSystem.EncodingType.UTF8 });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) throw new Error("Condivisione non disponibile su questo dispositivo");
    await Sharing.shareAsync(filePath, { mimeType: "application/json", UTI: "public.json" });
  }
}

// ─────────────────────────────────── Tab 3: Device ───────────────────────────

function TabDevice() {
  const { data, isLoading, error } = useQuery<{ reports: DiagnosticReport[] }>({
    queryKey: ["/api/admin/diagnostic-reports"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/diagnostic-reports?limit=50");
      if (r.status === 404) return { reports: [] };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    retry: false,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadDiagnosticsExport();
    } catch (err) {
      Alert.alert("Errore export", (err as Error).message ?? "Impossibile scaricare il report");
    } finally {
      setExporting(false);
    }
  }, []);

  if (isLoading) return (
    <View style={s.centered}><ActivityIndicator color={Colors.accent} /></View>
  );

  if (error) return (
    <View style={[s.centered, { padding: 24 }]}>
      <Text style={s.emptyStateText}>In arrivo</Text>
      <Text style={s.emptyStateSub}>La diagnostica device sarà disponibile a breve</Text>
    </View>
  );

  const reports = data?.reports ?? [];

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      {/* Export button */}
      <View style={s.deviceTabHeader}>
        <Text style={s.deviceTabTitle}>Report device ({reports.length})</Text>
        <TouchableOpacity
          style={[s.exportButton, exporting && s.exportButtonDisabled]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.75}
        >
          {exporting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="download-outline" size={16} color="#fff" />}
          <Text style={s.exportButtonText}>
            {exporting ? "Esportando…" : "Scarica report JSON"}
          </Text>
        </TouchableOpacity>
      </View>

      {reports.length === 0 ? (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="devices" size={40} color={Colors.textSecondary} />
          <Text style={s.emptyStateText}>Nessun report</Text>
          <Text style={s.emptyStateSub}>I report device appariranno qui quando gli utenti eseguono la diagnostica</Text>
        </View>
      ) : (
        reports.map(report => (
          <TouchableOpacity
            key={report.id}
            style={s.deviceCard}
            onPress={() => setExpandedId(expandedId === report.id ? null : report.id)}
            activeOpacity={0.75}
          >
            <View style={s.deviceCardHeader}>
              <View>
                <Text style={s.deviceCardUser}>
                  {report.userId ? `Utente ${report.userId.slice(0, 8)}` : "Anonimo"}
                </Text>
                <Text style={s.deviceCardMeta}>
                  {report.platform} · {report.appVersion} · {timeAgo(report.runAt)} fa
                </Text>
              </View>
              {report.summary && (
                <View style={[s.failBadge, { backgroundColor: report.summary.failed > 0 ? "#ef4444" : "#22c55e" }]}>
                  <Text style={s.failBadgeText}>
                    {report.summary.failed > 0 ? `${report.summary.failed} FAIL` : "OK"}
                  </Text>
                </View>
              )}
            </View>
            {expandedId === report.id && report.summary && (
              <View style={s.deviceCardBody}>
                <Text style={s.deviceSummaryLine}>Pass: {report.summary.passed}</Text>
                <Text style={s.deviceSummaryLine}>Fail: {report.summary.failed}</Text>
                <Text style={s.deviceSummaryLine}>Totale: {report.summary.totalTests}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────── Root screen ─────────────────────────────

type Tab = "radiografia" | "monitor" | "device";

export default function DiagnosticaScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("radiografia");
  const [activeHoles, setActiveHoles] = useState(0);

  const tabBarTop = Platform.OS === "web" ? insets.top + 67 : insets.top;

  return (
    <View style={[s.root, { paddingTop: tabBarTop }]}>
      {/* Tab bar */}
      <View style={s.tabBar}>
        {(["radiografia", "monitor", "device"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabItem, activeTab === tab && s.tabItemActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.75}
          >
            <View>
              {tab === "radiografia" && (
                <MaterialCommunityIcons
                  name="stethoscope"
                  size={20}
                  color={activeTab === tab ? Colors.accent : Colors.textSecondary}
                />
              )}
              {tab === "monitor" && (
                <View>
                  <MaterialCommunityIcons
                    name="pulse"
                    size={20}
                    color={activeTab === tab ? Colors.accent : Colors.textSecondary}
                  />
                  {activeHoles > 0 && (
                    <View style={s.tabBadge}>
                      <Text style={s.tabBadgeText}>{activeHoles > 9 ? "9+" : activeHoles}</Text>
                    </View>
                  )}
                </View>
              )}
              {tab === "device" && (
                <MaterialCommunityIcons
                  name="devices"
                  size={20}
                  color={activeTab === tab ? Colors.accent : Colors.textSecondary}
                />
              )}
            </View>
            <Text style={[s.tabLabel, activeTab === tab && s.tabLabelActive]}>
              {tab === "radiografia" ? "Radiografia" : tab === "monitor" ? "Monitor" : "Device"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Live Dashboard link */}
      <TouchableOpacity
        style={s.liveDashboardBtn}
        onPress={() => {
          const url = new URL("/admin/diagnostics/live", getApiUrl()).toString();
          Linking.openURL(url);
        }}
        activeOpacity={0.75}
      >
        <Ionicons name="desktop-outline" size={13} color={Colors.accent} />
        <Text style={s.liveDashboardBtnText}>Live Dashboard (PC)</Text>
        <Ionicons name="open-outline" size={11} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Content */}
      <View style={[s.tabContent2, { paddingBottom: insets.bottom + 20 }]}>
        {activeTab === "radiografia" && <TabRadiografia />}
        {activeTab === "monitor" && <TabMonitor onActiveCount={setActiveHoles} />}
        {activeTab === "device" && <TabDevice />}
      </View>
    </View>
  );
}

