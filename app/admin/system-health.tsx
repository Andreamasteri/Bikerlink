// Task #2533 — Admin UI AI System Watchdog: stato, problemi, metriche,
// proposte AI da approvare, chat copilot, kill-switch.
import React, { useState } from "react";
import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, Switch, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest, getQueryFnWithTimeout, ServerBusyError } from "@/lib/query-client";
import { ErrorRetryCard } from "@/components/admin/shared/ErrorRetryCard";
import Colors from "@/constants/colors";
import { StatusBadge } from "@/components/admin/system-health/StatusBadge";
import { ProblemsList, type Problem } from "@/components/admin/system-health/ProblemsList";
import { MetricsGrid } from "@/components/admin/system-health/MetricsGrid";
import { ProposalsCard, type WatchdogLog } from "@/components/admin/system-health/ProposalsCard";
import { WatchdogChat } from "@/components/admin/system-health/WatchdogChat";
import { TrendsChart } from "@/components/admin/system-health/TrendsChart";
import { MapsHealthCard } from "@/components/admin/system-health/MapsHealthCard";
import { useAdminWatchdogAlerts } from "@/hooks/useAdminWatchdogAlerts";
import { WhisperWatchdogBadge, type WhisperHealthData } from "@/components/admin/WhisperWatchdogBadge";
import { EmbeddingUsageCard } from "@/components/admin/EmbeddingUsageCard";
import { AiTokenAuditCard } from "@/components/admin/AiTokenAuditCard";
import { CrashBreakdownCard } from "@/components/admin/system-health/CrashBreakdownCard";
import { SignalThresholdsCard } from "@/components/admin/system-health/SignalThresholdsCard";
import { AiHubHealthCard } from "@/components/admin/system-health/AiHubHealthCard";

interface DbCircuit {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  consecutiveFailures: number;
  openedAt: string | null;
}
interface HealthResp {
  status: string;
  initializing: boolean;
  dbCircuit: DbCircuit;
}
interface Snapshot {
  status: "green" | "yellow" | "orange" | "red";
  score: number;
  problems: Problem[];
  metrics: Record<string, number>;
  generatedAt: string;
}
interface SnapshotResp {
  enabled: boolean;
  snapshot: Snapshot | null;
  stats: {
    totalCycles: number; totalAutoFixesApplied: number;
    totalProposalsCreated: number; totalAlertsSent: number;
    lastError: { at: string; message: string } | null; running: boolean;
  };
  // Task #157 — ultimo heartbeat del loop scheduler matching (ISO), o null.
  schedulerLastHeartbeat?: string | null;
  // Task #567 — snooze attivo: ISO string di quando scade, o null.
  snoozedUntil?: string | null;
}

// Task #157 — età heartbeat in secondi; warning se supera 2 minuti.
const HEARTBEAT_WARN_SEC = 120;

function formatHeartbeatAge(sec: number): string {
  if (sec < 60) return `${sec} secondi fa`;
  return `${Math.floor(sec / 60)} min fa`;
}

export default function SystemHealthScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);

  const healthQ = useQuery<HealthResp>({
    queryKey: ["/api/health"],
    refetchInterval: 15_000,
    retry: false,
  });

  const snapQ = useQuery<SnapshotResp>({
    queryKey: ["/api/admin/watchdog/snapshot"],
    queryFn: getQueryFnWithTimeout<SnapshotResp>(10_000),
    refetchInterval: 15_000,
    retry: (count, err) => {
      if (err instanceof ServerBusyError) return count < 3;
      return false;
    },
    retryDelay: (index, err) => {
      if (err instanceof ServerBusyError) return Math.min(8_000, 2_000 * Math.pow(2, index));
      return 1_000;
    },
  });

  // Task #2555 — WS realtime: invalida lo snapshot non appena il watchdog
  // ne pubblica uno nuovo, eliminando la finestra fino a 15s del polling.
  useAdminWatchdogAlerts();

  const whisperHealthQ = useQuery<WhisperHealthData>({
    queryKey: ["/api/admin/whisper-health"],
    queryFn: getQueryFnWithTimeout<WhisperHealthData>(10_000),
    refetchInterval: 30_000,
  });

  const proposalsQ = useQuery<{ logs: WatchdogLog[] }>({
    queryKey: ["/api/admin/watchdog/logs?kind=proposal&limit=30"],
    queryFn: getQueryFnWithTimeout<{ logs: WatchdogLog[] }>(10_000),
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

  const pendingProposals = (proposalsQ.data?.logs ?? []).filter((p) => p.status === "pending");

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("POST", "/api/admin/watchdog/enabled", { enabled });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/snapshot"] }),
  });

  const runNow = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/watchdog/run-now")).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/snapshot"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/logs?kind=proposal&limit=30"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const proposeNow = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/watchdog/propose-now")).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/logs?kind=proposal&limit=30"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  // Task #154 — Svuota lista: azzera i contatori interni dei collector lato
  // backend e rigenera uno snapshot pulito, poi invalida snapshot e log.
  const resetState = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/watchdog/reset-state")).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/snapshot"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/logs?kind=proposal&limit=30"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  // Task #567 — Riattiva ora: cancella lo snooze manualmente prima dei 10 min.
  const cancelSnooze = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/watchdog/snooze/cancel")).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/snapshot"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const onAccept = async (id: string) => {
    setBusyProposalId(id);
    try {
      const resp = await apiRequest("POST", `/api/admin/watchdog/proposals/${id}/accept`);
      const data = await resp.json() as { dispatch?: { autoApplied?: boolean; summary?: string; message?: string } | null };
      await qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/logs?kind=proposal&limit=30"] });
      const dispatch = data?.dispatch;
      if (dispatch?.autoApplied) {
        Alert.alert("✅ Fix applicato automaticamente", dispatch.summary ?? dispatch.message ?? "Operazione completata con successo.");
      } else {
        Alert.alert("Proposta accettata", "Ricorda: l'azione resta MANUALE. Esegui tu il fix.");
      }
    } catch (err) {
      Alert.alert("Errore", (err as Error).message);
    } finally { setBusyProposalId(null); }
  };

  const onReject = async (id: string) => {
    setBusyProposalId(id);
    try {
      await apiRequest("POST", `/api/admin/watchdog/proposals/${id}/reject`, { reason: "rifiutata da admin" });
      await qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/logs?kind=proposal&limit=30"] });
    } catch (err) {
      Alert.alert("Errore", (err as Error).message);
    } finally { setBusyProposalId(null); }
  };

  const enabled = snapQ.data?.enabled ?? true;
  const snap = snapQ.data?.snapshot ?? null;
  const stats = snapQ.data?.stats;

  const circuit = healthQ.data?.dbCircuit;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl
        refreshing={snapQ.isFetching}
        onRefresh={() => { snapQ.refetch(); proposalsQ.refetch(); healthQ.refetch(); }}
        tintColor={Colors.accent}
      />}
    >
      {/* Task #567 — Snooze banner: visibile quando l'admin ha premuto "Svuota lista"
          e lo snooze è ancora attivo. Mostra l'ora di scadenza e un pulsante
          "Riattiva ora" per cancellare lo snooze manualmente. */}
      {snapQ.data?.snoozedUntil && new Date(snapQ.data.snoozedUntil) > new Date() && (
        <View style={styles.snoozeBanner}>
          <MaterialCommunityIcons name="bell-sleep-outline" size={20} color="#fff" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.snoozeBannerTitle}>
              Lista errori silenziata fino alle{" "}
              {new Date(snapQ.data.snoozedUntil).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text style={styles.snoozeBannerBody}>
              I problemi non critici non vengono mostrati. Gli allarmi CRITICAL tornano dopo 2 min.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => cancelSnooze.mutate()}
            disabled={cancelSnooze.isPending}
            style={styles.snoozeCancelBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.snoozeCancelText}>Riattiva ora</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Circuit breaker banner */}
      {circuit && circuit.state !== "CLOSED" && (
        <View style={[styles.circuitBanner, circuit.state === "OPEN" ? styles.circuitOpen : styles.circuitHalfOpen]}>
          <MaterialCommunityIcons
            name={circuit.state === "OPEN" ? "alert-octagon" : "alert"}
            size={20}
            color="#fff"
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.circuitBannerTitle}>
              Circuit Breaker DB: {circuit.state}
            </Text>
            <Text style={styles.circuitBannerBody}>
              {circuit.state === "OPEN"
                ? `${circuit.consecutiveFailures} fallimenti consecutivi — API restituiscono 503. Reset automatico tra 30s.`
                : "Verifica in corso — il circuito si sta riaprendo."}
              {circuit.openedAt ? `\nAperto: ${new Date(circuit.openedAt).toLocaleTimeString("it-IT")}` : ""}
            </Text>
          </View>
        </View>
      )}

      {/* Kill-switch */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>AI System Watchdog</Text>
          <Switch
            value={enabled}
            onValueChange={(v) => toggle.mutate(v)}
            disabled={toggle.isPending}
          />
        </View>
        <Text style={styles.muted}>
          {enabled
            ? "Attivo: aggregator ogni 60s, auto-fix sicuri, proposte AI per azioni rischiose."
            : "Disabilitato: nessuna raccolta signal né alert. Riabilita per riprendere."}
        </Text>
      </View>

      {/* Stato + score */}
      {snapQ.isLoading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
      ) : snapQ.isError ? (
        <ErrorRetryCard
          message={
            snapQ.error instanceof Error && snapQ.error.name === "AbortError"
              ? "Il backend sta rispondendo lentamente — riprova"
              : "Impossibile caricare lo snapshot — riprova"
          }
          onRetry={() => snapQ.refetch()}
        />
      ) : !snap ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Nessun snapshot ancora generato.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => runNow.mutate()} disabled={runNow.isPending}>
            <Text style={styles.btnText}>{runNow.isPending ? "..." : "Esegui ciclo ora"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <StatusBadge status={snap.status} score={snap.score} />
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => runNow.mutate()} disabled={runNow.isPending}>
                  <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
                  <Text style={styles.smallBtnText}>Aggiorna</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => resetState.mutate()} disabled={resetState.isPending}>
                  {resetState.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.smallBtnText}>{resetState.isPending ? "Svuoto…" : "Svuota lista"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => proposeNow.mutate()} disabled={proposeNow.isPending}>
                  <MaterialCommunityIcons name="lightbulb-on" size={16} color="#fff" />
                  <Text style={styles.smallBtnText}>Proponi</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.muted}>Aggiornato: {new Date(snap.generatedAt).toLocaleTimeString("it-IT")}</Text>
            {(() => {
              // Task #157 — liveness scheduler matching: heartbeat 60s dal backend.
              const hb = snapQ.data?.schedulerLastHeartbeat;
              if (!hb) return <Text style={styles.muted}>Scheduler matching — nessun heartbeat registrato</Text>;
              const ageSec = Math.max(0, Math.floor((Date.now() - new Date(hb).getTime()) / 1000));
              const stale = ageSec > HEARTBEAT_WARN_SEC;
              return (
                <Text style={[styles.muted, stale && styles.heartbeatWarn]}>
                  Scheduler matching — ultimo heartbeat: {formatHeartbeatAge(ageSec)}
                </Text>
              );
            })()}
            {stats ? (
              <View style={styles.statsRow}>
                <Stat label="Cicli" value={stats.totalCycles} />
                <Stat label="Auto-fix" value={stats.totalAutoFixesApplied} />
                <Stat label="Proposte" value={stats.totalProposalsCreated} />
                <Stat label="Alert" value={stats.totalAlertsSent} />
              </View>
            ) : null}
          </View>

          <SectionTitle icon="alert-circle-outline">Problemi rilevati</SectionTitle>
          <ProblemsList problems={snap.problems} />

          <SectionTitle icon="chart-box-outline">Metriche</SectionTitle>
          <MetricsGrid metrics={snap.metrics} />

          <SectionTitle icon="map-marker-radius">Maps Health</SectionTitle>
          <MapsHealthCard />

          <SectionTitle icon="microphone">Whisper Watchdog</SectionTitle>
          {whisperHealthQ.isLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginBottom: 12 }} />
          ) : whisperHealthQ.data ? (
            <WhisperWatchdogBadge
              health={whisperHealthQ.data}
              updatedAt={whisperHealthQ.dataUpdatedAt}
            />
          ) : (
            <View style={styles.card}>
              <Text style={styles.muted}>Dati watchdog Whisper non disponibili.</Text>
            </View>
          )}

          <SectionTitle icon="brain">TC AI Hub</SectionTitle>
          <AiHubHealthCard />

          <SectionTitle
            icon="robot-outline"
            suffix={`(${pendingProposals.length} pendenti)`}
            suffixWarn={pendingProposals.length > 3}
          >
            Proposte AI in attesa
          </SectionTitle>
          <ProposalsCard
            proposals={pendingProposals}
            busyId={busyProposalId}
            onAccept={onAccept}
            onReject={onReject}
          />

          <SectionTitle icon="chart-line">Trend score (ultime ore)</SectionTitle>
          <TrendsChart />

          <SectionTitle icon="chat-processing-outline">Chat con il Watchdog</SectionTitle>
          <WatchdogChat />

          <SectionTitle icon="vector-point">Embedding Usage</SectionTitle>
          <EmbeddingUsageCard />

          <SectionTitle icon="bug-outline">Crash Breakdown</SectionTitle>
          <CrashBreakdownCard />

          <SectionTitle icon="tune-variant">Soglie segnali diagnostici</SectionTitle>
          <SignalThresholdsCard />

          <SectionTitle icon="chart-bar">Consumo AI oggi</SectionTitle>
          <AiTokenAuditCard />
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Task #158 — suffix opzionale (es. "(N pendenti)") con colore warning se suffixWarn.
function SectionTitle({ icon, children, suffix, suffixWarn }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  children: React.ReactNode;
  suffix?: string;
  suffixWarn?: boolean;
}) {
  return (
    <View style={styles.sectionTitle}>
      <MaterialCommunityIcons name={icon} size={18} color={Colors.accent} />
      <Text style={styles.sectionText}>{children}</Text>
      {suffix ? (
        <Text style={[styles.sectionSuffix, suffixWarn && styles.sectionSuffixWarn]}>{suffix}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f1a" },
  card: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  title: { color: "#f3f4f6", fontSize: 18, fontWeight: "700" as const },
  muted: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
  heartbeatWarn: { color: "#f59e0b" },
  primaryBtn: { backgroundColor: "#3b82f6", padding: 12, borderRadius: 8, marginTop: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" as const },
  btnRow: { flexDirection: "row", gap: 6 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1f2937", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  smallBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" as const },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  stat: { flex: 1, backgroundColor: "#1f2937", borderRadius: 8, padding: 8, alignItems: "center" },
  statValue: { color: "#f3f4f6", fontSize: 18, fontWeight: "700" as const },
  statLabel: { color: "#9ca3af", fontSize: 11, marginTop: 2 },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 8 },
  sectionText: { color: "#f3f4f6", fontSize: 15, fontWeight: "600" as const },
  sectionSuffix: { color: "#9ca3af", fontSize: 13, fontWeight: "600" as const },
  sectionSuffixWarn: { color: "#f59e0b" },
  circuitBanner: { flexDirection: "row", alignItems: "flex-start", borderRadius: 10, padding: 12, marginBottom: 12 },
  circuitOpen: { backgroundColor: "#7f1d1d", borderWidth: 1, borderColor: "#ef4444" },
  circuitHalfOpen: { backgroundColor: "#78350f", borderWidth: 1, borderColor: "#f59e0b" },
  circuitBannerTitle: { color: "#fff", fontSize: 13, fontWeight: "700" as const },
  circuitBannerBody: { color: "#fca5a5", fontSize: 12, marginTop: 2, lineHeight: 18 },
  // Task #567 — snooze banner styles
  snoozeBanner: {
    flexDirection: "row" as const, alignItems: "flex-start",
    backgroundColor: "#1e3a5f", borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#3b82f6",
  },
  snoozeBannerTitle: { color: "#93c5fd", fontSize: 13, fontWeight: "700" as const },
  snoozeBannerBody: { color: "#bfdbfe", fontSize: 12, marginTop: 2, lineHeight: 18 },
  snoozeCancelBtn: {
    marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: "#3b82f6", borderRadius: 6, alignSelf: "center" as const,
  },
  snoozeCancelText: { color: "#fff", fontSize: 12, fontWeight: "700" as const },
});
