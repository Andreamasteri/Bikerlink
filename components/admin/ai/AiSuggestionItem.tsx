/**
 * Task #2532 — Singolo suggerimento AI (draft ban/dismiss) con bottoni
 * Applica / Rifiuta. NON esegue nulla finché l'admin non clicca.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

export interface AiDraft {
  kind: "draft_ban" | "draft_dismiss";
  userId?: string;
  reportId?: string;
  durationDays?: number;
  reason: string;
  notice?: string;
  suggestionLogId?: string;
}

export default function AiSuggestionItem({ draft, onApplied }: { draft: AiDraft; onApplied?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [rejected, setRejected] = useState(false);

  function confirmApply() {
    const isBanDraft = draft.kind === "draft_ban";
    const msg = isBanDraft
      ? `Stai per ${draft.durationDays === 0 ? "bannare PERMANENTEMENTE" : `sospendere ${draft.durationDays}g`} l'utente ${draft.userId?.slice(0, 12)}…\n\nMotivo: ${draft.reason}\n\nL'azione è registrata nei log. Procedere?`
      : `Stai per archiviare (dismiss) il report ${draft.reportId?.slice(0, 12)}…\n\nMotivo: ${draft.reason}\n\nProcedere?`;
    Alert.alert(
      isBanDraft ? "Conferma ban" : "Conferma dismiss",
      msg,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Applica", style: "destructive", onPress: () => { void apply(); } },
      ],
    );
  }

  async function apply() {
    setBusy(true);
    try {
      if (draft.kind === "draft_ban" && draft.userId) {
        await apiRequest("POST", "/api/admin/ai/apply/ban", {
          userId: draft.userId,
          durationDays: draft.durationDays ?? 0,
          reason: draft.reason,
          suggestionLogId: draft.suggestionLogId,
        });
      } else if (draft.kind === "draft_dismiss" && draft.reportId) {
        await apiRequest("POST", "/api/admin/ai/apply/dismiss", {
          reportId: draft.reportId,
          reason: draft.reason,
          suggestionLogId: draft.suggestionLogId,
        });
      }
      setApplied(true);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      onApplied?.();
    } catch (err) {
      Alert.alert("Errore", err instanceof Error ? err.message : "Operazione fallita");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!draft.suggestionLogId) { setRejected(true); return; }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/ai/reject", {
        suggestionLogId: draft.suggestionLogId,
        reason: "rejected_by_admin",
      });
      setRejected(true);
    } catch (err) {
      Alert.alert("Errore", err instanceof Error ? err.message : "Reject fallito");
    } finally {
      setBusy(false);
    }
  }

  const isBan = draft.kind === "draft_ban";
  const title = isBan
    ? `🚫 Ban ${draft.durationDays === 0 ? "permanente" : `${draft.durationDays}g`}`
    : "📦 Archivia report (dismiss)";
  const target = isBan ? `Utente: ${draft.userId?.slice(0, 12)}…` : `Report: ${draft.reportId?.slice(0, 12)}…`;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={isBan ? "account-cancel-outline" : "archive-outline"} size={18} color={isBan ? Colors.error : Colors.warning} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.target}>{target}</Text>
      <Text style={styles.reason}>{draft.reason}</Text>
      {draft.notice ? <Text style={styles.notice}>{draft.notice}</Text> : null}
      {applied ? (
        <Text style={[styles.statusText, { color: Colors.success }]}>✓ Applicato</Text>
      ) : rejected ? (
        <Text style={[styles.statusText, { color: Colors.textSecondary }]}>Rifiutato</Text>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { void reject(); }} disabled={busy}>
            <Text style={styles.btnGhostText}>Rifiuta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={confirmApply} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>Applica</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10, padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  title: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  target: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium" },
  reason: { color: Colors.text, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 18 },
  notice: { color: Colors.warning, fontSize: 11, marginTop: 6, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnGhost: { borderWidth: 1, borderColor: Colors.border },
  btnGhostText: { color: Colors.textSecondary, fontFamily: "Inter_600SemiBold" },
  btnPrimary: { backgroundColor: Colors.accent },
  btnPrimaryText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  statusText: { marginTop: 8, fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
