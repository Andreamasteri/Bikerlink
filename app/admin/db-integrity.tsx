/**
 * Task #2536 — Dashboard AI DB Integrity. Salute generale, lista check con badge
 * severity, violazioni espandibili con sample rows + AI explain + bottoni fix.
 */
import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useAiExplain } from "@/hooks/admin/ai-console/useAiExplain";

type Severity = "low" | "medium" | "high" | "critical";
type Health = "green" | "yellow" | "orange" | "red";

interface Status {
  summary: null | {
    id: string; runAt: string; durationMs: number; trigger: string;
    checksRun: number; violationsFound: number; autoFixed: number; manualPending: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<string, number>;
    health: Health;
  };
  schedule: { running: boolean; nightlyNext: string | null; weeklyNext: string | null; lastRunAt: string | null };
  snapshot: { hasRun: boolean; health: Health; bySeverity: Record<Severity, number>; criticalSamples: Array<{ checkId: string; checkName: string; count: number }> };
  totalChecks: number;
  checks: Array<{ id: string; name: string; category: string; severity: Severity; cost: string; expensive: boolean; hasAutofix: boolean; autofixSafe: boolean }>;
}

interface Violation {
  id: string; checkId: string; checkName: string; severity: Severity; category: string;
  count: number; sample: Array<{ pk?: string; data: Record<string, unknown> }>;
  details: Record<string, unknown> | null;
  status: string; autoFixApplied: boolean; autoFixSummary: string | null;
  aiExplain: null | { rootCause: string; blastRadius: string; proposedFix: "sql" | "script" | "manual"; sql?: string; reasoning: string; risk: string; modelUsed?: string };
  createdAt: string;
}

const SEV_COLOR: Record<Severity, string> = {
  low: "#808080", medium: "#FF9800", high: "#ff7a00", critical: "#F44336",
};
const HEALTH_COLOR: Record<Health, string> = {
  green: Colors.success, yellow: Colors.warning, orange: "#ff7a00", red: Colors.error,
};

export default function DbIntegrityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const status = useQuery<Status>({
    queryKey: ["/api/admin/db-integrity/status"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/db-integrity/status")).json(),
    refetchInterval: 60_000,
  });

  const violations = useQuery<{ violations: Violation[] }>({
    queryKey: ["/api/admin/db-integrity/violations"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/db-integrity/violations?limit=200")).json(),
    refetchInterval: 60_000,
  });

  const runMut = useMutation({
    mutationFn: async (includeExpensive: boolean) =>
      (await apiRequest("POST", "/api/admin/db-integrity/run", { includeExpensive })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/status"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/violations"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const explainMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/db-integrity/violations/${id}/explain`)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/violations"] }),
    onError: (e: Error) => Alert.alert("AI non disponibile", e.message),
  });

  const autofixMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/db-integrity/violations/${id}/apply-autofix`, { dryRun: false })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/status"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/violations"] });
    },
    onError: (e: Error) => Alert.alert("Autofix fallito", e.message),
  });

  const ignoreMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/db-integrity/violations/${id}/ignore`)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/violations"] }),
  });

  const applySqlMut = useMutation({
    mutationFn: async (args: { id: string; sql: string }) =>
      (await apiRequest("POST", `/api/admin/db-integrity/violations/${args.id}/apply-sql`, { sql: args.sql })).json(),
    onSuccess: () => {
      Alert.alert("OK", "SQL applicato");
      qc.invalidateQueries({ queryKey: ["/api/admin/db-integrity/violations"] });
    },
    onError: (e: Error) => Alert.alert("SQL bloccato/fallito", e.message),
  });

  const onRefresh = () => {
    status.refetch();
    violations.refetch();
  };

  const data = status.data;
  const health: Health = data?.summary?.health ?? data?.snapshot?.health ?? "green";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={status.isFetching || violations.isFetching} onRefresh={onRefresh} tintColor={Colors.accent} />}
    >
      {status.isLoading && !data ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={styles.empty}>Nessun dato.</Text>
      ) : (
        <>
          <View style={[styles.card, { borderColor: HEALTH_COLOR[health] }]}>
            <View style={styles.row}>
              <View style={[styles.healthDot, { backgroundColor: HEALTH_COLOR[health] }]} />
              <Text style={styles.cardTitle}>Salute DB: {health.toUpperCase()}</Text>
            </View>
            {data.summary ? (
              <Text style={styles.cardMeta}>
                Ultimo run {new Date(data.summary.runAt).toLocaleString("it-IT")} · {data.summary.checksRun} check · {data.summary.violationsFound} violazioni · {data.summary.autoFixed} fix auto · {data.summary.manualPending} pending
              </Text>
            ) : (
              <Text style={styles.cardMeta}>Nessun run eseguito ancora.</Text>
            )}
            <View style={styles.sevRow}>
              {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
                <View key={s} style={[styles.sevBadge, { backgroundColor: SEV_COLOR[s] }]}>
                  <Text style={styles.sevBadgeText}>{s}: {data.snapshot?.bySeverity?.[s] ?? 0}</Text>
                </View>
              ))}
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => runMut.mutate(false)} disabled={runMut.isPending}>
                <MaterialCommunityIcons name="play" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>{runMut.isPending ? "Esecuzione…" : "Esegui ora"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => runMut.mutate(true)} disabled={runMut.isPending}>
                <Text style={styles.secondaryBtnText}>+ Expensive</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/admin/db-integrity-quarantine")}>
                <Text style={styles.secondaryBtnText}>Quarantena</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardMeta}>
              Cron: {data.schedule.running ? "attivo" : "fermo"} · prossimo notturno {data.schedule.nightlyNext ? new Date(data.schedule.nightlyNext).toLocaleString("it-IT") : "—"}
            </Text>
            <Text style={styles.cardMeta}>{data.totalChecks} check registrati totali</Text>
          </View>

          <Text style={styles.sectionTitle}>Check registrati ({data.checks?.length ?? 0})</Text>
          {(() => {
            const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            const sorted = [...(data.checks ?? [])].sort((a, b) =>
              (order[a.severity] - order[b.severity]) || a.id.localeCompare(b.id),
            );
            return sorted.map((c) => (
              <View key={c.id} style={[styles.checkRow, { borderLeftColor: SEV_COLOR[c.severity] }]}>
                <View style={[styles.sevBadge, { backgroundColor: SEV_COLOR[c.severity] }]}>
                  <Text style={styles.sevBadgeText}>{c.severity}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.checkMeta} numberOfLines={1}>
                    {c.category} · {c.cost}{c.expensive ? " · expensive" : ""}
                    {c.hasAutofix ? (c.autofixSafe ? " · autofix-safe" : " · autofix") : ""}
                  </Text>
                </View>
              </View>
            ));
          })()}

          <Text style={styles.sectionTitle}>Violazioni aperte ({violations.data?.violations?.length ?? 0})</Text>
          {!violations.data?.violations?.length ? (
            <Text style={styles.empty}>Nessuna violazione aperta. 🎉</Text>
          ) : violations.data.violations.map((v) => (
            <View key={v.id} style={[styles.violationCard, { borderLeftColor: SEV_COLOR[v.severity] }]}>
              <TouchableOpacity onPress={() => setExpanded(expanded === v.id ? null : v.id)}>
                <View style={styles.row}>
                  <View style={[styles.sevDot, { backgroundColor: SEV_COLOR[v.severity] }]} />
                  <Text style={styles.violationTitle}>{v.checkName}</Text>
                  <ExplainInConsoleBtn id={v.id} label={v.checkName} />
                </View>
                <Text style={styles.violationMeta}>{v.category} · {v.count} righe · {v.status}</Text>
              </TouchableOpacity>
              {expanded === v.id && (
                <View style={styles.expand}>
                  <Text style={styles.subTitle}>Sample</Text>
                  {v.sample.slice(0, 3).map((s, i) => (
                    <Text key={i} style={styles.codeBlock} numberOfLines={6}>
                      {JSON.stringify(s.data, null, 2)}
                    </Text>
                  ))}
                  {v.aiExplain ? (
                    <View style={styles.aiPanel}>
                      <Text style={styles.subTitle}>AI: {v.aiExplain.modelUsed ?? "?"}</Text>
                      <Text style={styles.aiLabel}>Causa</Text>
                      <Text style={styles.aiText}>{v.aiExplain.rootCause}</Text>
                      <Text style={styles.aiLabel}>Impatto</Text>
                      <Text style={styles.aiText}>{v.aiExplain.blastRadius}</Text>
                      <Text style={styles.aiLabel}>Fix proposto ({v.aiExplain.proposedFix}, rischio {v.aiExplain.risk})</Text>
                      <Text style={styles.aiText}>{v.aiExplain.reasoning}</Text>
                      {v.aiExplain.sql ? (
                        <>
                          <Text style={styles.codeBlock}>{v.aiExplain.sql}</Text>
                          <TouchableOpacity
                            style={styles.warnBtn}
                            onPress={() => Alert.alert(
                              "Applicare SQL?",
                              "Lo SQL passerà di nuovo per la safety guard.",
                              [
                                { text: "Annulla", style: "cancel" },
                                { text: "Applica", style: "destructive", onPress: () => applySqlMut.mutate({ id: v.id, sql: v.aiExplain!.sql! }) },
                              ],
                            )}
                          >
                            <Text style={styles.warnBtnText}>Applica SQL</Text>
                          </TouchableOpacity>
                        </>
                      ) : null}
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => explainMut.mutate(v.id)} disabled={explainMut.isPending}>
                      <MaterialCommunityIcons name="robot-outline" size={16} color={Colors.accent} />
                      <Text style={styles.secondaryBtnText}>{explainMut.isPending ? "AI in corso…" : "Spiega con AI"}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => autofixMut.mutate(v.id)} disabled={autofixMut.isPending}>
                      <Text style={styles.primaryBtnText}>Autofix</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => ignoreMut.mutate(v.id)}>
                      <Text style={styles.secondaryBtnText}>Ignora</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14, backgroundColor: Colors.surface },
  cardTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 16 },
  cardMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  healthDot: { width: 12, height: 12, borderRadius: 6 },
  sevRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  sevBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  sevBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  primaryBtn: { backgroundColor: Colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  secondaryBtn: { borderWidth: 1, borderColor: Colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  secondaryBtnText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  warnBtn: { backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: "flex-start", marginTop: 8 },
  warnBtnText: { color: "#000", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sectionTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 8, marginBottom: 8 },
  violationCard: { borderLeftWidth: 4, padding: 12, marginBottom: 8, backgroundColor: Colors.surface, borderRadius: 8 },
  violationTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  violationMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  expand: { marginTop: 10, gap: 6 },
  subTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 4 },
  codeBlock: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text, backgroundColor: Colors.background, padding: 8, borderRadius: 6 },
  aiPanel: { marginTop: 10, padding: 10, backgroundColor: Colors.background, borderRadius: 8, gap: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 6, backgroundColor: Colors.surface, borderRadius: 8, borderLeftWidth: 4 },
  checkName: { color: Colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  checkMeta: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  aiLabel: { color: Colors.textSecondary, fontSize: 11, marginTop: 4, textTransform: "uppercase" },
  aiText: { color: Colors.text, fontSize: 13 },
  explainBtn: {
    marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.accent,
  },
  explainBtnText: { color: Colors.accent, fontFamily: "Inter_500Medium", fontSize: 10 },
});

// Task #2645 — bottone "Spiegami questo" che apre la AI Console con seed contesto.
function ExplainInConsoleBtn({ id, label }: { id: string; label: string }) {
  const explain = useAiExplain({ type: "violation", id, label });
  return (
    <TouchableOpacity
      onPress={explain.trigger}
      style={styles.explainBtn}
      accessibilityLabel="Spiegami in AI Console"
      testID="explain-in-console"
    >
      <MaterialCommunityIcons name="robot-happy-outline" size={12} color={Colors.accent} />
      <Text style={styles.explainBtnText}>Spiega in console</Text>
    </TouchableOpacity>
  );
}
