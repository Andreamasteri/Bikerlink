/**
 * Task #2531 — UI per editare le soglie di moderazione (per ruolo, per
 * azione). Preset "Tolleranza Bassa/Media/Alta" per applicarne più di
 * una in un colpo solo.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Threshold {
  id: string;
  targetRole: "biker" | "zavorrina";
  action: "notify" | "shadow_ban";
  threshold: number;
  updatedAt: string;
}

interface Preset { name: string; values: Array<{ targetRole: "biker" | "zavorrina"; action: "notify" | "shadow_ban"; threshold: number }> }
const PRESETS: Preset[] = [
  { name: "Tolleranza Alta",
    values: [
      { targetRole: "zavorrina", action: "notify", threshold: 3 },
      { targetRole: "zavorrina", action: "shadow_ban", threshold: 6 },
      { targetRole: "biker", action: "notify", threshold: 6 },
      { targetRole: "biker", action: "shadow_ban", threshold: 12 },
    ] },
  { name: "Tolleranza Media",
    values: [
      { targetRole: "zavorrina", action: "notify", threshold: 2 },
      { targetRole: "zavorrina", action: "shadow_ban", threshold: 4 },
      { targetRole: "biker", action: "notify", threshold: 4 },
      { targetRole: "biker", action: "shadow_ban", threshold: 8 },
    ] },
  { name: "Tolleranza Bassa",
    values: [
      { targetRole: "zavorrina", action: "notify", threshold: 1 },
      { targetRole: "zavorrina", action: "shadow_ban", threshold: 2 },
      { targetRole: "biker", action: "notify", threshold: 2 },
      { targetRole: "biker", action: "shadow_ban", threshold: 4 },
    ] },
];

export default function ReportsThresholdsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery<{ thresholds: Threshold[] }>({
    queryKey: ["/api/admin/moderation-thresholds"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/moderation-thresholds");
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: { targetRole: string; action: string; threshold: number }) => {
      const res = await apiRequest("PUT", "/api/admin/moderation-thresholds", input);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation-thresholds"] }),
    onError: (e: unknown) => Alert.alert("Errore", e instanceof Error ? e.message : "Errore salvataggio"),
  });

  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const rows = data?.thresholds ?? [];

  function keyOf(role: string, action: string) { return `${role}|${action}`; }

  function applyPreset(p: Preset) {
    Alert.alert(
      "Applica preset",
      `Vuoi applicare "${p.name}"? Sovrascrive tutte le soglie correnti.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Applica",
          onPress: async () => {
            for (const v of p.values) {
              await mutation.mutateAsync(v);
            }
          },
        },
      ]
    );
  }

  function saveOne(role: "biker" | "zavorrina", action: "notify" | "shadow_ban") {
    const v = parseInt(edits[keyOf(role, action)] ?? "", 10);
    if (!Number.isFinite(v) || v < 1 || v > 100) {
      Alert.alert("Errore", "Soglia 1..100");
      return;
    }
    mutation.mutate({ targetRole: role, action, threshold: v });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
      <Text style={styles.intro}>
        Numero di segnalazioni necessario per scatenare l&apos;azione automatica. Soglie più basse =
        moderazione più aggressiva (e più falsi positivi).
      </Text>

      <Text style={styles.sectionTitle}>Preset</Text>
      <View style={styles.presetRow}>
        {PRESETS.map((p) => (
          <TouchableOpacity key={p.name} style={styles.presetBtn} onPress={() => applyPreset(p)}>
            <Text style={styles.presetText}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Soglie correnti</Text>
      {isLoading && !data ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />
      ) : (
        (["zavorrina", "biker"] as const).map((role) => (
          <View key={role} style={styles.roleBlock}>
            <Text style={styles.roleTitle}>{role === "zavorrina" ? "Zavorrine (più protette)" : "Biker"}</Text>
            {(["notify", "shadow_ban"] as const).map((action) => {
              const current = rows.find((r) => r.targetRole === role && r.action === action);
              const k = keyOf(role, action);
              const editValue = edits[k] ?? (current ? String(current.threshold) : "");
              return (
                <View key={k} style={styles.thresholdRow}>
                  <Text style={styles.thresholdLabel}>{action === "notify" ? "Notifica moderatore" : "Shadow-ban"}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={editValue}
                    onChangeText={(t) => setEdits((prev) => ({ ...prev, [k]: t }))}
                    placeholder="—"
                    placeholderTextColor={Colors.textSecondary}
                  />
                  <TouchableOpacity style={styles.saveBtn} onPress={() => saveOne(role, action)} disabled={mutation.isPending}>
                    <Text style={styles.saveBtnText}>Salva</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))
      )}

      <Text style={styles.footer}>
        Le modifiche sono tracciate nei log moderatori (per la cronologia delle policy).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  intro: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 18 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 10,
  },
  presetRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent + "55",
  },
  presetText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.accent },
  roleBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text, marginBottom: 10 },
  thresholdRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  thresholdLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  input: {
    width: 70,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    textAlign: "center",
  },
  saveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.accent + "22",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent },
  footer: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center", marginTop: 20 },
});
