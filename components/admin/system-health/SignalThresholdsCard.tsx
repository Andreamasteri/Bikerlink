import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest, getQueryFnWithTimeout } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface SignalConfig {
  warnCount: number;
  warnUsers: number;
  highCount: number;
  highUsers: number;
  label: string;
}

interface ThresholdsResp {
  defaults: Record<string, SignalConfig>;
  overrides: Record<string, Partial<SignalConfig>>;
  effective: Record<string, SignalConfig>;
}

const SIGNAL_KEYS = [
  "js_thread_freeze",
  "gps_flood",
  "memory_pressure",
  "native_module_missing",
] as const;

type SignalKey = typeof SIGNAL_KEYS[number];

const FIELD_LABELS: Record<string, string> = {
  warnCount: "Warn count",
  warnUsers: "Warn utenti",
  highCount: "High count",
  highUsers: "High utenti",
};

const FIELDS = ["warnCount", "warnUsers", "highCount", "highUsers"] as const;
type Field = typeof FIELDS[number];

function parsePositiveInt(v: string): number | null {
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 1 ? n : null;
}

interface EditState {
  signal: SignalKey;
  field: Field;
  value: string;
}

export function SignalThresholdsCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EditState | null>(null);

  const q = useQuery<ThresholdsResp>({
    queryKey: ["/api/admin/watchdog/signal-thresholds"],
    queryFn: getQueryFnWithTimeout<ThresholdsResp>(8_000),
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ signal, field, value }: { signal: SignalKey; field: Field; value: number }) => {
      await apiRequest("PUT", "/api/admin/watchdog/signal-thresholds", {
        signal,
        [field]: value,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/signal-thresholds"] });
      setEditing(null);
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const resetMutation = useMutation({
    mutationFn: async (signal: SignalKey) => {
      await apiRequest("DELETE", `/api/admin/watchdog/signal-thresholds/${signal}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/signal-thresholds"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const handleSave = () => {
    if (!editing) return;
    const n = parsePositiveInt(editing.value);
    if (n === null) {
      Alert.alert("Valore non valido", "Inserisci un numero intero ≥ 1");
      return;
    }
    saveMutation.mutate({ signal: editing.signal, field: editing.field, value: n });
  };

  const handleReset = (signal: SignalKey) => {
    Alert.alert(
      "Ripristina default",
      `Vuoi ripristinare le soglie di default per "${q.data?.effective[signal]?.label ?? signal}"?`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Ripristina", style: "destructive", onPress: () => resetMutation.mutate(signal) },
      ]
    );
  };

  if (q.isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (q.isError || !q.data) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>Impossibile caricare le soglie. Riprova.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => q.refetch()}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { defaults, overrides, effective } = q.data;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="tune-variant" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Soglie segnali diagnostici</Text>
      </View>
      <Text style={styles.subtitle}>
        Finestra di analisi: 2 ore. Le soglie sovrascrivono i valori di default del collector.
      </Text>

      {SIGNAL_KEYS.map((signal) => {
        const cfg = effective[signal];
        const def = defaults[signal];
        const hasOverride = !!overrides[signal] && Object.keys(overrides[signal]).length > 0;
        if (!cfg || !def) return null;

        return (
          <View key={signal} style={styles.signalBlock}>
            <View style={styles.signalHeader}>
              <View style={styles.signalTitleRow}>
                <Text style={styles.signalLabel}>{cfg.label}</Text>
                {hasOverride && (
                  <View style={styles.overrideBadge}>
                    <Text style={styles.overrideBadgeText}>modificata</Text>
                  </View>
                )}
              </View>
              {hasOverride && (
                <TouchableOpacity
                  onPress={() => handleReset(signal)}
                  disabled={resetMutation.isPending}
                  style={styles.resetBtn}
                >
                  <MaterialCommunityIcons name="restore" size={14} color="#9ca3af" />
                  <Text style={styles.resetBtnText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.fieldsGrid}>
              {FIELDS.map((field) => {
                const isEditing = editing?.signal === signal && editing?.field === field;
                const currentVal = cfg[field];
                const defaultVal = def[field];
                const isModified = overrides[signal]?.[field] !== undefined;

                return (
                  <View key={field} style={styles.fieldCell}>
                    <Text style={styles.fieldLabel}>{FIELD_LABELS[field]}</Text>
                    {isEditing ? (
                      <View style={styles.editRow}>
                        <TextInput
                          style={styles.input}
                          value={editing.value}
                          onChangeText={(v) => setEditing({ ...editing, value: v })}
                          keyboardType="number-pad"
                          autoFocus
                          selectTextOnFocus
                        />
                        <TouchableOpacity
                          style={styles.saveBtn}
                          onPress={handleSave}
                          disabled={saveMutation.isPending}
                        >
                          {saveMutation.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <MaterialCommunityIcons name="check" size={14} color="#fff" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelBtn}
                          onPress={() => setEditing(null)}
                        >
                          <MaterialCommunityIcons name="close" size={14} color="#9ca3af" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.valueBtn, isModified && styles.valueBtnModified]}
                        onPress={() => setEditing({ signal, field, value: String(currentVal) })}
                      >
                        <Text style={[styles.valueText, isModified && styles.valueTextModified]}>
                          {currentVal}
                        </Text>
                        {isModified && (
                          <Text style={styles.defaultHint}>(def: {defaultVal})</Text>
                        )}
                        <MaterialCommunityIcons name="pencil" size={11} color="#6b7280" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { color: "#f3f4f6", fontSize: 15, fontWeight: "700" as const },
  subtitle: { color: "#6b7280", fontSize: 11, marginBottom: 12, lineHeight: 16 },
  errorText: { color: "#ef4444", fontSize: 13, marginBottom: 8 },
  retryBtn: { backgroundColor: "#1f2937", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignSelf: "flex-start" },
  retryBtnText: { color: "#9ca3af", fontSize: 12 },

  signalBlock: { borderTopWidth: 1, borderTopColor: "#1f2937", paddingTop: 10, marginTop: 4, marginBottom: 8 },
  signalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  signalTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  signalLabel: { color: "#d1d5db", fontSize: 13, fontWeight: "600" as const },
  overrideBadge: { backgroundColor: "#1d4ed8", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  overrideBadgeText: { color: "#93c5fd", fontSize: 10, fontWeight: "600" as const },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#1f2937", borderRadius: 6 },
  resetBtnText: { color: "#9ca3af", fontSize: 11 },

  fieldsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fieldCell: { flex: 1, minWidth: "45%", backgroundColor: "#1f2937", borderRadius: 8, padding: 8 },
  fieldLabel: { color: "#6b7280", fontSize: 10, marginBottom: 4 },

  valueBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  valueBtnModified: {},
  valueText: { color: "#f3f4f6", fontSize: 16, fontWeight: "700" as const, flex: 1 },
  valueTextModified: { color: "#60a5fa" },
  defaultHint: { color: "#4b5563", fontSize: 10 },

  editRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  input: {
    flex: 1, backgroundColor: "#374151", color: "#f3f4f6",
    fontSize: 15, fontWeight: "700" as const,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.accent,
  },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 6, padding: 6, alignItems: "center", justifyContent: "center" },
  cancelBtn: { backgroundColor: "#374151", borderRadius: 6, padding: 6, alignItems: "center", justifyContent: "center" },
});
