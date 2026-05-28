// Task #2645 — Knowledge base AI Console: insight pinnati condivisi tra admin.
import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAiPinned } from "@/hooks/admin/ai-console/useAiPinned";
import PinnedInsightCard from "@/components/admin/ai-console/PinnedInsights";

const SCOPES = ["moderation", "watchdog", "ota", "db-integrity", "app-integrity"] as const;

export default function AiPinnedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useAiPinned();

  const filtered = useMemo(() => {
    const all = data?.pinned ?? [];
    const ql = q.trim().toLowerCase();
    return all.filter((p) => {
      if (scope && p.scope !== scope) return false;
      if (!ql) return true;
      return (
        p.title.toLowerCase().includes(ql) ||
        p.body.toLowerCase().includes(ql)
      );
    });
  }, [data, q, scope]);

  const webTop = Platform.OS === "web" ? 67 : 0;
  const webBottom = Platform.OS === "web" ? 34 : 0;

  const openConv = (conversationId: string, messageId: string | null) => {
    const qs = messageId ? `?conversationId=${conversationId}&messageId=${messageId}` : `?conversationId=${conversationId}`;
    router.push(`/admin/ai-console${qs}` as never);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: webTop }]}>
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={[styles.searchRow, { backgroundColor: colors.surfaceLight }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Cerca negli insight…"
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ("")}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <Chip label="Tutti" active={scope === null} onPress={() => setScope(null)} colors={colors} />
          {SCOPES.map((s) => (
            <Chip key={s} label={s} active={scope === s} onPress={() => setScope(s)} colors={colors} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 + webBottom }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} tintColor={colors.accent} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bookmarks-outline" size={32} color={colors.textSecondary} />
            <Text style={[styles.emptyTxt, { color: colors.textSecondary }]}>
              {q || scope ? "Nessun insight corrisponde ai filtri." : "Nessun insight pinnato. Pinna i messaggi rilevanti dalla AI Console."}
            </Text>
          </View>
        ) : (
          filtered.map((p) => (
            <PinnedInsightCard key={p.id} pin={p} onOpenConversation={openConv} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Chip({
  label, active, onPress, colors,
}: {
  label: string; active: boolean; onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent : "transparent",
        },
      ]}
    >
      <Text
        style={{
          color: active ? "#fff" : colors.textSecondary,
          fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
          fontSize: 11,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: 10, gap: 8, borderBottomWidth: 1 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 4 },
  chipsRow: { gap: 6, paddingVertical: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyTxt: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
});
