// Task #2641 — Coda azioni pending consolidata. Apply/Reject = navigate alla
// vista nativa di ciascun sottosistema (no nuovi endpoint inventati).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAiActionQueue, type AiActionItem } from "@/hooks/admin/ai-console/useAiActionQueue";
import { scopeColor, scopeLabel } from "./scopes";

export default function ActionQueuePanel({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const { data, isLoading } = useAiActionQueue();

  function openItem(it: AiActionItem) {
    switch (it.scope) {
      case "moderation":
        router.push(it.refId ? `/admin/reports?id=${it.refId}` as never : "/admin/reports" as never);
        return;
      case "watchdog":
        router.push("/admin/system-health" as never);
        return;
      case "ota":
        router.push("/admin/ota" as never);
        return;
      case "db-integrity":
        router.push("/admin/db-integrity" as never);
        return;
      case "app-integrity":
        router.push("/admin/app-integrity" as never);
        return;
      default:
        return;
    }
  }

  const items = data?.items ?? [];
  const visible = compact ? items.slice(0, 5) : items.slice(0, 20);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Ionicons name="list" size={14} color={colors.accent} />
        <Text style={[styles.title, { color: colors.text }]}>Coda azioni</Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {items.length}{data?.total && data.total > items.length ? ` / ${data.total}` : ""}
        </Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ margin: 16 }} />
      ) : visible.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessuna azione pendente.</Text>
      ) : (
        visible.map((it) => {
          const c = scopeColor(it.scope);
          return (
            <View key={`${it.scope}-${it.id}`} style={[styles.row, { borderColor: colors.border }]}>
              <View style={[styles.scopeStripe, { backgroundColor: c }]} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={[styles.scope, { color: c }]}>{scopeLabel(it.scope)}</Text>
                  <Text style={[styles.sev, { color: colors.textSecondary }]}>
                    {(it.severity ?? "?").toUpperCase()}
                  </Text>
                  <Text style={[styles.prio, { color: colors.textSecondary }]}>p{it.priority}</Text>
                </View>
                <Text style={[styles.summary, { color: colors.text }]} numberOfLines={2}>
                  {it.summary ?? it.kind}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => openItem(it)}
                style={[styles.btn, { backgroundColor: colors.accent }]}
                accessibilityLabel="Apri"
              >
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderBottomWidth: 1,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 13, flex: 1 },
  count: { fontFamily: "Inter_500Medium", fontSize: 11 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 12, padding: 16, textAlign: "center", fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1 },
  scopeStripe: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  scope: { fontFamily: "Inter_700Bold", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  sev: { fontFamily: "Inter_500Medium", fontSize: 9 },
  prio: { fontFamily: "Inter_400Regular", fontSize: 9, marginLeft: "auto" },
  summary: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  btn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
