// Task #2657 — Lista conflitti aperti con CTA "Override".
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { AiConflictRow } from "@/hooks/admin/ai-layer/useAiConflicts";

export default function ConflictsList(props: {
  conflicts: AiConflictRow[];
  loading?: boolean;
  onOverride: (c: AiConflictRow) => void;
}) {
  const colors = useColors();
  if (props.loading) {
    return <Text style={{ color: colors.textSecondary, padding: 12 }}>Caricamento conflitti…</Text>;
  }
  if (props.conflicts.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <Ionicons name="checkmark-circle" size={28} color={colors.success} />
        <Text style={{ color: colors.text, marginTop: 6, fontWeight: "600" }}>Nessun conflitto aperto</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
          La policy engine sta risolvendo automaticamente tutti i casi.
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={props.conflicts}
      keyExtractor={(c) => c.id}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View testID={`conflict-${item.id}`} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.type, { color: colors.text }]}>{item.conflictType}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              A: {item.eventIdA.slice(0, 8)}… · B: {item.eventIdB.slice(0, 8)}…
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {new Date(item.createdAt).toLocaleString("it-IT")}
            </Text>
          </View>
          <TouchableOpacity
            testID={`conflict-override-${item.id}`}
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => props.onOverride(item)}
          >
            <Ionicons name="hand-right" size={14} color="#fff" />
            <Text style={styles.btnText}>Override</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  type: { fontWeight: "700", fontSize: 14 },
  meta: { fontSize: 11, marginTop: 2 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 12, borderWidth: 1, borderStyle: "dashed" },
});
