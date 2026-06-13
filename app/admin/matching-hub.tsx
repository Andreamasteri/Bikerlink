/**
 * Task #2527 — Hub Matching.
 *
 * Dashboard di ingresso al gruppo "Matching" del pannello admin. Mostra in
 * un'unica schermata: stato del ciclo, lock engine, audit alert e quick links
 * alle sotto-sezioni (Engine, Control, Health, Inspector, Preferences,
 * Rules, Tags, Embeddings, Feedback, Route Sim, Time Profile, ecc.).
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface AuditIssue {
  severity: "error" | "warn" | "info";
  category: string;
  message: string;
}
interface AuditResponse {
  overallStatus: "ok" | "warn" | "error";
  issuesCount: number;
  issues: AuditIssue[];
  registryStats: { totalTypes: number; countableTypes: number; expectedPrefColumns: string[] };
}

interface LockState {
  isRunning: boolean;
  lastStartIso: string | null;
  elapsedMs: number | null;
}

interface StatsResponse {
  totalZavarrinaMatches: number;
  totalBikerBikerMatches: number;
  totalMusicMatches: number;
  totalBikerZavBaseMatches: number;
  bzBaseByPref?: { zavorrina: number; both: number };
  bzBaseByType?: { biker: number; coppia: number };
  lastRunAt: string | null;
}

interface EmbeddingCoverage {
  efSearch: number;
  activeUsers: number;
  byField: { field: string; coveragePct: number }[];
  coverageWarning: boolean;
  coverageThresholdPct: number;
}

interface QuickLink {
  key: string;
  label: string;
  icon: string;
  iconSet: "Ionicons" | "MaterialCommunityIcons";
  route: string;
  color: string;
}

const LOCK_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

const QUICK_LINKS: QuickLink[] = [
  { key: "engine", label: "Motore", icon: "engine", iconSet: "MaterialCommunityIcons", route: "/admin/match-engine", color: "#FF9500" },
  { key: "control", label: "Controllo", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/match-control", color: "#9C27B0" },
  { key: "health", label: "Health", icon: "heart-pulse", iconSet: "MaterialCommunityIcons", route: "/admin/match-health", color: "#4CAF50" },
  { key: "inspector", label: "Inspector", icon: "account-search", iconSet: "MaterialCommunityIcons", route: "/admin/match-inspector", color: "#2196F3" },
  { key: "preferences", label: "Preferenze", icon: "tune", iconSet: "MaterialCommunityIcons", route: "/admin/match-preferences-edit", color: "#10B981" },
  { key: "rules", label: "Regole", icon: "table-large", iconSet: "MaterialCommunityIcons", route: "/admin/match-rules", color: "#10B981" },
  { key: "telemetry", label: "Telemetria", icon: "chart-line", iconSet: "MaterialCommunityIcons", route: "/admin/matching-telemetry", color: "#22C55E" },
  { key: "ab", label: "A/B", icon: "flask-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ab", color: "#E91E63" },
  { key: "negative", label: "Pref. Negative", icon: "minus-circle-outline", iconSet: "MaterialCommunityIcons", route: "/admin/negative-pref-patterns", color: "#F44336" },
  { key: "ai-console", label: "AI Console", icon: "robot-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ai-console", color: "#FF6600" },
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function severityColor(s: AuditIssue["severity"]) {
  if (s === "error") return Colors.error;
  if (s === "warn") return Colors.warning;
  return Colors.textSecondary;
}

export default function MatchingHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: audit, isLoading: auditLoading } = useQuery<AuditResponse>({
    queryKey: ["/api/admin/matching/audit"],
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const { data: lock } = useQuery<LockState>({
    queryKey: ["/api/admin/matching/lock-state"],
    refetchInterval: 5000,
    staleTime: 2000,
  });
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["/api/admin/matching/stats"],
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const { data: embedding } = useQuery<EmbeddingCoverage>({
    queryKey: ["/api/admin/embeddings/coverage"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const forceUnlock = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/matching/force-unlock"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/matching/lock-state"] });
    },
    onError: () => {
      Alert.alert("Errore", "Force-unlock fallito. Riprova.");
    },
  });

  const lockIsStale = !!(lock?.isRunning && lock.elapsedMs != null && lock.elapsedMs > LOCK_STALE_THRESHOLD_MS);

  const overallColor =
    audit?.overallStatus === "error" ? Colors.error :
    audit?.overallStatus === "warn" ? Colors.warning : Colors.success;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* Stato ciclo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stato Ciclo</Text>
        <View style={styles.cardRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalBikerBikerMatches ?? "—"}</Text>
            <Text style={styles.statLabel}>Biker-Biker</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalZavarrinaMatches ?? "—"}</Text>
            <Text style={styles.statLabel}>Garage</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalMusicMatches ?? "—"}</Text>
            <Text style={styles.statLabel}>Music</Text>
          </View>
        </View>
        <View style={[styles.cardRow, { marginTop: 8 }]}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalBikerZavBaseMatches ?? "—"}</Text>
            <Text style={styles.statLabel}>BZ Base</Text>
            {stats?.bzBaseByPref && (
              <View style={styles.bzBaseBreakdownRow}>
                <Text style={styles.bzBaseBreakdownItem}>
                  Zav: {stats.bzBaseByPref.zavorrina}
                </Text>
                <Text style={styles.bzBaseBreakdownDot}>·</Text>
                <Text style={styles.bzBaseBreakdownItem}>
                  Both: {stats.bzBaseByPref.both}
                </Text>
              </View>
            )}
            {stats?.bzBaseByType && (stats.bzBaseByType.coppia > 0) && (
              <View style={styles.bzBaseBreakdownRow}>
                <Text style={styles.bzBaseBreakdownItem}>
                  B: {stats.bzBaseByType.biker}
                </Text>
                <Text style={styles.bzBaseBreakdownDot}>·</Text>
                <Text style={styles.bzBaseBreakdownItem}>
                  C: {stats.bzBaseByType.coppia}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.lastRun}>
          Ultimo ciclo: {formatDate(stats?.lastRunAt ?? null)}
        </Text>
      </View>

      {/* Lock engine */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Lock Engine</Text>
          {lockIsStale && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.error + "22" }]}>
              <Text style={[styles.statusBadgeText, { color: Colors.error }]}>
                BLOCCATO DA {Math.floor((lock!.elapsedMs!) / 60000)}min
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.lockCard, lockIsStale && styles.lockCardStale]}>
          <MaterialCommunityIcons
            name={lock?.isRunning ? "lock" : "lock-open-variant"}
            size={22}
            color={lockIsStale ? Colors.error : lock?.isRunning ? Colors.warning : Colors.success}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.lockTitle, lockIsStale && { color: Colors.error }]}>
              {lockIsStale ? "LOCK SCADUTO" : lock?.isRunning ? "BLOCCATO" : "Libero"}
            </Text>
            {lock?.isRunning && lock.elapsedMs != null && (
              <Text style={styles.lockSub}>In esecuzione da {Math.floor(lock.elapsedMs / 1000)}s</Text>
            )}
            {!lock?.isRunning && lock?.lastStartIso && (
              <Text style={styles.lockSub}>Ultimo avvio: {formatDate(lock.lastStartIso)}</Text>
            )}
            {lockIsStale && (
              <Text style={[styles.lockSub, { color: Colors.error, marginTop: 4 }]}>
                Il ciclo supera la soglia di 15 minuti — probabile blocco anomalo
              </Text>
            )}
          </View>
          {lock?.isRunning && (
            <TouchableOpacity
              style={[styles.unlockBtn, lockIsStale && styles.unlockBtnStale]}
              onPress={() => {
                Alert.alert(
                  "Force-Unlock",
                  lockIsStale
                    ? "Il lock risulta bloccato da più di 15 minuti. Sbloccare forzatamente?"
                    : "Sbloccare il lock del ciclo matching in corso?",
                  [
                    { text: "Annulla", style: "cancel" },
                    { text: "Sblocca", style: "destructive", onPress: () => forceUnlock.mutate() },
                  ]
                );
              }}
              disabled={forceUnlock.isPending}
              activeOpacity={0.7}
            >
              {forceUnlock.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <MaterialCommunityIcons name="lock-open-alert" size={18} color="#fff" />
              }
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Audit alerts */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Audit</Text>
          {audit && (
            <View style={[styles.statusBadge, { backgroundColor: overallColor + "22" }]}>
              <Text style={[styles.statusBadgeText, { color: overallColor }]}>
                {audit.overallStatus.toUpperCase()} · {audit.issuesCount}
              </Text>
            </View>
          )}
        </View>
        {auditLoading && <ActivityIndicator color={Colors.accent} style={{ marginTop: 10 }} />}
        {audit && audit.issues.length === 0 && (
          <View style={styles.okCard}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.okText}>Nessuna anomalia rilevata. Registry: {audit.registryStats.totalTypes} tipi.</Text>
          </View>
        )}
        {audit?.issues.slice(0, 8).map((issue, idx) => (
          <View key={idx} style={[styles.issueCard, { borderLeftColor: severityColor(issue.severity) }]}>
            <Text style={[styles.issueCat, { color: severityColor(issue.severity) }]}>
              {issue.severity.toUpperCase()} · {issue.category}
            </Text>
            <Text style={styles.issueMsg}>{issue.message}</Text>
          </View>
        ))}
      </View>

      {/* Embedding coverage tile */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Embedding</Text>
        <TouchableOpacity
          style={[
            styles.embeddingTile,
            embedding?.coverageWarning && styles.embeddingTileWarn,
          ]}
          onPress={() => router.push("/admin/match-engine" as never)}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons
            name="database-search"
            size={20}
            color={embedding?.coverageWarning ? Colors.warning : Colors.success}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.embeddingLabel}>Copertura bio embedding</Text>
            {embedding ? (
              <Text
                style={[
                  styles.embeddingValue,
                  { color: embedding.coverageWarning ? Colors.warning : Colors.success },
                ]}
              >
                {(embedding.byField.find((r) => r.field === "bio")?.coveragePct ?? 0)}%
              </Text>
            ) : (
              <Text style={styles.embeddingValue}>—</Text>
            )}
          </View>
          {embedding?.coverageWarning && (
            <View style={styles.warnBadge}>
              <Ionicons name="warning" size={12} color={Colors.warning} />
              <Text style={styles.warnBadgeText}>WARN</Text>
            </View>
          )}
          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Quick links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sezioni Matching</Text>
        <View style={styles.linksGrid}>
          {QUICK_LINKS.map((link) => (
            <TouchableOpacity
              key={link.key}
              style={styles.linkCard}
              onPress={() => router.push(link.route as never)}
              activeOpacity={0.7}
            >
              {link.iconSet === "Ionicons" ? (
                <Ionicons name={link.icon as never} size={22} color={link.color} />
              ) : (
                <MaterialCommunityIcons name={link.icon as never} size={22} color={link.color} />
              )}
              <Text style={styles.linkLabel}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },
  cardRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  bzBaseBreakdownRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  bzBaseBreakdownItem: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  bzBaseBreakdownDot: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  lastRun: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 8, textAlign: "center" },
  lockCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  lockCardStale: {
    borderColor: Colors.error, backgroundColor: Colors.error + "0D",
  },
  lockTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  lockSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  unlockBtn: {
    backgroundColor: Colors.warning, borderRadius: 8, padding: 8,
    alignItems: "center", justifyContent: "center",
  },
  unlockBtnStale: {
    backgroundColor: Colors.error,
  },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  okCard: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
    backgroundColor: Colors.success + "11", borderRadius: 10,
  },
  okText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  issueCard: {
    padding: 12, backgroundColor: Colors.surface, borderRadius: 10,
    borderLeftWidth: 4, marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  issueCat: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5, marginBottom: 4 },
  issueMsg: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text },
  embeddingTile: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  embeddingTileWarn: {
    borderColor: Colors.warning, backgroundColor: Colors.warning + "0D",
  },
  embeddingLabel: {
    fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary,
  },
  embeddingValue: {
    fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text, marginTop: 2,
  },
  warnBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.warning + "22", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.warning,
  },
  warnBadgeText: {
    fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.warning, letterSpacing: 0.5,
  },
  linksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  linkCard: {
    width: "31%", aspectRatio: 1, backgroundColor: Colors.surface,
    borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  linkLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text, textAlign: "center" },
});
