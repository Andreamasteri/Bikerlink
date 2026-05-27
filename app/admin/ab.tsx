import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, TextInput, Modal } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface VariantDef {
  name: string;
  weight: number;
  config?: Record<string, unknown>;
}

interface VariantStats {
  variant: string;
  users: number;
  events: Record<string, number>;
}

interface Experiment {
  id: string;
  key: string;
  description: string | null;
  variants: VariantDef[];
  status: "running" | "paused" | "ended";
  startedAt: string;
  endedAt: string | null;
  stats: VariantStats[];
}

interface ListResponse {
  experiments: Experiment[];
}

interface VariantMetric {
  variant: string;
  users: number;
  events: Record<string, number>;
  acceptRate: number | null;
  chatRate: number | null;
}

interface PairComparison {
  baseline: string;
  challenger: string;
  metric: string;
  baselineRate: number;
  challengerRate: number;
  pValue: number | null;
  significant: boolean;
}

interface DetailResponse {
  experiment: Experiment;
  stats: VariantStats[];
  comparison: { variants: VariantMetric[]; comparisons: PairComparison[] };
}

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function AbExperimentsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const listQ = useQuery<ListResponse>({
    queryKey: ["/api/admin/ab-experiments"],
    refetchInterval: 30_000,
  });

  const detailQ = useQuery<DetailResponse>({
    queryKey: ["/api/admin/ab-experiments", selectedKey],
    enabled: !!selectedKey,
    refetchInterval: 30_000,
  });

  const patchMut = useMutation({
    mutationFn: async ({ key, status }: { key: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/ab-experiments/${key}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ab-experiments"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (key: string) => apiRequest("DELETE", `/api/admin/ab-experiments/${key}`),
    onSuccess: () => {
      setSelectedKey(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ab-experiments"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  function confirmDelete(key: string) {
    Alert.alert("Eliminare esperimento?", `Tutte le assegnazioni di "${key}" verranno rimosse. Gli eventi storici restano.`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMut.mutate(key) },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Esperimenti A/B sull&apos;algoritmo di matching</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <MaterialCommunityIcons name="plus" size={18} color="#fff" />
          <Text style={styles.createBtnText}>Nuovo</Text>
        </TouchableOpacity>
      </View>

      {listQ.isLoading && <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />}
      {listQ.error && <Text style={styles.errorText}>Errore caricamento esperimenti</Text>}

      {listQ.data?.experiments.length === 0 && (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="flask-empty-outline" size={36} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun esperimento. Crea il primo per testare varianti dell&apos;algoritmo.</Text>
        </View>
      )}

      {listQ.data?.experiments.map((exp) => (
        <View key={exp.key} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{exp.key}</Text>
            <StatusBadge status={exp.status} />
          </View>
          {exp.description && <Text style={styles.cardDesc}>{exp.description}</Text>}

          <View style={styles.variantList}>
            {exp.stats.map((s) => {
              const def = exp.variants.find((v) => v.name === s.variant);
              return (
                <View key={s.variant} style={styles.variantRow}>
                  <Text style={styles.variantName}>{s.variant}</Text>
                  <Text style={styles.variantMeta}>
                    peso {def?.weight ?? "?"} · {s.users} utenti
                  </Text>
                  <Text style={styles.variantEvents}>
                    {Object.entries(s.events).map(([k, v]) => `${k}:${v}`).join("  ") || "nessun evento"}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setSelectedKey(exp.key)}>
              <Text style={styles.actionBtnText}>Dettagli & p-value</Text>
            </TouchableOpacity>
            {exp.status === "running" ? (
              <TouchableOpacity style={[styles.actionBtn, styles.actionWarn]} onPress={() => patchMut.mutate({ key: exp.key, status: "paused" })}>
                <Text style={styles.actionBtnText}>Pausa</Text>
              </TouchableOpacity>
            ) : exp.status === "paused" ? (
              <TouchableOpacity style={[styles.actionBtn, styles.actionGood]} onPress={() => patchMut.mutate({ key: exp.key, status: "running" })}>
                <Text style={styles.actionBtnText}>Riprendi</Text>
              </TouchableOpacity>
            ) : null}
            {exp.status !== "ended" && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => patchMut.mutate({ key: exp.key, status: "ended" })}>
                <Text style={styles.actionBtnText}>Termina</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => confirmDelete(exp.key)}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <DetailModal
        visible={!!selectedKey}
        data={detailQ.data}
        loading={detailQ.isLoading}
        onClose={() => setSelectedKey(null)}
      />

      <CreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/ab-experiments"] });
        }}
      />
    </ScrollView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = { running: "#22c55e", paused: "#f59e0b", ended: "#6b7280" };
  return (
    <View style={[styles.badge, { backgroundColor: colorMap[status] ?? "#6b7280" }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

function DetailModal({ visible, data, loading, onClose }: { visible: boolean; data?: DetailResponse; loading: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{data?.experiment.key ?? "Dettagli"}</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={26} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {loading && <ActivityIndicator color={Colors.accent} />}
          {data && (
            <>
              <Text style={styles.sectionTitle}>Metriche per variante</Text>
              {data.comparison.variants.map((v) => (
                <View key={v.variant} style={styles.metricRow}>
                  <Text style={styles.metricName}>{v.variant}</Text>
                  <Text style={styles.metricItem}>utenti: {v.users}</Text>
                  <Text style={styles.metricItem}>match: {v.events["match_created"] ?? 0}</Text>
                  <Text style={styles.metricItem}>accept: {pct(v.acceptRate)}</Text>
                  <Text style={styles.metricItem}>chat: {pct(v.chatRate)}</Text>
                </View>
              ))}

              <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Confronti (z-test, p &lt; 0.05 = significativo)</Text>
              {data.comparison.comparisons.length === 0 ? (
                <Text style={styles.emptyText}>Servono almeno 5 match_created per variante.</Text>
              ) : (
                data.comparison.comparisons.map((c, idx) => (
                  <View key={idx} style={[styles.metricRow, c.significant && styles.metricRowSig]}>
                    <Text style={styles.metricName}>{c.baseline} vs {c.challenger}</Text>
                    <Text style={styles.metricItem}>{c.metric}</Text>
                    <Text style={styles.metricItem}>{pct(c.baselineRate)} → {pct(c.challengerRate)}</Text>
                    <Text style={[styles.metricItem, c.significant && { color: "#22c55e", fontFamily: "Inter_700Bold" }]}>
                      p = {c.pValue != null ? c.pValue.toFixed(4) : "—"}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function CreateModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [variantsJson, setVariantsJson] = useState('[{"name":"control","weight":0.5},{"name":"variant","weight":0.5}]');
  const [busy, setBusy] = useState(false);

  async function submit() {
    try {
      setBusy(true);
      const variants = JSON.parse(variantsJson);
      await apiRequest("POST", "/api/admin/ab-experiments", { key, description, variants });
      setKey(""); setDescription("");
      onCreated();
    } catch (err) {
      Alert.alert("Errore", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Nuovo esperimento</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={26} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.label}>Chiave (a-z0-9_)</Text>
          <TextInput style={styles.input} value={key} onChangeText={setKey} placeholder="es. bio_affinity_weight_v2" placeholderTextColor={Colors.textSecondary} autoCapitalize="none" />
          <Text style={styles.label}>Descrizione</Text>
          <TextInput style={[styles.input, { height: 70 }]} value={description} onChangeText={setDescription} multiline placeholderTextColor={Colors.textSecondary} />
          <Text style={styles.label}>Varianti (JSON)</Text>
          <TextInput
            style={[styles.input, { height: 140, fontFamily: "Inter_400Regular" }]}
            value={variantsJson}
            onChangeText={setVariantsJson}
            multiline
            autoCapitalize="none"
            placeholderTextColor={Colors.textSecondary}
          />
          <Text style={styles.hint}>Formato: [{"{"}name, weight, config?{"}"}]. La somma dei pesi non deve essere zero.</Text>
          <TouchableOpacity style={[styles.createBtn, { alignSelf: "stretch", justifyContent: "center", marginTop: 12 }]} onPress={submit} disabled={busy}>
            <Text style={styles.createBtnText}>{busy ? "Creazione..." : "Crea esperimento"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, flex: 1, marginRight: 8 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  errorText: { color: "#ef4444", fontFamily: "Inter_500Medium", marginTop: 16 },
  emptyCard: { alignItems: "center", padding: 30, gap: 10, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border },
  emptyText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center", fontSize: 13 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text, flex: 1 },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  variantList: { gap: 6, marginBottom: 10 },
  variantRow: { padding: 8, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  variantName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  variantMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  variantEvents: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.accent, marginTop: 2 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.accent },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  actionWarn: { backgroundColor: "#f59e0b" },
  actionGood: { backgroundColor: "#22c55e" },
  actionDanger: { backgroundColor: "#ef4444" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase" },
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text, marginBottom: 8 },
  metricRow: { backgroundColor: Colors.surface, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, gap: 4 },
  metricRowSig: { borderColor: "#22c55e" },
  metricName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  metricItem: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 10, color: Colors.text, fontFamily: "Inter_400Regular", backgroundColor: Colors.surface },
  hint: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
});
