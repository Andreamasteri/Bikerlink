// Task #2641 — Sidebar lista conversazioni (desktop) / tab "Lista" (mobile).
// Task #2645 — SearchBar full-text + risultati che aprono conversation + messageId.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import {
  useAiConversations,
  useArchiveConversation,
  type AiConversationSummary,
} from "@/hooks/admin/ai-console/useAiConversation";

interface SearchHit {
  conversationId: string;
  convTitle: string | null;
  messageId: string;
  snippet: string;
  createdAt: string;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null, messageId?: string | null) => void;
  onNew: () => void;
}

export default function ConversationSidebar({ selectedId, onSelect, onNew }: Props) {
  const colors = useColors();
  const { data, isLoading } = useAiConversations();
  const archive = useArchiveConversation();
  const [q, setQ] = useState("");
  const qTrim = q.trim();

  const search = useQuery<{ results: SearchHit[] }>({
    queryKey: ["/api/admin/ai/console/search", qTrim],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/ai/console/search?q=${encodeURIComponent(qTrim)}`);
      return res.json();
    },
    enabled: qTrim.length >= 2,
    staleTime: 10_000,
  });

  const handleArchive = (c: AiConversationSummary) => {
    Alert.alert("Archivia conversazione", `"${c.title ?? c.id.slice(0, 8)}"?`, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Archivia",
        style: "destructive",
        onPress: () => {
          archive.mutate(c.id, {
            onSuccess: () => {
              if (selectedId === c.id) onSelect(null);
            },
          });
        },
      },
    ]);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Text style={[styles.headerText, { color: colors.textSecondary }]}>Conversazioni</Text>
        <TouchableOpacity onPress={onNew} accessibilityLabel="Nuova conversazione">
          <Ionicons name="add-circle" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>
      <View style={[styles.searchRow, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
        <Ionicons name="search" size={14} color={colors.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Cerca nei messaggi…"
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          testID="ai-conv-search"
        />
        {q ? (
          <TouchableOpacity onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      {qTrim.length >= 2 ? (
        <View style={{ borderBottomWidth: 1, borderColor: colors.border, maxHeight: 220 }}>
          {search.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ margin: 12 }} size="small" />
          ) : (search.data?.results ?? []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun risultato.</Text>
          ) : (
            <FlatList
              data={search.data?.results ?? []}
              keyExtractor={(h) => `${h.conversationId}-${h.messageId}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.hitRow, { borderColor: colors.border }]}
                  onPress={() => onSelect(item.conversationId, item.messageId)}
                >
                  <Text style={[styles.hitTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.convTitle ?? "Senza titolo"}
                  </Text>
                  <Text style={[styles.hitSnippet, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.snippet}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : null}
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={data?.conversations ?? []}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => {
            const active = item.id === selectedId;
            return (
              <View
                style={[
                  styles.row,
                  { borderColor: colors.border, backgroundColor: active ? colors.surfaceLight : "transparent" },
                ]}
              >
                <TouchableOpacity style={{ flex: 1 }} onPress={() => onSelect(item.id)}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {item.title ?? "Senza titolo"}
                  </Text>
                  <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {formatDate(item.lastMessageAt)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleArchive(item)} accessibilityLabel="Archivia">
                  <Ionicons name="archive-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Nessuna conversazione. Tocca + per iniziare.
            </Text>
          }
        />
      )}
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRightWidth: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 10, borderBottomWidth: 1,
  },
  headerText: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", padding: 20 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 8, marginTop: 8, marginBottom: 4,
    borderRadius: 14, borderWidth: 1,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, paddingVertical: 2 },
  hitRow: { padding: 10, borderBottomWidth: 1 },
  hitTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  hitSnippet: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2, lineHeight: 15 },
});
