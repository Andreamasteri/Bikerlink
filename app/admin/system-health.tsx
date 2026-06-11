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
}

export default function SystemHealthScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);

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

  const onAccept = async (id: string) => {
    setBusyProposalId(id);
    try {
      await apiRequest("POST", `/api/admin/watchdog/proposals/${id}/accept`);
      await qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/logs?kind=proposal&limit=30"] });
      Alert.alert("Proposta accettata", "Ricorda: l'azione resta MANUALE. Esegui tu il fix.");
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl
        refreshing={snapQ.isFetching}
        onRefresh={() => { snapQ.refetch(); proposalsQ.refetch(); }}
        tintColor={Colors.accent}
      />}
    >
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
                <TouchableOpacity style={styles.smallBtn} onPress={() => proposeNow.mutate()} disabled={proposeNow.isPending}>
                  <MaterialCommunityIcons name="lightbulb-on" size={16} color="#fff" />
                  <Text style={styles.smallBtnText}>Proponi</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.muted}>Aggiornato: {new Date(snap.generatedAt).toLocaleTimeString("it-IT")}</Text>
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

          <SectionTitle icon="robot-outline">Proposte AI in attesa</SectionTitle>
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

function SectionTitle({ icon, children }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; children: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <MaterialCommunityIcons name={icon} size={18} color={Colors.accent} />
      <Text style={styles.sectionText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f1a" },
  card: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  title: { color: "#f3f4f6", fontSize: 18, fontWeight: "700" as const },
  muted: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
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
});
