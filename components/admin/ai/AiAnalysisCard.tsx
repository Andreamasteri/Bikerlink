/**
 * Task #2532 — Card analisi AI del report. Mostra severity suggerita,
 * categoria, prob. spam/retaliatorio, summary, suggestedAction. Pulsante
 * "Apri Co-Pilot" per drawer dettagli, "Rianalizza" forza triage.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

export interface AiAnalysis {
  severitySuggested: "low" | "medium" | "high" | "critical";
  categorySuggested: string;
  isSpamProbability: number;
  isRetaliatoryProbability: number;
  similarReports?: Array<{ id: string; similarity: number; reason: string }>;
  summary: string;
  suggestedAction: "none" | "warn" | "shadow_ban" | "ban_temp" | "ban_perm" | "dismiss";
  suggestedBanDays?: number;
  reasoning: string;
  confidence: number;
  _meta?: { provider: string; model: string; generatedAt: string };
}

const SEV_COLOR: Record<string, string> = {
  critical: "#FF3B30", high: "#FF9500", medium: "#FFCC00", low: "#8E8E93",
};
const ACTION_LABEL: Record<string, string> = {
  none: "Nessuna azione", warn: "Avvisare", shadow_ban: "Shadow ban",
  ban_temp: "Ban temporaneo", ban_perm: "Ban permanente", dismiss: "Archiviare (dismiss)",
};

export default function AiAnalysisCard({
  reportId, analysis, analyzedAt: _analyzedAt, originalCategory, onOpenCopilot, onNavigateToReport,
}: {
  reportId: string;
  analysis: AiAnalysis | null | undefined;
  analyzedAt?: string | null;
  originalCategory?: string | null;
  onOpenCopilot: () => void;
  onNavigateToReport?: (reportId: string) => void;
}) {
  const [reanalyzing, setReanalyzing] = useState(false);

  async function reanalyze() {
    setReanalyzing(true);
    try {
      await apiRequest("POST", `/api/admin/ai/triage/${reportId}?force=1`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
    } catch (err) {
      Alert.alert("Errore AI", err instanceof Error ? err.message : "Triage non disponibile");
    } finally {
      setReanalyzing(false);
    }
  }

  if (!analysis) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="robot-outline" size={18} color={Colors.accent} />
          <Text style={styles.title}>Co-Pilot AI</Text>
        </View>
        <Text style={styles.empty}>Analisi non ancora disponibile.</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnPrimary} onPress={reanalyze} disabled={reanalyzing}>
            {reanalyzing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>Analizza ora</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={onOpenCopilot}>
            <Text style={styles.btnGhostText}>Apri Co-Pilot</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const sevColor = SEV_COLOR[analysis.severitySuggested] ?? Colors.textSecondary;
  const spamPct = Math.round(analysis.isSpamProbability * 100);
  const retalPct = Math.round(analysis.isRetaliatoryProbability * 100);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="robot-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Co-Pilot AI</Text>
        <View style={[styles.sevPill, { backgroundColor: sevColor }]}>
          <Text style={styles.sevPillText}>{analysis.severitySuggested.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.summary}>{analysis.summary}</Text>

      <View style={styles.row}>
        <Stat label="Cat. AI" value={analysis.categorySuggested} />
        <Stat label="Spam" value={`${spamPct}%`} accent={spamPct > 60} />
        <Stat label="Retalia." value={`${retalPct}%`} accent={retalPct > 60} />
        <Stat label="Conf." value={`${Math.round(analysis.confidence * 100)}%`} />
      </View>

      {originalCategory && originalCategory !== analysis.categorySuggested ? (
        <View style={styles.catCompareBox}>
          <MaterialCommunityIcons name="swap-horizontal" size={14} color={Colors.warning} />
          <Text style={styles.catCompareText}>
            Utente ha scelto <Text style={styles.catCompareBold}>{originalCategory}</Text>, AI suggerisce{" "}
            <Text style={styles.catCompareBold}>{analysis.categorySuggested}</Text>
          </Text>
        </View>
      ) : null}

      {analysis.similarReports && analysis.similarReports.length > 0 ? (
        <View style={styles.similarBox}>
          <Text style={styles.similarTitle}>Report correlati ({analysis.similarReports.length})</Text>
          {analysis.similarReports.slice(0, 5).map((sim) => (
            <TouchableOpacity
              key={sim.id}
              style={styles.similarRow}
              onPress={() => onNavigateToReport?.(sim.id)}
              disabled={!onNavigateToReport}
            >
              <Text style={styles.similarId}>#{sim.id.slice(0, 8)}</Text>
              <Text style={styles.similarReason} numberOfLines={1}>{sim.reason}</Text>
              <Text style={styles.similarPct}>{Math.round(sim.similarity * 100)}%</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.actionBox}>
        <MaterialCommunityIcons name="lightbulb-on-outline" size={14} color={Colors.warning} />
        <Text style={styles.actionText}>
          Azione suggerita: <Text style={styles.actionBold}>{ACTION_LABEL[analysis.suggestedAction] ?? analysis.suggestedAction}</Text>
          {analysis.suggestedAction === "ban_temp" && analysis.suggestedBanDays ? ` (${analysis.suggestedBanDays}g)` : ""}
        </Text>
      </View>

      <Text style={styles.reasoning} numberOfLines={4}>{analysis.reasoning}</Text>

      {analysis._meta ? (
        <Text style={styles.meta}>via {analysis._meta.provider}/{analysis._meta.model}</Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.btnGhost} onPress={reanalyze} disabled={reanalyzing}>
          {reanalyzing ? <ActivityIndicator size="small" color={Colors.text} /> : <Text style={styles.btnGhostText}>Rianalizza</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={onOpenCopilot}>
          <MaterialCommunityIcons name="chat-processing-outline" size={14} color="#fff" />
          <Text style={styles.btnPrimaryText}>Apri Co-Pilot</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: Colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "40", marginBottom: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  title: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 14, flex: 1 },
  sevPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  sevPillText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  summary: { color: Colors.text, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  stat: { flex: 1, alignItems: "center", padding: 6, backgroundColor: Colors.surfaceLight, borderRadius: 8 },
  statValue: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 13 },
  statLabel: { color: Colors.textSecondary, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBox: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: Colors.surfaceLight, borderRadius: 8, marginBottom: 8 },
  actionText: { color: Colors.text, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  actionBold: { fontFamily: "Inter_600SemiBold", color: Colors.warning },
  reasoning: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 8 },
  meta: { color: Colors.textSecondary, fontSize: 10, fontStyle: "italic", marginBottom: 8 },
  empty: { color: Colors.textSecondary, fontSize: 13, fontStyle: "italic", marginBottom: 12 },
  catCompareBox: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: Colors.surfaceLight, borderRadius: 8, marginBottom: 8 },
  catCompareText: { color: Colors.text, fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  catCompareBold: { fontFamily: "Inter_600SemiBold", color: Colors.warning },
  similarBox: { backgroundColor: Colors.surfaceLight, borderRadius: 8, padding: 8, marginBottom: 8 },
  similarTitle: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  similarRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  similarId: { color: Colors.accent, fontSize: 11, fontFamily: "Inter_600SemiBold", width: 60 },
  similarReason: { color: Colors.text, fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  similarPct: { color: Colors.textSecondary, fontSize: 10, fontFamily: "Inter_500Medium", width: 36, textAlign: "right" },
  actions: { flexDirection: "row", gap: 8 },
  btnPrimary: { flex: 1, backgroundColor: Colors.accent, paddingVertical: 10, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  btnPrimaryText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  btnGhost: { flex: 1, borderWidth: 1, borderColor: Colors.border, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnGhostText: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
