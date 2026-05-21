import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

import { AiPreviewState, AiPreviewItem } from "./types";

interface AiPreviewSectionProps {
  aiPreview: AiPreviewState | null;
  setAiPreview: React.Dispatch<React.SetStateAction<AiPreviewState | null>>;
  aiSuccessBanner: boolean;
  setAiSuccessBanner: (v: boolean) => void;
  aiSuccessTimer: React.MutableRefObject<any>;
  updatePreviewItemName: (idx: number, name: string) => void;
  regeocodePillItem: (idx: number, name: string) => void;
  handleConfirmPreview: () => void;
  setMode: (mode: any) => void;
  pillRoleColor: (role: any) => string;
  pillRoleLabel: (role: any) => string;
}

export const AiPreviewSection: React.FC<AiPreviewSectionProps> = ({
  aiPreview,
  setAiPreview,
  updatePreviewItemName,
  regeocodePillItem,
  handleConfirmPreview,
  setMode,
  pillRoleColor,
  pillRoleLabel,
}) => {
  const colors = useColors();
  if (!aiPreview) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Conferma l'itinerario AI</Text>
      
      <View style={styles.pillsContainer}>
        {aiPreview.items.map((item, idx) => (
          <View key={idx} style={[styles.pill, { backgroundColor: colors.surface, borderColor: item.resolved ? "transparent" : "#ff4444" }]}>
            <Ionicons
              name={item.role === "start" ? "play-circle" : item.role === "end" ? "stop-circle" : "location"}
              size={16}
              color={pillRoleColor(item.role)}
            />
            <TextInput
              style={[styles.pillInput, { color: colors.text }]}
              value={item.editedName}
              onChangeText={(txt) => updatePreviewItemName(idx, txt)}
              onBlur={() => regeocodePillItem(idx, item.editedName)}
              placeholder="Località..."
              placeholderTextColor={colors.textSecondary}
            />
            {item.geocoding && <ActivityIndicator size="small" color={colors.accent} />}
          </View>
        ))}
      </View>

      <View style={styles.footerButtons}>
        <Pressable
          style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
          onPress={handleConfirmPreview}
        >
          <Text style={styles.confirmBtnText}>Conferma e Calcola</Text>
        </Pressable>
        <Pressable
          style={[styles.cancelBtn, { backgroundColor: colors.surface }]}
          onPress={() => { setMode("ai"); setAiPreview(null); }}
        >
          <Text style={[styles.cancelBtnText, { color: colors.text }]}>Annulla</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 16 },
  pillsContainer: { gap: 10, marginBottom: 20 },
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  pillInput: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, padding: 0 },
  footerButtons: { gap: 10 },
  confirmBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  confirmBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
  cancelBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
