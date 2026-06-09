/**
 * Task #2532 — Settings Co-Pilot AI Moderazione.
 * Provider preferito (auto/groq/openai/google), sigma anomalie, limite budget mensile.
 */
import React, { useState, useEffect } from "react";
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

const PROVIDERS = ["auto", "openai", "google", "groq"] as const;

interface SettingsResp {
  preferredProvider: typeof PROVIDERS[number];
  anomalySigma: number;
  budget: { month: string; totalCostUsd: number; limitUsd: number; pct: number };
}

export default function AiModerationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { data } = useQuery<SettingsResp>({
    queryKey: ["/api/admin/ai/settings"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/settings")).json(),
  });

  const [provider, setProvider] = useState<typeof PROVIDERS[number]>("auto");
  const [sigma, setSigma] = useState("3");
  const [limit, setLimit] = useState("");

  useEffect(() => {
    if (data) {
      setProvider(data.preferredProvider);
      setSigma(String(data.anomalySigma));
      setLimit(String(data.budget.limitUsd));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await apiRequest("PATCH", "/api/admin/ai/settings", payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/hub-card"] });
      Alert.alert("Salvato", "Impostazioni aggiornate.");
    },
    onError: (err) => Alert.alert("Errore", err instanceof Error ? err.message : "Salvataggio fallito"),
  });

  const runDigest = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/ai/digest/run")).json(),
    onSuccess: (r) => Alert.alert("Digest", `Generato per ${r.moderators ?? 0} moderatori`),
    onError: (err) => Alert.alert("Errore", err instanceof Error ? err.message : "Digest fallito"),
  });

  const runAnomalies = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/ai/anomaly/scan")).json(),
    onSuccess: (r) => Alert.alert("Scan", `${r.created ?? 0} nuove anomalie su ${r.scannedCategories ?? 0} categorie`),
    onError: (err) => Alert.alert("Errore", err instanceof Error ? err.message : "Scan fallito"),
  });

  function commit() {
    const sigmaNum = parseFloat(sigma);
    const limitNum = parseFloat(limit);
    if (!Number.isFinite(sigmaNum) || sigmaNum < 1 || sigmaNum > 6) return Alert.alert("Errore", "Sigma deve essere tra 1 e 6");
    if (!Number.isFinite(limitNum) || limitNum < 0) return Alert.alert("Errore", "Limite USD non valido");
    save.mutate({ preferredProvider: provider, anomalySigma: sigmaNum, budgetLimitUsd: limitNum });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Provider preferito</Text>
        <View style={styles.row}>
          {PROVIDERS.map((p) => (
            <TouchableOpacity key={p} style={[styles.pill, provider === p && styles.pillActive]} onPress={() => setProvider(p)}>
              <Text style={[styles.pillText, provider === p && styles.pillTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.help}>&quot;auto&quot; segue la chain Groq → OpenAI → Google con circuit-breaker su fallimenti.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sensibilità anomalie (sigma)</Text>
        <TextInput value={sigma} onChangeText={setSigma} keyboardType="numeric" style={styles.input} placeholderTextColor={Colors.textSecondary} />
        <Text style={styles.help}>3σ = default (raro). 2σ = più sensibile, 4σ = meno.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Limite budget mensile ($USD)</Text>
        <TextInput value={limit} onChangeText={setLimit} keyboardType="numeric" style={styles.input} placeholderTextColor={Colors.textSecondary} />
        <Text style={styles.help}>Default 55$ (~50€). A 80% alert push, a 100% chat freeze + triage skip.</Text>
        {data ? (
          <Text style={styles.budgetState}>
            Speso mese: ${data.budget.totalCostUsd.toFixed(2)} ({Math.round(data.budget.pct * 100)}%)
          </Text>
        ) : null}
      </View>

      <TouchableOpacity style={[styles.saveBtn, save.isPending && { opacity: 0.6 }]} onPress={commit} disabled={save.isPending}>
        {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salva impostazioni</Text>}
      </TouchableOpacity>

      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>Manutenzione</Text>
        <TouchableOpacity style={styles.runBtn} onPress={() => runDigest.mutate()} disabled={runDigest.isPending}>
          {runDigest.isPending ? <ActivityIndicator color={Colors.accent} /> : <Text style={styles.runBtnText}>Genera digest ora</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.runBtn} onPress={() => runAnomalies.mutate()} disabled={runAnomalies.isPending}>
          {runAnomalies.isPending ? <ActivityIndicator color={Colors.accent} /> : <Text style={styles.runBtnText}>Scansiona anomalie ora</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { color: Colors.text, fontFamily: "Inter_700Bold", fontSize: 14, marginBottom: 10 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pillText: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 12 },
  pillTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  help: { color: Colors.textSecondary, fontSize: 11, marginTop: 8, fontFamily: "Inter_400Regular" },
  input: { backgroundColor: Colors.surfaceLight, color: Colors.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter_500Medium", fontSize: 14, borderWidth: 1, borderColor: Colors.border },
  budgetState: { color: Colors.textSecondary, fontSize: 12, marginTop: 8, fontFamily: "Inter_500Medium" },
  saveBtn: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  runBtn: { paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: Colors.accent, marginTop: 8 },
  runBtnText: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
