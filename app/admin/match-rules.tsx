import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface MatchRule {
  id: string;
  searchTypeA: string;
  searchTypeB: string;
  compatible: boolean;
  weight: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminMatchRulesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const queryKey = ["/api/admin/match-rules"];

  const { data, isLoading, error } = useQuery<{ rules: MatchRule[] }>({
    queryKey,
    queryFn: async () => {
      const url = new URL("/api/admin/match-rules", getApiUrl()).toString();
      const res = await fetch(url, {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<MatchRule, "compatible" | "weight" | "notes">> }) => {
      const res = await apiRequest("PATCH", `/api/admin/match-rules/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare la regola"),
  });

  const allTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rules ?? []) {
      set.add(r.searchTypeA);
      set.add(r.searchTypeB);
    }
    return Array.from(set).sort();
  }, [data]);

  const rulesByPair = useMemo(() => {
    const map = new Map<string, MatchRule>();
    for (const r of data?.rules ?? []) {
      map.set(`${r.searchTypeA}::${r.searchTypeB}`, r);
      map.set(`${r.searchTypeB}::${r.searchTypeA}`, r);
    }
    return map;
  }, [data]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Errore caricamento regole.</Text>
      </View>
    );
  }

  const rules = data?.rules ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.headerCard}>
        <MaterialCommunityIcons name="link-variant" size={20} color={Colors.accent} />
        <Text style={styles.headerText}>
          Matrice di compatibilità tra tipi di ricerca. Le modifiche sono attive subito (cache invalidata).
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Regole ({rules.length})</Text>

      {rules.map((rule) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          onChange={(updates) => updateMutation.mutate({ id: rule.id, updates })}
          isSaving={updateMutation.isPending}
        />
      ))}

      <Text style={styles.sectionTitle}>Matrice</Text>

      <ScrollView horizontal style={styles.matrixScroll}>
        <View>
          <View style={styles.matrixRow}>
            <View style={[styles.matrixHeaderCell, styles.matrixCorner]}>
              <Text style={styles.matrixHeaderText}>A \\ B</Text>
            </View>
            {allTypes.map((t) => (
              <View key={`col-${t}`} style={styles.matrixHeaderCell}>
                <Text style={styles.matrixHeaderText} numberOfLines={2}>{t}</Text>
              </View>
            ))}
          </View>
          {allTypes.map((rowType) => (
            <View key={`row-${rowType}`} style={styles.matrixRow}>
              <View style={styles.matrixHeaderCell}>
                <Text style={styles.matrixHeaderText} numberOfLines={2}>{rowType}</Text>
              </View>
              {allTypes.map((colType) => {
                const rule = rulesByPair.get(`${rowType}::${colType}`);
                const compat = !!rule?.compatible;
                return (
                  <View
                    key={`cell-${rowType}-${colType}`}
                    style={[
                      styles.matrixCell,
                      { backgroundColor: rule ? (compat ? "#22c55e22" : "#ef444422") : Colors.background },
                    ]}
                  >
                    {rule ? (
                      <>
                        <MaterialCommunityIcons
                          name={compat ? "check-circle" : "close-circle"}
                          size={16}
                          color={compat ? "#22c55e" : "#ef4444"}
                        />
                        <Text style={styles.matrixWeight}>{rule.weight}</Text>
                      </>
                    ) : (
                      <Text style={styles.matrixEmpty}>—</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

function RuleCard({
  rule,
  onChange,
  isSaving,
}: {
  rule: MatchRule;
  onChange: (updates: Partial<Pick<MatchRule, "compatible" | "weight" | "notes">>) => void;
  isSaving: boolean;
}) {
  const [weightText, setWeightText] = useState(String(rule.weight));
  const [notesText, setNotesText] = useState(rule.notes ?? "");

  React.useEffect(() => { setWeightText(String(rule.weight)); }, [rule.weight]);
  React.useEffect(() => { setNotesText(rule.notes ?? ""); }, [rule.notes]);

  function commitWeight() {
    const n = parseFloat(weightText.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      Alert.alert("Peso non valido", "Inserisci un numero tra 0 e 100");
      setWeightText(String(rule.weight));
      return;
    }
    if (n !== rule.weight) onChange({ weight: n });
  }
  function commitNotes() {
    const trimmed = notesText.trim();
    if ((trimmed || null) !== (rule.notes || null)) {
      onChange({ notes: trimmed || null });
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.pairText}>
          {rule.searchTypeA} <Text style={styles.pairArrow}>↔</Text> {rule.searchTypeB}
        </Text>
        {isSaving && <ActivityIndicator size="small" color={Colors.accent} />}
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Compatibile</Text>
        <Switch
          value={rule.compatible}
          onValueChange={(v) => onChange({ compatible: v })}
          trackColor={{ false: Colors.border, true: "#22c55e" }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Peso</Text>
        <TextInput
          style={styles.input}
          value={weightText}
          onChangeText={setWeightText}
          onBlur={commitWeight}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={commitWeight}
        />
      </View>
      <View style={styles.rowColumn}>
        <Text style={styles.label}>Note</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notesText}
          onChangeText={setNotesText}
          onBlur={commitNotes}
          placeholder="Opzionale"
          placeholderTextColor={Colors.textSecondary}
          multiline
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background },
  error: { color: "#ef4444", fontFamily: "Inter_500Medium" },
  headerCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  headerText: { flex: 1, color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 13 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pairText: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  pairArrow: { color: Colors.accent },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowColumn: { paddingVertical: 6 },
  label: { color: Colors.text, fontFamily: "Inter_500Medium", fontSize: 13 },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: Colors.text,
    minWidth: 90,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  notesInput: { minHeight: 40, marginTop: 6, textAlignVertical: "top" },
  matrixScroll: { marginTop: 6 },
  matrixRow: { flexDirection: "row" },
  matrixHeaderCell: {
    width: 110,
    height: 48,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  matrixCorner: { backgroundColor: Colors.background },
  matrixHeaderText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textAlign: "center",
  },
  matrixCell: {
    width: 110,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  matrixWeight: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  matrixEmpty: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12 },
});
