// Task #2645 — Card riusabile per un insight pinnato (knowledge base).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import ScopeBadges from "./ScopeBadges";
import { useUnpinInsight, type AiPinnedRow } from "@/hooks/admin/ai-console/useAiPinned";

interface Props {
  pin: AiPinnedRow;
  onOpenConversation?: (conversationId: string, messageId: string | null) => void;
}

export default function PinnedInsightCard({ pin, onOpenConversation }: Props) {
  const colors = useColors();
  const unpin = useUnpinInsight();

  const handleUnpin = () => {
    Alert.alert("Rimuovi insight", "Confermi la rimozione dalla knowledge base?", [
      { text: "Annulla", style: "cancel" },
      { text: "Rimuovi", style: "destructive", onPress: () => unpin.mutate(pin.id) },
    ]);
  };

  const handleOpen = () => {
    if (pin.conversationId && onOpenConversation) {
      onOpenConversation(pin.conversationId, pin.messageId);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="bookmark" size={14} color={colors.accent} />
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {pin.title || "Insight"}
          </Text>
        </View>
        <TouchableOpacity onPress={handleUnpin} accessibilityLabel="Rimuovi insight">
          <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      {pin.scope ? (
        <View style={{ marginBottom: 6 }}>
          <ScopeBadges scopes={[pin.scope]} size="sm" />
        </View>
      ) : null}
      <Text style={[styles.body, { color: colors.text }]} numberOfLines={6}>
        {pin.body}
      </Text>
      <View style={styles.footer}>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {formatDate(pin.createdAt)}
          {pin.pinnedByNickname ? ` · ${pin.pinnedByNickname}` : ""}
        </Text>
        {pin.conversationId ? (
          <TouchableOpacity onPress={handleOpen} style={styles.openBtn}>
            <Text style={[styles.openTxt, { color: colors.accent }]}>Apri conversazione</Text>
            <Ionicons name="open-outline" size={12} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, gap: 8 },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 13 },
  body: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  footer: {
    marginTop: 8, flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", flexWrap: "wrap", gap: 6,
  },
  meta: { fontFamily: "Inter_400Regular", fontSize: 10 },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  openTxt: { fontFamily: "Inter_500Medium", fontSize: 11 },
});
