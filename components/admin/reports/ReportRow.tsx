/**
 * Task #2531 — Riga compatta riusata dalle viste report (per categoria,
 * per ruolo, futuro: dettaglio). Mostra severity, categoria, claim badge,
 * azioni inline (claim / resolve / dismiss).
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedUserRole?: string | null;
  reason: string;
  description: string | null;
  status: string;
  category?: string | null;
  context?: string | null;
  severity?: string | null;
  affectedFeedbackLoop?: boolean;
  reporterTrustScore?: number;
  assignedModeratorId?: string | null;
  assignedAt?: string | null;
  createdAt: string;
  _reporterMasked?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#FF3B30",
  high: "#FF9500",
  medium: "#FFCC00",
  low: "#8E8E93",
};

export function ReportRow({ report }: { report: Report }) {
  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/reports/${report.id}/claim`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/hub-summary"] });
    },
    onError: (e: unknown) => Alert.alert("Claim fallito", e instanceof Error ? e.message : "Già assegnato"),
  });

  const resolveMutation = useMutation({
    mutationFn: async (status: "resolved" | "dismissed") => {
      const res = await apiRequest("PUT", `/api/admin/reports/${report.id}/resolve`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/hub-summary"] });
    },
  });

  const sevColor = report.severity ? SEVERITY_COLORS[report.severity] ?? Colors.textSecondary : Colors.textSecondary;

  function handleResolve() {
    Alert.alert("Gestisci segnalazione", report.category ?? report.reason, [
      { text: "Risolvi", onPress: () => resolveMutation.mutate("resolved") },
      { text: "Archivia", onPress: () => resolveMutation.mutate("dismissed") },
      { text: "Annulla", style: "cancel" },
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <View style={styles.row}>
          {report.severity && (
            <View style={[styles.sevBadge, { backgroundColor: sevColor + "22", borderColor: sevColor }]}>
              <Text style={[styles.sevText, { color: sevColor }]}>{report.severity}</Text>
            </View>
          )}
          <Text style={styles.reason} numberOfLines={1}>{report.category ?? report.reason}</Text>
          {report.assignedModeratorId && (
            <View style={styles.claimBadge}>
              <MaterialCommunityIcons name="account-check" size={12} color={Colors.success} />
              <Text style={styles.claimText}>in carico</Text>
            </View>
          )}
        </View>
        {report.description && <Text style={styles.description} numberOfLines={2}>{report.description}</Text>}
        <Text style={styles.meta}>
          Da: {report._reporterMasked ? report.reporterId : report.reporterId.slice(0, 8) + "…"}
          {report.reporterTrustScore != null ? ` (trust ${report.reporterTrustScore.toFixed(2)})` : ""}
          {"  ·  "}Vs: {report.reportedUserId.slice(0, 8)}…
          {report.reportedUserRole ? ` (${report.reportedUserRole})` : ""}
        </Text>
        <Text style={styles.date}>{new Date(report.createdAt).toLocaleString("it-IT")}</Text>
      </View>
      <View style={styles.actions}>
        {!report.assignedModeratorId && report.status === "pending" && (
          <TouchableOpacity onPress={() => claimMutation.mutate()} style={styles.iconBtn} testID={`claim-${report.id}`}>
            <MaterialCommunityIcons name="hand-back-right-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
        )}
        {report.status === "pending" && (
          <TouchableOpacity onPress={handleResolve} style={styles.iconBtn} testID={`resolve-${report.id}`}>
            <MaterialIcons name="gavel" size={22} color={Colors.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  reason: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, flexShrink: 1 },
  sevBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  sevText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  claimBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.success + "22",
    borderWidth: 1,
    borderColor: Colors.success + "55",
  },
  claimText: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.success },
  description: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  date: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: "column", gap: 6 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
