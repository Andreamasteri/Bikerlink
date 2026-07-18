/**
 * Admin: registry dei job del coordinator Horus (ex Quebracho — Task #591).
 *
 * Vista in lettura dello stato dei job (job-registry.ts/job-gate.ts, Task
 * #5/#9) + kill-switch globale + direttive manuali (pause/resume/force/
 * throttle) per singolo job. Nessuna nuova infrastruttura di gate: questa
 * pagina è solo la finestra admin sopra API già pronte.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

type JobState = "idle" | "running" | "paused" | "throttled" | "disabled";

interface JobDirective {
  kind: "pause" | "throttle";
  reason: string;
  issuedBy: "admin_manual" | "horus";
  issuedAt: string;
  throttleMs?: number;
}

const ISSUER_LABEL: Record<JobDirective["issuedBy"], string> = {
  admin_manual: "Admin",
  horus: "Horus (autonomo)",
};

const ISSUER_COLOR: Record<JobDirective["issuedBy"], string> = {
  admin_manual: "#F59E0B",
  horus: "#8B5CF6",
};

interface JobEntry {
  name: string;
  state: JobState;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  nextRunAt: number | null;
  pauseSource: string | null;
  pauseReason: string | null;
  runCount: number;
  successCount: number;
  failureCount: number;
  directive: JobDirective | null;
}

interface JobsResponse {
  killSwitch: boolean;
  horusReachable: boolean;
  jobs: JobEntry[];
}

const STATE_COLOR: Record<JobState, string> = {
  idle: Colors.textSecondary,
  running: "#22C55E",
  paused: "#F59E0B",
  throttled: "#0EA5E9",
  disabled: Colors.error,
};

function fmt(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CoordinatorJobsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [busyJob, setBusyJob] = useState<string | null>(null);

  const jobsQuery = useQuery<JobsResponse>({
    queryKey: ["/api/admin/coordinator/jobs"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/coordinator/jobs")).json(),
    refetchInterval: 15_000,
  });

  const killSwitchMutation = useMutation({
    mutationFn: async (active: boolean) => (await apiRequest("POST", "/api/admin/coordinator/kill-switch", { active })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/coordinator/jobs"] }),
  });

  const directiveMutation = useMutation({
    mutationFn: async (params: { name: string; kind: "pause" | "resume" | "force" | "throttle" }) =>
      (await apiRequest("POST", `/api/admin/coordinator/jobs/${encodeURIComponent(params.name)}/directive`, { kind: params.kind })).json(),
    onSettled: () => {
      setBusyJob(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/coordinator/jobs"] });
    },
  });

  const applyDirective = (name: string, kind: "pause" | "resume" | "force" | "throttle") => {
    setBusyJob(name);
    directiveMutation.mutate({ name, kind });
  };

  const data = jobsQuery.data;
  const jobs = data?.jobs ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
      <View style={[styles.statusBanner, { borderColor: data?.horusReachable ? "#22C55E" : Colors.error }]} testID="coordinator-horus-status-banner">
        <MaterialCommunityIcons
          name={data?.horusReachable ? "check-circle-outline" : "alert-circle-outline"}
          size={20}
          color={data?.horusReachable ? "#22C55E" : Colors.error}
        />
        <Text style={styles.statusText}>
          Horus {data?.horusReachable ? "raggiungibile" : "non raggiungibile — pause automatiche ignorate (fallback)"}
        </Text>
      </View>

      <View style={styles.killSwitchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.killSwitchLabel}>Kill-switch globale</Text>
          <Text style={styles.killSwitchSubtitle}>Ferma TUTTI i job del coordinatore Horus.</Text>
        </View>
        <TouchableOpacity
          style={[styles.killSwitchToggle, { backgroundColor: data?.killSwitch ? Colors.error : Colors.border }]}
          onPress={() =>
            Alert.alert(
              data?.killSwitch ? "Riattivare i job?" : "Fermare tutti i job?",
              data?.killSwitch
                ? "I job del coordinatore riprenderanno a girare normalmente."
                : "Nessun job del coordinatore girerà finché non lo disattivi di nuovo.",
              [
                { text: "Annulla", style: "cancel" },
                { text: "Confermo", style: "destructive", onPress: () => killSwitchMutation.mutate(!data?.killSwitch) },
              ],
            )
          }
          testID="coordinator-kill-switch-toggle"
        >
          <Text style={styles.killSwitchToggleText}>{data?.killSwitch ? "ATTIVO" : "spento"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Job registrati ({jobs.length})</Text>
      {jobs.length === 0 ? (
        <Text style={styles.emptyText}>Nessun job ancora registrato (appariranno al primo giro).</Text>
      ) : (
        jobs.map((job) => (
          <View key={job.name} style={styles.jobCard} testID={`coordinator-job-${job.name}`}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobName}>{job.name}</Text>
              <View style={[styles.stateBadge, { backgroundColor: STATE_COLOR[job.state] + "22" }]}>
                <Text style={[styles.stateBadgeText, { color: STATE_COLOR[job.state] }]}>{job.state}</Text>
              </View>
            </View>
            {job.directive ? (
              <View
                style={[
                  styles.directiveRow,
                  { borderColor: ISSUER_COLOR[job.directive.issuedBy], backgroundColor: ISSUER_COLOR[job.directive.issuedBy] + "18" },
                ]}
                testID={`coordinator-job-${job.name}-directive`}
              >
                <MaterialCommunityIcons
                  name={job.directive.issuedBy === "horus" ? "robot-outline" : job.directive.issuedBy === "admin_manual" ? "account-lock-outline" : "cog-outline"}
                  size={14}
                  color={ISSUER_COLOR[job.directive.issuedBy]}
                />
                <Text style={[styles.directiveText, { color: ISSUER_COLOR[job.directive.issuedBy] }]}>
                  {job.directive.kind} — {ISSUER_LABEL[job.directive.issuedBy]} — {job.directive.reason}
                </Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Ultima run: {fmt(job.lastRunAt)}</Text>
              <Text style={styles.metaText}>Ultimo successo: {fmt(job.lastSuccessAt)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Run: {job.runCount}</Text>
              <Text style={styles.metaText}>OK: {job.successCount}</Text>
              <Text style={[styles.metaText, job.failureCount > 0 ? { color: Colors.error } : null]}>Errori: {job.failureCount}</Text>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                disabled={busyJob === job.name}
                style={styles.actionButton}
                onPress={() => applyDirective(job.name, "pause")}
                testID={`coordinator-job-${job.name}-pause`}
              >
                <Text style={styles.actionButtonText}>Pausa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busyJob === job.name}
                style={styles.actionButton}
                onPress={() => applyDirective(job.name, "resume")}
                testID={`coordinator-job-${job.name}-resume`}
              >
                <Text style={styles.actionButtonText}>Riprendi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busyJob === job.name}
                style={styles.actionButton}
                onPress={() => applyDirective(job.name, "force")}
                testID={`coordinator-job-${job.name}-force`}
              >
                <Text style={styles.actionButtonText}>Forza ora</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  killSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 20,
  },
  killSwitchLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  killSwitchSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  killSwitchToggle: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  killSwitchToggleText: { fontFamily: "Inter_700Bold", fontSize: 12, color: "#fff" },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginBottom: 10 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  jobCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  jobHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  jobName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  stateBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  stateBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase" },
  directiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  directiveText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12 },
  metaRow: { flexDirection: "row", gap: 14, marginBottom: 2 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  actionButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
});
