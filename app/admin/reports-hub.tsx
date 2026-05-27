/**
 * Task #2531 — Hub Moderazione Report.
 *
 * Dashboard di ingresso al nuovo gruppo "Report" dell'admin: contatori
 * per status / categoria / ruolo / severity, top 5 pattern, alert per
 * report critici aperti > 1h, ban attivi nelle ultime 24h, quick links
 * a tutte le sotto-viste.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import AiCostBadge from "@/components/admin/ai/AiCostBadge";
import AiCopilotDrawer from "@/components/admin/ai/AiCopilotDrawer";

interface HubSummary {
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byRole: Record<string, number>;
  bySeverity: Record<string, number>;
  topPatterns: Array<{ reportedUserId: string; count: number; weight: number }>;
  criticalOpenOver1h: number;
  activeBansLast24h: number;
  unclaimedPending: number;
  totalPending: number;
  generatedAt: string;
  cached?: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  aggressive: "Aggressivo",
  harassment: "Molestia",
  fake_profile: "Profilo Falso",
  no_show: "No-Show",
  opportunist: "Opportunista",
  group_misconduct: "Cattiva condotta gruppo",
  dangerous_riding: "Pericoloso in strada",
  other: "Altro",
};
const ROLE_LABEL: Record<string, string> = {
  biker: "Biker",
  zavorrina: "Zavorrine",
  club: "Club",
  moderator: "Moderatori",
  admin: "Admin",
  unknown: "Sconosciuto",
};
const SEVERITY_COLORS: Record<string, string> = {
  critical: "#FF3B30",
  high: "#FF9500",
  medium: "#FFCC00",
  low: "#8E8E93",
};

const QUICK_LINKS: Array<{ key: string; label: string; route: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }> = [
  { key: "queue", label: "Coda", route: "/admin/reports", icon: "flag-variant", color: "#FF9500" },
  { key: "category", label: "Per Categoria", route: "/admin/reports-by-category", icon: "shape-outline", color: "#0EA5E9" },
  { key: "role", label: "Per Ruolo", route: "/admin/reports-by-role", icon: "account-group-outline", color: "#10B981" },
  { key: "patterns", label: "Pattern", route: "/admin/reports-patterns", icon: "chart-bell-curve", color: "#E91E63" },
  { key: "false", label: "Falsi Report", route: "/admin/false-reports", icon: "shield-alert-outline", color: "#9C27B0" },
  { key: "bans", label: "Ban Attivi", route: "/admin/active-bans", icon: "account-cancel-outline", color: "#FF3B30" },
  { key: "logs", label: "Log Moderatori", route: "/admin/moderator-logs", icon: "shield-account-outline", color: "#6366F1" },
  { key: "thresh", label: "Soglie & Policy", route: "/admin/reports-thresholds", icon: "tune-variant", color: "#22C55E" },
];

export default function ReportsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [aiPatternOpen, setAiPatternOpen] = React.useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery<HubSummary>({
    queryKey: ["/api/admin/reports/hub-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/reports/hub-summary");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const totalReports = Object.values(data?.byStatus ?? {}).reduce((a, b) => a + b, 0);

  // Task #2551 — badge "digest non letto" in cima all'hub.
  const unreadQ = useQuery<{ unread: boolean }>({
    queryKey: ["/api/admin/ai/digest/unread"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/ai/digest/unread");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={Colors.accent} />}
    >
      {isLoading && !data ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <>
          {unreadQ.data?.unread && (
            <TouchableOpacity
              style={styles.unreadDigest}
              onPress={() => router.push("/admin/ai-moderation-digest" as Href)}
              accessibilityRole="button"
              accessibilityLabel="Apri il digest AI non letto"
            >
              <MaterialCommunityIcons name="email-mark-as-unread" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.unreadDigestTitle}>Nuovo digest AI da leggere</Text>
                <Text style={styles.unreadDigestSubtitle}>Brief mattutino e casi prioritari pronti.</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          )}

          {data && data.criticalOpenOver1h > 0 && (
            <View style={styles.alertCritical}>
              <Ionicons name="warning" size={22} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{data.criticalOpenOver1h} report critici aperti &gt; 1h</Text>
                <Text style={styles.alertSubtitle}>Richiedono intervento immediato.</Text>
              </View>
              <TouchableOpacity onPress={() => router.push("/admin/reports?severity=critical&status=pending" as Href)}>
                <Ionicons name="arrow-forward" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ marginBottom: 12, alignItems: "flex-end" }}>
            <AiCostBadge />
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: Colors.warning }]}>{data?.totalPending ?? 0}</Text>
              <Text style={styles.kpiLabel}>Pending</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: Colors.accent }]}>{data?.unclaimedPending ?? 0}</Text>
              <Text style={styles.kpiLabel}>Non assegnati</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: Colors.error }]}>{data?.activeBansLast24h ?? 0}</Text>
              <Text style={styles.kpiLabel}>Ban 24h</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: Colors.text }]}>{totalReports}</Text>
              <Text style={styles.kpiLabel}>Totale</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Per categoria (pending)</Text>
          <View style={styles.chipGrid}>
            {Object.keys(CATEGORY_LABEL).map((cat) => {
              const n = data?.byCategory[cat] ?? 0;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, n > 0 && styles.chipActive]}
                  onPress={() => router.push(`/admin/reports-by-category?cat=${cat}` as Href)}
                >
                  <Text style={styles.chipLabel}>{CATEGORY_LABEL[cat]}</Text>
                  <Text style={[styles.chipCount, n > 0 ? { color: Colors.accent } : {}]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Per ruolo segnalato (pending)</Text>
          <View style={styles.chipGrid}>
            {["biker", "zavorrina", "club", "moderator"].map((role) => {
              const n = data?.byRole[role] ?? 0;
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.chip, n > 0 && styles.chipActive]}
                  onPress={() => router.push(`/admin/reports-by-role?role=${role}` as Href)}
                >
                  <Text style={styles.chipLabel}>{ROLE_LABEL[role]}</Text>
                  <Text style={[styles.chipCount, n > 0 ? { color: Colors.accent } : {}]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Severity (pending)</Text>
          <View style={styles.sevRow}>
            {(["critical", "high", "medium", "low"] as const).map((s) => {
              const n = data?.bySeverity[s] ?? 0;
              const c = SEVERITY_COLORS[s];
              return (
                <View key={s} style={[styles.sevCard, { borderColor: c }]}>
                  <Text style={[styles.sevValue, { color: c }]}>{n}</Text>
                  <Text style={styles.sevLabel}>{s}</Text>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.sectionTitle}>Top 5 pattern (30g)</Text>
            <TouchableOpacity onPress={() => setAiPatternOpen(true)} accessibilityLabel="Chiedi all'AI dei pattern">
              <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.accent} />
            </TouchableOpacity>
          </View>
          {(data?.topPatterns ?? []).length === 0 ? (
            <Text style={styles.empty}>Nessun pattern rilevato</Text>
          ) : (
            (data?.topPatterns ?? []).map((p, i) => (
              <TouchableOpacity
                key={p.reportedUserId}
                style={styles.patternRow}
                onPress={() => router.push("/admin/reports-patterns" as Href)}
              >
                <Text style={styles.patternRank}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patternId}>{p.reportedUserId.slice(0, 8)}…</Text>
                  <Text style={styles.patternMeta}>{p.count} segnalazioni · peso {p.weight.toFixed(2)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.quickGrid}>
            {QUICK_LINKS.map((q) => (
              <TouchableOpacity key={q.key} style={styles.quickCard} onPress={() => router.push(q.route as Href)}>
                <View style={[styles.quickIcon, { backgroundColor: q.color + "22" }]}>
                  <MaterialCommunityIcons name={q.icon} size={22} color={q.color} />
                </View>
                <Text style={styles.quickLabel}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {data && (
            <Text style={styles.footer}>
              Aggiornato: {new Date(data.generatedAt).toLocaleString("it-IT")}
              {data.cached ? " · cache" : ""}
            </Text>
          )}
        </>
      )}
      <AiCopilotDrawer
        visible={aiPatternOpen}
        onClose={() => setAiPatternOpen(false)}
        scope="pattern"
        initialMessage="Analizza i pattern di moderazione recenti: chi sono gli utenti più segnalati negli ultimi 30 giorni, ci sono cluster di categorie o segnalanti sospetti? Suggerisci priorità d'azione."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  alertCritical: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FF3B30",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  alertTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  alertSubtitle: { color: "#fff", fontFamily: "Inter_400Regular", fontSize: 12, opacity: 0.9 },
  unreadDigest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#6366F1",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  unreadDigestTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  unreadDigestSubtitle: { color: "#fff", fontFamily: "Inter_400Regular", fontSize: 12, opacity: 0.9 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kpiValue: { fontFamily: "Inter_700Bold", fontSize: 22 },
  kpiLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 10,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.accent + "88" },
  chipLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  chipCount: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.textSecondary },
  sevRow: { flexDirection: "row", gap: 10 },
  sevCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1.5,
  },
  sevValue: { fontFamily: "Inter_700Bold", fontSize: 20 },
  sevLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2, textTransform: "uppercase" },
  patternRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  patternRank: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, width: 28 },
  patternId: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  patternMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", padding: 12 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: {
    width: "31%",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text, textAlign: "center" },
  footer: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center", marginTop: 20 },
});
