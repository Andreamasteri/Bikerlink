// Task #2641 — Sidebar lista conversazioni (desktop) / tab "Lista" (mobile).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useAiConversations,
  useArchiveConversation,
  type AiConversationSummary,
} from "@/hooks/admin/ai-console/useAiConversation";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
}

export default function ConversationSidebar({ selectedId, onSelect, onNew }: Props) {
  const colors = useColors();
  const { data, isLoading } = useAiConversations();
  const archive = useArchiveConversation();

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
});
