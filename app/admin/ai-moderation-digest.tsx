// Task #2551 — Schermata digest AI moderazione: brief mattutino con i casi
// prioritari, generato dal Co-Pilot. Pull-to-refresh + bottone "Genera adesso".
import React, { useState } from "react";
import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { copyLogToClipboard } from "@/lib/copyAdminLog";

interface CaseSummary {
  id: string;
  severity: string;
  category: string | null;
  reportedUserId: string;
  createdAt: string;
  assigned: boolean;
  aiSummary?: string | null;
}
interface DigestPayload {
  generatedAt: string;
  totalReports24h: number;
  pendingTotal: number;
  topCases: CaseSummary[];
  anomalies24h: number;
  aiBrief: string;
  aiMeta?: { provider: string; model: string; fallback?: boolean };
}

const SEV_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e",
};

export default function AiModerationDigestScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();

  const q = useQuery<{ digest: DigestPayload | null; digestId: string | null; read: boolean }>({
    queryKey: ["/api/admin/ai/digest/latest"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/digest/latest")).json(),
    refetchInterval: 60_000,
  });

  const runNow = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/ai/digest/run")).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/digest/latest"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/digest/unread"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  // Task #2551 — mark-as-read.
  const markRead = useMutation({
    mutationFn: async (digestId: string) => {
      await apiRequest("POST", "/api/admin/ai/digest/mark-read", { digestId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/digest/latest"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/digest/unread"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const [briefCopied, setBriefCopied] = useState(false);

  const d = q.data?.digest ?? null;
  const digestId = q.data?.digestId ?? null;
  const isRead = q.data?.read ?? false;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
    >
      <View style={styles.headerCard}>
        <MaterialCommunityIcons name="brain" size={20} color={Colors.accent} />
        <Text style={styles.headerText}>
          Brief AI mattutino — riepilogo delle ultime 24h con casi prioritari per la moderazione.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.runBtn, runNow.isPending && styles.runBtnDisabled]}
        onPress={() => runNow.mutate()}
        disabled={runNow.isPending}
      >
        {runNow.isPending ? (
          <ActivityIndicator color={Colors.text} />
        ) : (
          <>
            <MaterialCommunityIcons name="play-circle" size={18} color={Colors.text} />
            <Text style={styles.runBtnText}>Genera adesso</Text>
          </>
        )}
      </TouchableOpacity>

      {q.isLoading && (
        <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
      )}

      {!q.isLoading && !d && (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="email-outline" size={32} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun digest ancora generato.</Text>
          <Text style={styles.emptyHint}>Premi &quot;Genera adesso&quot; o aspetta le 08:00.</Text>
        </View>
      )}

      {d && (
        <>
          <View style={styles.statsRow}>
            <StatBox label="Nuovi 24h" value={d.totalReports24h} />
            <StatBox label="Pending tot." value={d.pendingTotal} />
            <StatBox label="Anomalie" value={d.anomalies24h} />
          </View>

          <View style={styles.briefCard}>
            <View style={styles.briefHeader}>
              <Text style={styles.briefTitle}>Brief AI</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {d.aiMeta && (
                  <Text style={styles.briefMeta}>
                    {d.aiMeta.fallback ? "fallback" : `${d.aiMeta.provider}/${d.aiMeta.model}`}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={async () => {
                    const ok = await copyLogToClipboard({
                      title: "AI Moderation Digest",
                      aiBrief: d.aiBrief || "(vuoto)",
                      aiMeta: d.aiMeta,
                      extraLines: [
                        `Generato il: ${new Date(d.generatedAt).toLocaleString("it-IT")}`,
                        `Nuovi 24h: ${d.totalReports24h} · Pending: ${d.pendingTotal} · Anomalie: ${d.anomalies24h}`,
                        ...(d.topCases.length > 0
                          ? ["", `Casi prioritari (${d.topCases.length}):`,
                              ...d.topCases.map((c) => `  [${c.severity.toUpperCase()}] ${c.category ?? "—"} — ${new Date(c.createdAt).toLocaleString("it-IT")}${c.aiSummary ? `: ${c.aiSummary}` : ""}`)]
                          : ["", "Nessun caso urgente."]),
                      ],
                    });
                    if (ok) {
                      setBriefCopied(true);
                      setTimeout(() => setBriefCopied(false), 2000);
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="content-copy" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            {briefCopied && (
              <Text style={styles.copiedHint}>Copiato!</Text>
            )}
            <Text style={styles.briefBody}>{d.aiBrief || "(vuoto)"}</Text>
            <Text style={styles.briefFooter}>
              Generato il {new Date(d.generatedAt).toLocaleString("it-IT")}
            </Text>
            {digestId && (
              <TouchableOpacity
                style={[styles.markReadBtn, (isRead || markRead.isPending) && styles.markReadBtnDisabled]}
                onPress={() => markRead.mutate(digestId)}
                disabled={isRead || markRead.isPending}
                accessibilityRole="button"
                accessibilityState={{ disabled: isRead }}
              >
                {markRead.isPending ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={isRead ? "check-circle" : "email-open-outline"}
                      size={16}
                      color={isRead ? Colors.textSecondary : Colors.accent}
                    />
                    <Text style={[styles.markReadText, isRead && styles.markReadTextDone]}>
                      {isRead ? "Già letto" : "Marca come letto"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.sectionTitle}>Casi prioritari ({d.topCases.length})</Text>
          {d.topCases.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nessun caso urgente — ottimo lavoro!</Text>
            </View>
          ) : (
            d.topCases.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.caseCard}
                onPress={() => router.push(`/admin/reports-hub`)}
              >
                <View style={[styles.sevDot, { backgroundColor: SEV_COLORS[c.severity] ?? Colors.textSecondary }]} />
                <View style={styles.caseBody}>
                  <View style={styles.caseHeader}>
                    <Text style={styles.caseSeverity}>{c.severity.toUpperCase()}</Text>
                    {c.assigned && (
                      <View style={styles.assignedBadge}>
                        <Text style={styles.assignedText}>tuo</Text>
                      </View>
                    )}
                    <Text style={styles.caseDate}>
                      {new Date(c.createdAt).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                    </Text>
                  </View>
                  <Text style={styles.caseCategory}>
                    {c.category ?? "categoria sconosciuta"}
                  </Text>
                  {c.aiSummary && (
                    <Text style={styles.caseSummary} numberOfLines={3}>{c.aiSummary}</Text>
                  )}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  center: { padding: 24, alignItems: "center" },
  headerCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: Colors.surface, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  headerText: { flex: 1, color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 13 },
  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent + "22", borderColor: Colors.accent, borderWidth: 1,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16,
  },
  runBtnDisabled: { opacity: 0.6 },
  runBtnText: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 24, alignItems: "center", marginVertical: 8,
  },
  emptyText: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 8 },
  emptyHint: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statBox: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12, alignItems: "center",
  },
  statValue: { color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 22 },
  statLabel: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  briefCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 14, marginBottom: 16,
  },
  briefHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  briefTitle: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 14 },
  briefMeta: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10 },
  briefBody: { color: Colors.text, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  briefFooter: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 8 },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  },
  caseCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, marginBottom: 8,
  },
  sevDot: { width: 10, height: 10, borderRadius: 5 },
  caseBody: { flex: 1 },
  caseHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  caseSeverity: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 11 },
  caseDate: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 11, marginLeft: "auto" },
  caseCategory: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
  caseSummary: { color: Colors.text, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4, lineHeight: 16 },
  assignedBadge: {
    backgroundColor: Colors.accent + "33", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  assignedText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 9 },
  markReadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  markReadBtnDisabled: { opacity: 0.7 },
  markReadText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  markReadTextDone: { color: Colors.textSecondary },
  copiedHint: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.success, marginBottom: 6 },
});
