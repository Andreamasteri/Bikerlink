import React, { useState } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFnWithTimeout, apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface AiUsageEntry {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  total: number;
  lastAt: string;
  lastTrigger?: string;
}

interface AuditResponse {
  date: string;
  audit: { subsystems: Record<string, AiUsageEntry> } | null;
  stale: boolean;
  lastError: { message: string; at: string } | null;
}

interface ProposerSettingsResponse {
  model: string;
  defaultModel: string;
}

const SUBSYSTEM_LABELS: Record<string, string> = {
  proposer: "Proposer",
  digest: "Digest moderatori",
  "weekly-report": "Report settimanale",
  "campaigns-self-check": "Self-check campagne",
  "backfill-bio": "Backfill bio",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AiTokenAuditCard() {
  const qc = useQueryClient();
  const [modelEdit, setModelEdit] = useState(false);
  const [modelInput, setModelInput] = useState("");

  const auditQ = useQuery<AuditResponse>({
    queryKey: ["/api/admin/ai/token-audit"],
    queryFn: getQueryFnWithTimeout<AuditResponse>(10_000),
    refetchInterval: 60_000,
  });

  const proposerQ = useQuery<ProposerSettingsResponse>({
    queryKey: ["/api/admin/watchdog/proposer/settings"],
    queryFn: getQueryFnWithTimeout<ProposerSettingsResponse>(8_000),
    staleTime: 30_000,
  });

  const saveModel = useMutation({
    mutationFn: async (model: string) => {
      await apiRequest("POST", "/api/admin/watchdog/proposer/settings", { model });
    },
    onSuccess: () => {
      setModelEdit(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/proposer/settings"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const dismissError = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/admin/ai/token-audit/error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/token-audit"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const subsystems = auditQ.data?.audit?.subsystems ?? {};
  const entries = Object.entries(subsystems).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = entries.reduce((s, [, v]) => s + v.total, 0);
  const grandCalls = entries.reduce((s, [, v]) => s + v.calls, 0);

  const lastError = auditQ.data?.lastError ?? null;
  const stale = auditQ.data?.stale ?? false;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Consumo AI oggi</Text>
        {auditQ.isFetching && <ActivityIndicator size="small" color={Colors.accent} />}
      </View>
      <Text style={styles.muted}>
        Data: {auditQ.data?.date ?? "—"} · Token totali: {fmt(grandTotal)} · Chiamate: {grandCalls}
      </Text>

      {/* Errore aggiornamento contatore */}
      {lastError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorIcon}>⚠</Text>
          <View style={styles.errorBody}>
            <Text style={styles.errorTitle}>Errore aggiornamento contatore</Text>
            <Text style={styles.errorMsg} numberOfLines={3}>{lastError.message}</Text>
            <Text style={styles.errorAt}>Rilevato il {fmtDateTime(lastError.at)}</Text>
          </View>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => dismissError.mutate()}
            disabled={dismissError.isPending}
          >
            <Text style={styles.dismissBtnText}>
              {dismissError.isPending ? "…" : "Ignora"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dati fermi (stale) senza errore esplicito */}
      {stale && !lastError && (
        <View style={styles.staleBanner}>
          <Text style={styles.staleIcon}>⏱</Text>
          <Text style={styles.staleText}>
            Il contatore non si aggiorna da più di 6 ore — verifica i log del server.
          </Text>
        </View>
      )}

      {auditQ.isLoading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 12 }} />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>Nessuna chiamata AI registrata oggi.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.cellWide, styles.headerText]}>Subsistema</Text>
            <Text style={[styles.cell, styles.headerText]}>Chiamate</Text>
            <Text style={[styles.cell, styles.headerText]}>Token tot.</Text>
            <Text style={[styles.cell, styles.headerText]}>Ultima</Text>
          </View>
          {entries.map(([name, v]) => (
            <View key={name} style={styles.tableRow}>
              <Text style={[styles.cell, styles.cellWide, styles.cellText]}>
                {SUBSYSTEM_LABELS[name] ?? name}
              </Text>
              <Text style={[styles.cell, styles.cellText]}>{v.calls}</Text>
              <Text style={[styles.cell, styles.cellText]}>{fmt(v.total)}</Text>
              <Text style={[styles.cell, styles.cellMuted]}>{fmtTime(v.lastAt)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Modello Proposer</Text>
      {proposerQ.isLoading ? (
        <ActivityIndicator size="small" color={Colors.accent} style={{ marginTop: 6 }} />
      ) : modelEdit ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.input}
            value={modelInput}
            onChangeText={setModelInput}
            placeholder="es. llama-3.1-8b-instant"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => saveModel.mutate(modelInput.trim())}
            disabled={saveModel.isPending || !modelInput.trim()}
          >
            <Text style={styles.saveBtnText}>{saveModel.isPending ? "..." : "Salva"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setModelEdit(false)}>
            <Text style={styles.cancelBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.modelRow}>
          <Text style={styles.modelText}>{proposerQ.data?.model ?? "—"}</Text>
          <Text style={styles.modelDefault}>(default: {proposerQ.data?.defaultModel ?? "llama-3.1-8b-instant"})</Text>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => { setModelInput(proposerQ.data?.model ?? ""); setModelEdit(true); }}
          >
            <Text style={styles.editBtnText}>Modifica</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { color: "#f3f4f6", fontSize: 15, fontWeight: "700" as const },
  muted: { color: "#9ca3af", fontSize: 11, marginBottom: 10 },
  empty: { color: "#6b7280", fontSize: 12, fontStyle: "italic" as const, paddingVertical: 8 },
  table: { borderRadius: 8, overflow: "hidden" as const },
  tableHeader: { flexDirection: "row", backgroundColor: "#1f2937", paddingVertical: 6, paddingHorizontal: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#1f2937" },
  cell: { flex: 1, textAlign: "center" as const },
  cellWide: { flex: 2.5, textAlign: "left" as const },
  headerText: { color: "#9ca3af", fontSize: 11, fontWeight: "600" as const },
  cellText: { color: "#e5e7eb", fontSize: 12 },
  cellMuted: { color: "#6b7280", fontSize: 11, textAlign: "center" as const },
  divider: { height: 1, backgroundColor: "#1f2937", marginVertical: 12 },
  sectionLabel: { color: "#9ca3af", fontSize: 11, fontWeight: "600" as const, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  modelRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" as const },
  modelText: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" as const },
  modelDefault: { color: "#6b7280", fontSize: 11 },
  editBtn: { marginLeft: "auto", backgroundColor: "#1f2937", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  editBtnText: { color: "#60a5fa", fontSize: 12 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    flex: 1, backgroundColor: "#1f2937", color: "#f3f4f6",
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 12, borderWidth: 1, borderColor: "#374151",
  },
  saveBtn: { backgroundColor: "#3b82f6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  saveBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" as const },
  cancelBtn: { backgroundColor: "#1f2937", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  cancelBtnText: { color: "#9ca3af", fontSize: 12 },
  // Error banner (rosso)
  errorBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#2d1515", borderWidth: 1, borderColor: "#7f1d1d",
    borderRadius: 8, padding: 10, marginBottom: 10,
  },
  errorIcon: { color: "#f87171", fontSize: 16, lineHeight: 20 },
  errorBody: { flex: 1 },
  errorTitle: { color: "#fca5a5", fontSize: 12, fontWeight: "700" as const, marginBottom: 2 },
  errorMsg: { color: "#f87171", fontSize: 11, fontFamily: "monospace" as const },
  errorAt: { color: "#9ca3af", fontSize: 10, marginTop: 3 },
  dismissBtn: {
    backgroundColor: "#3f1212", borderWidth: 1, borderColor: "#7f1d1d",
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start",
  },
  dismissBtnText: { color: "#fca5a5", fontSize: 11, fontWeight: "600" as const },
  // Stale banner (giallo)
  staleBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#2d2305", borderWidth: 1, borderColor: "#713f12",
    borderRadius: 8, padding: 10, marginBottom: 10,
  },
  staleIcon: { color: "#fbbf24", fontSize: 15 },
  staleText: { color: "#fde68a", fontSize: 11, flex: 1 },
});
