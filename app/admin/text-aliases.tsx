import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const CATEGORIES = [
  { value: "music_tag", label: "Musica (tag)" },
  { value: "riding_style_tag", label: "Stile guida (tag)" },
  { value: "moto_type_tag", label: "Tipo moto (tag)" },
  { value: "bike_brand", label: "Marca moto" },
  { value: "bike_model", label: "Modello moto" },
  { value: "city", label: "Città" },
  { value: "nickname", label: "Nickname" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

interface AliasRow {
  id: string;
  category: string;
  inputNormalized: string;
  targetId: string | null;
  targetValue: string | null;
  confidence: number;
  source: string;
  createdAt: string;
  tagLabel: string | null;
}

interface InterpretResult {
  query: string;
  normalized: string;
  category: string;
  exact: { id: string | null; value: string; slug?: string | null } | null;
  alias: { id: string | null; value: string; confidence: number; aliasId: string } | null;
  fuzzy: Array<{ id: string | null; value: string; slug?: string | null; similarity: number }>;
}

export default function TextAliasesScreen() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Category | "all">("all");
  const [input, setInput] = useState("");
  const [target, setTarget] = useState("");
  const [createCategory, setCreateCategory] = useState<Category>("bike_brand");
  const [confidence, setConfidence] = useState("1");
  const [testQuery, setTestQuery] = useState("");
  const [testCategory, setTestCategory] = useState<Category>("bike_brand");
  const [testResult, setTestResult] = useState<InterpretResult | null>(null);
  const [testing, setTesting] = useState(false);

  const listUrl = useMemo(
    () =>
      filter === "all"
        ? "/api/admin/text-aliases"
        : `/api/admin/text-aliases?category=${encodeURIComponent(filter)}`,
    [filter],
  );

  const { data, isLoading, error, refetch } = useQuery<{ aliases: AliasRow[] }>({
    queryKey: ["/api/admin/text-aliases", filter],
    queryFn: async () => {
      const res = await apiRequest("GET", listUrl);
      return (await res.json()) as { aliases: AliasRow[] };
    },
  });

  const createMut = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/text-aliases", {
        category: createCategory,
        input,
        targetValue: target,
        confidence: Number(confidence) || 1,
      }),
    onSuccess: () => {
      setInput("");
      setTarget("");
      qc.invalidateQueries({ queryKey: ["/api/admin/text-aliases"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/text-aliases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/text-aliases"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  async function runTest() {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const params = new URLSearchParams({ q: testQuery, category: testCategory, limit: "5" });
      const res = await apiRequest(
        "GET",
        `/api/admin/text-interpreter/test?${params.toString()}`,
      );
      const json = (await res.json()) as InterpretResult;
      setTestResult(json);
    } catch (err) {
      Alert.alert("Errore", err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Alias testo & Test interprete</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Test interprete</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.textInput, { flex: 1 }]}
            placeholder="Es. ducti"
            placeholderTextColor={Colors.textSecondary}
            value={testQuery}
            onChangeText={setTestQuery}
          />
        </View>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, testCategory === c.value && styles.chipSelected]}
              onPress={() => setTestCategory(c.value)}
            >
              <Text style={[styles.chipText, testCategory === c.value && styles.chipTextSelected]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={runTest} disabled={testing}>
          {testing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Esegui</Text>}
        </TouchableOpacity>
        {testResult && (
          <View style={styles.testResult}>
            <Text style={styles.kv}>
              <Text style={styles.k}>Normalizzato: </Text>
              {testResult.normalized || "—"}
            </Text>
            <Text style={styles.kv}>
              <Text style={styles.k}>Exact: </Text>
              {testResult.exact ? testResult.exact.value : "—"}
            </Text>
            <Text style={styles.kv}>
              <Text style={styles.k}>Alias: </Text>
              {testResult.alias
                ? `${testResult.alias.value} (conf ${testResult.alias.confidence.toFixed(2)})`
                : "—"}
            </Text>
            <Text style={[styles.kv, { marginTop: 8 }]}>
              <Text style={styles.k}>Fuzzy (top {testResult.fuzzy.length}):</Text>
            </Text>
            {testResult.fuzzy.length === 0 ? (
              <Text style={styles.muted}>Nessun match fuzzy sopra soglia.</Text>
            ) : (
              testResult.fuzzy.map((f, i) => (
                <Text key={`${f.value}-${i}`} style={styles.fuzzyRow}>
                  {(f.similarity * 100).toFixed(0)}% — {f.value}
                </Text>
              ))
            )}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Nuovo alias manuale</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Input (es. ducti)"
          placeholderTextColor={Colors.textSecondary}
          value={input}
          onChangeText={setInput}
        />
        <TextInput
          style={styles.textInput}
          placeholder="Target canonico (es. Ducati)"
          placeholderTextColor={Colors.textSecondary}
          value={target}
          onChangeText={setTarget}
        />
        <TextInput
          style={styles.textInput}
          placeholder="Confidence 0–1 (default 1)"
          placeholderTextColor={Colors.textSecondary}
          value={confidence}
          onChangeText={setConfidence}
          keyboardType="decimal-pad"
        />
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, createCategory === c.value && styles.chipSelected]}
              onPress={() => setCreateCategory(c.value)}
            >
              <Text style={[styles.chipText, createCategory === c.value && styles.chipTextSelected]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => createMut.mutate()}
          disabled={createMut.isPending || !input.trim() || !target.trim()}
        >
          {createMut.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Crea alias</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Alias esistenti</Text>
          <TouchableOpacity onPress={() => refetch()}>
            <Ionicons name="refresh" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, filter === "all" && styles.chipSelected]}
            onPress={() => setFilter("all")}
          >
            <Text style={[styles.chipText, filter === "all" && styles.chipTextSelected]}>Tutte</Text>
          </TouchableOpacity>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, filter === c.value && styles.chipSelected]}
              onPress={() => setFilter(c.value)}
            >
              <Text style={[styles.chipText, filter === c.value && styles.chipTextSelected]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {isLoading && <ActivityIndicator color={Colors.accent} />}
        {error && <Text style={styles.muted}>Errore: {(error as Error).message}</Text>}
        {data?.aliases.map((a) => (
          <View key={a.id} style={styles.aliasRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aliasInput}>{a.inputNormalized}</Text>
              <Text style={styles.aliasMeta}>
                {a.category} → {a.tagLabel ?? a.targetValue ?? "—"} · conf {a.confidence.toFixed(2)} · {a.source}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Eliminare?", a.inputNormalized, [
                  { text: "Annulla", style: "cancel" },
                  { text: "Elimina", style: "destructive", onPress: () => deleteMut.mutate(a.id) },
                ])
              }
            >
              <MaterialCommunityIcons name="trash-can-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}
        {data?.aliases.length === 0 && (
          <Text style={styles.muted}>Nessun alias per questa categoria.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text, marginBottom: 16 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text, marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8 },
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  chipTextSelected: { color: "#fff" },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  testResult: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  kv: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text, marginBottom: 4 },
  k: { fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  fuzzyRow: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text, marginLeft: 8, marginTop: 2 },
  muted: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 6 },
  aliasRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  aliasInput: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  aliasMeta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
