import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface LanguageAiStatsProps {
  aiLoading: boolean;
  aiResult: { ok: boolean; msg: string } | null;
  onAiComplete: () => void;
}

export const LanguageAiStats: React.FC<LanguageAiStatsProps> = ({
  aiLoading,
  aiResult,
  onAiComplete,
}) => {
  return (
    <View style={styles.aiBar}>
      <TouchableOpacity
        style={[styles.aiBtn, aiLoading && styles.aiBtnDisabled]}
        onPress={onAiComplete}
        disabled={aiLoading}
        activeOpacity={0.7}
      >
        {aiLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <MaterialCommunityIcons name="auto-fix" size={15} color="#fff" />
            <Text style={styles.aiBtnText}>Completa con AI</Text>
          </>
        )}
      </TouchableOpacity>
      {aiResult ? (
        <View style={[styles.aiResultBadge, aiResult.ok ? styles.aiResultBadgeOk : styles.aiResultBadgeErr]}>
          <MaterialCommunityIcons
            name={aiResult.ok ? "check-circle" : "alert-circle"}
            size={12}
            color={aiResult.ok ? "#4CAF50" : "#F44336"}
          />
          <Text style={[styles.aiResultText, { color: aiResult.ok ? "#4CAF50" : "#F44336" }]} numberOfLines={2}>
            {aiResult.msg}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  aiBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#2a2a2a",
    flexWrap: "wrap",
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  aiBtnDisabled: {
    opacity: 0.5,
  },
  aiBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  aiResultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  aiResultBadgeOk: {
    backgroundColor: "#4CAF5015",
  },
  aiResultBadgeErr: {
    backgroundColor: "#F4433615",
  },
  aiResultText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
