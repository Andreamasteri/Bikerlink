// Task #2537 — Dashboard AI App Integrity (9 famiglie generaliste).
import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type Severity = "low" | "medium" | "high" | "critical";
type Health = "green" | "yellow" | "orange" | "red";
type Family = "code" | "api" | "ui" | "i18n" | "config" | "assets" | "deps" | "env" | "workflows";

const FAMILY_LABEL: Record<Family, string> = {
  code: "Code", api: "API", ui: "UI", i18n: "i18n", config: "Config",
  assets: "Assets", deps: "Deps", env: "Env", workflows: "Workflows",
};

interface FamilyChecks {
  family: Family;
  count: number;
  checks: Array<{
    id: string; name: string; severity: Severity; cost: string;
    expensive: boolean; hasAutofix: boolean; autofixSafe: boolean; description: string;
  }>;
}

interface Status {
  summary: null | {
    id: string; runAt: string; durationMs: number; trigger: string;
    checksRun: number; violationsFound: number; autoFixed: number; autoResolved: number; manualPending: number;
    bySeverity: Record<Severity, number>;
    byFamily: Record<Family, number>;
    health: Health;
  };
  schedule: { running: boolean; nightlyNext: string | null; weeklyNext: string | null; lastRunAt: string | null };
  families: Family[];
  totalChecks: number;
  checksByFamily: FamilyChecks[];
}

interface Violation {
  id: string; family: Family; checkId: string; checkName: string; severity: Severity;
  count: number; sample: Array<{ pk?: string; data: Record<string, unknown> }>;
  details: Record<string, unknown> | null;
  status: string; autoFixApplied: boolean; autoFixSummary: string | null;
  aiExplain: null | { rootCause: string; blastRadius: string; proposedFix: string; diff?: string; reasoning: string; risk: string; modelUsed?: string };
  createdAt: string;
}

const SEV_COLOR: Record<Severity, string> = {
  low: "#808080", medium: "#FF9800", high: "#ff7a00", critical: "#F44336",
};
const HEALTH_COLOR: Record<Health, string> = {
  green: Colors.success, yellow: Colors.warning, orange: "#ff7a00", red: Colors.error,
};

export default function AppIntegrityScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeFamily, setActiveFamily] = useState<Family | "all">("all");

  const status = useQuery<Status>({
    queryKey: ["/api/admin/app-integrity/status"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/app-integrity/status")).json(),
    refetchInterval: 60_000,
  });

  const violations = useQuery<{ violations: Violation[] }>({
    queryKey: ["/api/admin/app-integrity/violations", activeFamily],
    queryFn: async () => {
      const q = activeFamily === "all" ? "limit=200" : `limit=200&family=${activeFamily}`;
      return (await apiRequest("GET", `/api/admin/app-integrity/violations?${q}`)).json();
    },
    refetchInterval: 60_000,
  });

  const runMut = useMutation({
    mutationFn: async (args: { family: Family | "all"; includeExpensive: boolean }) =>
      (await apiRequest("POST", "/api/admin/app-integrity/run", args)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/app-integrity/status"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/app-integrity/violations", activeFamily] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const explainMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/app-integrity/violations/${id}/explain`)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/app-integrity/violations", activeFamily] }),
    onError: (e: Error) => Alert.alert("AI non disponibile", e.message),
  });

  const autofixMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/app-integrity/violations/${id}/apply-fix`, { dryRun: false })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/app-integrity/status"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/app-integrity/violations", activeFamily] });
    },
    onError: (e: Error) => Alert.alert("Autofix fallito", e.message),
  });

  const ignoreMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/app-integrity/violations/${id}/ignore`)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/app-integrity/violations", activeFamily] }),
  });

  const onRefresh = () => { status.refetch(); violations.refetch(); };
  const data = status.data;
  const health: Health = data?.summary?.health ?? "green";

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
              <Text style={styles.cardTitle}>Salute App: {health.toUpperCase()}</Text>
            </View>
            {data.summary ? (
              <Text style={styles.cardMeta}>
                Ultimo run {new Date(data.summary.runAt).toLocaleString("it-IT")} · {data.summary.checksRun} check · {data.summary.violationsFound} violazioni · {data.summary.autoFixed} fix auto · {data.summary.autoResolved ?? 0} risolte auto · {data.summary.manualPending} pending
              </Text>
            ) : (
              <Text style={styles.cardMeta}>Nessun run eseguito ancora.</Text>
            )}
            <View style={styles.sevRow}>
              {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
                <View key={s} style={[styles.sevBadge, { backgroundColor: SEV_COLOR[s] }]}>
                  <Text style={styles.sevBadgeText}>{s}: {data.summary?.bySeverity?.[s] ?? 0}</Text>
                </View>
              ))}
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => runMut.mutate({ family: activeFamily, includeExpensive: false })} disabled={runMut.isPending}>
                <MaterialCommunityIcons name="play" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>{runMut.isPending ? "Esecuzione…" : `Esegui (${activeFamily === "all" ? "tutte" : FAMILY_LABEL[activeFamily]})`}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => runMut.mutate({ family: activeFamily, includeExpensive: true })} disabled={runMut.isPending}>
                <Text style={styles.secondaryBtnText}>+ Expensive</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardMeta}>
              Cron: {data.schedule.running ? "attivo" : "fermo"} · notturno {data.schedule.nightlyNext ? new Date(data.schedule.nightlyNext).toLocaleString("it-IT") : "—"} · weekly {data.schedule.weeklyNext ? new Date(data.schedule.weeklyNext).toLocaleString("it-IT") : "—"}
            </Text>
            <Text style={styles.cardMeta}>{data.totalChecks} check totali su {data.families.length} famiglie</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={{ gap: 6 }}>
            <FamilyTab label="Tutte" active={activeFamily === "all"} count={data.summary?.violationsFound ?? 0} onPress={() => setActiveFamily("all")} />
            {data.families.map((f) => (
              <FamilyTab key={f} label={FAMILY_LABEL[f]} active={activeFamily === f}
                count={data.summary?.byFamily?.[f] ?? 0}
                onPress={() => setActiveFamily(f)} />
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle}>
            Check registrati ({activeFamily === "all" ? data.totalChecks : (data.checksByFamily.find((g) => g.family === activeFamily)?.count ?? 0)})
          </Text>
          {(activeFamily === "all" ? data.checksByFamily : data.checksByFamily.filter((g) => g.family === activeFamily)).map((g) => (
            <View key={g.family} style={styles.familyBlock}>
              <Text style={styles.familyTitle}>{FAMILY_LABEL[g.family]} · {g.count}</Text>
              {g.checks.map((c) => (
                <View key={c.id} style={[styles.checkRow, { borderLeftColor: SEV_COLOR[c.severity] }]}>
                  <View style={[styles.sevBadge, { backgroundColor: SEV_COLOR[c.severity] }]}>
                    <Text style={styles.sevBadgeText}>{c.severity}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.checkMeta} numberOfLines={2}>
                      {c.cost}{c.expensive ? " · expensive" : ""}
                      {c.hasAutofix ? (c.autofixSafe ? " · autofix-safe" : " · autofix") : ""} · {c.description}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}

          <Text style={styles.sectionTitle}>Violazioni aperte ({violations.data?.violations?.length ?? 0})</Text>
          {!violations.data?.violations?.length ? (
            <Text style={styles.empty}>Nessuna violazione aperta. 🎉</Text>
          ) : violations.data.violations.map((v) => (
            <View key={v.id} style={[styles.violationCard, { borderLeftColor: SEV_COLOR[v.severity] }]}>
              <TouchableOpacity onPress={() => setExpanded(expanded === v.id ? null : v.id)}>
                <View style={styles.row}>
                  <View style={[styles.sevDot, { backgroundColor: SEV_COLOR[v.severity] }]} />
                  <Text style={styles.violationTitle}>{v.checkName}</Text>
                </View>
                <Text style={styles.violationMeta}>{FAMILY_LABEL[v.family]} · {v.count} occorrenze · {v.status}</Text>
              </TouchableOpacity>
              {expanded === v.id && (
                <View style={styles.expand}>
                  <Text style={styles.subTitle}>
                    {v.checkId === "code/duplication" ? `Hotspot (${v.sample.length} coppie, peggiori prima)` : "Sample"}
                  </Text>
                  {v.checkId === "code/duplication" ? (
                    <DuplicationSampleList sample={v.sample} />
                  ) : (
                    v.sample.slice(0, 3).map((s, i) => (
                      <Text key={i} style={styles.codeBlock} numberOfLines={6}>
                        {JSON.stringify(s.data, null, 2)}
                      </Text>
                    ))
                  )}
                  {v.aiExplain ? (
                    <View style={styles.aiPanel}>
                      <Text style={styles.subTitle}>AI ({v.aiExplain.modelUsed ?? "?"})</Text>
                      <Text style={styles.aiLabel}>Causa</Text>
                      <Text style={styles.aiText}>{v.aiExplain.rootCause}</Text>
                      <Text style={styles.aiLabel}>Impatto</Text>
                      <Text style={styles.aiText}>{v.aiExplain.blastRadius}</Text>
                      <Text style={styles.aiLabel}>Fix proposto ({v.aiExplain.proposedFix}, rischio {v.aiExplain.risk})</Text>
                      <Text style={styles.aiText}>{v.aiExplain.reasoning}</Text>
                      {v.aiExplain.diff ? (<Text style={styles.codeBlock} numberOfLines={20}>{v.aiExplain.diff}</Text>) : null}
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

function FamilyTab({ label, active, count, onPress }: { label: string; active: boolean; count: number; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {count > 0 ? <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{count}</Text></View> : null}
    </TouchableOpacity>
  );
}

type DupFileRef = { path?: string; start?: number; end?: number };
type DupData = {
  a?: DupFileRef; b?: DupFileRef;
  lines?: number | null; tokens?: number | null;
  family_hint?: "same" | "cross" | null;
  suggested_extract?: string | null;
};

function DuplicationSampleList({ sample }: { sample: Array<{ pk?: string; data: Record<string, unknown> }> }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyPath = (p: string) => {
    Clipboard.setStringAsync(p).catch(() => {});
    setCopied(p);
    setTimeout(() => setCopied(null), 1500);
  };

  const sorted = [...sample]
    .map((s) => ({ pk: s.pk, d: s.data as unknown as DupData }))
    .sort((a, b) => {
      // easy wins (same family) first, then by token count descending
      const aEasy = a.d.family_hint === "same" ? 1 : 0;
      const bEasy = b.d.family_hint === "same" ? 1 : 0;
      if (bEasy !== aEasy) return bEasy - aEasy;
      return ((b.d.tokens ?? 0) as number) - ((a.d.tokens ?? 0) as number);
    });

  if (!sorted.length) return <Text style={styles.cardMeta}>Nessun duplicato rilevato.</Text>;

  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      {sorted.map((item) => {
        const { a, b, lines, tokens, family_hint, suggested_extract } = item.d;
        const aPath = a?.path ?? "?";
        const bPath = b?.path ?? "?";
        const aRange = a?.start != null && a?.end != null ? `L${a.start}–${a.end}` : null;
        const bRange = b?.start != null && b?.end != null ? `L${b.start}–${b.end}` : null;
        const cardKey = item.pk ?? `${aPath}↔${bPath}`;
        const isEasyWin = family_hint === "same";
        return (
          <View key={cardKey} style={[styles.dupCard, isEasyWin && styles.dupCardEasyWin]}>
            <View style={styles.dupBadgeRow}>
              {tokens != null && (
                <View style={styles.dupTokenBadge}>
                  <MaterialCommunityIcons name="content-copy" size={11} color="#fff" />
                  <Text style={styles.dupTokenText}>{tokens} tok</Text>
                </View>
              )}
              {lines != null && (
                <Text style={styles.dupLineMeta}>{lines} righe duplicate</Text>
              )}
              {family_hint === "same" ? (
                <View style={styles.dupFamilyBadgeSame}>
                  <MaterialCommunityIcons name="check-circle-outline" size={11} color="#fff" />
                  <Text style={styles.dupFamilyBadgeText}>stesso dominio</Text>
                </View>
              ) : family_hint === "cross" ? (
                <View style={styles.dupFamilyBadgeCross}>
                  <MaterialCommunityIcons name="swap-horizontal" size={11} color="#fff" />
                  <Text style={styles.dupFamilyBadgeText}>cross-dominio</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.dupFileRow} onPress={() => copyPath(aPath)} activeOpacity={0.7}>
              <MaterialCommunityIcons
                name={copied === aPath ? "check" : "file-code-outline"}
                size={13}
                color={copied === aPath ? Colors.success : Colors.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.dupFilePath} numberOfLines={2}>{aPath}</Text>
                {aRange && <Text style={styles.dupLineRange}>{aRange}</Text>}
              </View>
              <Text style={styles.dupCopyHint}>{copied === aPath ? "copiato" : "copia path"}</Text>
            </TouchableOpacity>
            <View style={styles.dupDivider} />
            <TouchableOpacity style={styles.dupFileRow} onPress={() => copyPath(bPath)} activeOpacity={0.7}>
              <MaterialCommunityIcons
                name={copied === bPath ? "check" : "file-code-outline"}
                size={13}
                color={copied === bPath ? Colors.success : Colors.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.dupFilePath} numberOfLines={2}>{bPath}</Text>
                {bRange && <Text style={styles.dupLineRange}>{bRange}</Text>}
              </View>
              <Text style={styles.dupCopyHint}>{copied === bPath ? "copiato" : "copia path"}</Text>
            </TouchableOpacity>
            {isEasyWin && suggested_extract && (
              <View style={styles.dupExtractHint}>
                <MaterialCommunityIcons name="lightbulb-outline" size={12} color={Colors.success} />
                <Text style={styles.dupExtractText} numberOfLines={2}>
                  Estrai in: <Text style={styles.dupExtractPath}>{suggested_extract}</Text>
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
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
  sectionTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 14, marginBottom: 8 },
  violationCard: { borderLeftWidth: 4, padding: 12, marginBottom: 8, backgroundColor: Colors.surface, borderRadius: 8 },
  violationTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  violationMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  expand: { marginTop: 10, gap: 6 },
  subTitle: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 4 },
  codeBlock: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text, backgroundColor: Colors.background, padding: 8, borderRadius: 6 },
  aiPanel: { marginTop: 10, padding: 10, backgroundColor: Colors.background, borderRadius: 8, gap: 4 },
  aiLabel: { color: Colors.textSecondary, fontSize: 11, marginTop: 4, textTransform: "uppercase" },
  aiText: { color: Colors.text, fontSize: 13 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 6, backgroundColor: Colors.surface, borderRadius: 8, borderLeftWidth: 4 },
  checkName: { color: Colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  checkMeta: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  familyBlock: { marginBottom: 12 },
  familyTitle: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 6, marginTop: 6, textTransform: "uppercase" },
  tabsBar: { marginBottom: 8 },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.textSecondary, flexDirection: "row", alignItems: "center", gap: 6 },
  tabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabText: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  tabBadge: { backgroundColor: "#00000040", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  dupCard: { backgroundColor: Colors.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.surface, gap: 6 },
  dupCardEasyWin: { borderColor: Colors.success, borderWidth: 1.5 },
  dupBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" },
  dupTokenBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ff7a00", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  dupTokenText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dupLineMeta: { color: Colors.textSecondary, fontSize: 11 },
  dupFamilyBadgeSame: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.success, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  dupFamilyBadgeCross: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.textSecondary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  dupFamilyBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dupFileRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 2 },
  dupFilePath: { color: Colors.accent, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  dupLineRange: { color: Colors.textSecondary, fontSize: 11, marginTop: 1 },
  dupDivider: { height: 1, backgroundColor: Colors.surface, marginVertical: 2 },
  dupCopyHint: { color: Colors.textSecondary, fontSize: 10, marginLeft: 4, alignSelf: "center" },
  dupExtractHint: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.surface },
  dupExtractText: { flex: 1, color: Colors.textSecondary, fontSize: 11 },
  dupExtractPath: { color: Colors.success, fontFamily: "Inter_600SemiBold" },
});
