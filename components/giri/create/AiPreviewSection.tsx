import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

import { AiPreviewState, GeoResult } from "./types";

interface AiPreviewSectionProps {
  aiPreview: AiPreviewState | null;
  setAiPreview: React.Dispatch<React.SetStateAction<AiPreviewState | null>>;
  aiSuccessBanner: boolean;
  setAiSuccessBanner: (v: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- timer ref
  aiSuccessTimer: React.MutableRefObject<any>;
  updatePreviewItemName: (idx: number, name: string) => void;
  regeocodePillItem: (idx: number, name: string) => void;
  selectPreviewItemSuggestion: (idx: number, candidate: GeoResult) => void;
  handleConfirmPreview: () => void;
  hasUnresolvedPois?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mode is string union type
  setMode: (mode: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- role from AI parse result
  pillRoleColor: (role: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- role from AI parse result
  pillRoleLabel: (role: any) => string;
}

export const AiPreviewSection: React.FC<AiPreviewSectionProps> = ({
  aiPreview,
  setAiPreview,
  updatePreviewItemName,
  regeocodePillItem,
  selectPreviewItemSuggestion,
  handleConfirmPreview,
  hasUnresolvedPois = false,
  setMode,
  pillRoleColor,
}) => {
  const colors = useColors();
  if (!aiPreview) return null;
  const hasUnresolvedLocations = aiPreview.items.some(
    (item) => item.geocoding || !item.resolved || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)
  );
  const blocked = hasUnresolvedLocations || hasUnresolvedPois;

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
            {!item.geocoding && item.suggestions && item.suggestions.length > 1 && (
              <View style={styles.suggestions}>
                <Text style={[styles.suggestionHint, { color: colors.textSecondary }]}>Seleziona il punto corretto</Text>
                {item.suggestions.map((candidate) => (
                  <Pressable
                    key={candidate.name + "-" + candidate.lat + "-" + candidate.lng}
                    style={[styles.suggestion, item.resolved && item.lat === candidate.lat && item.lng === candidate.lng && styles.suggestionSelected]}
                    onPress={() => selectPreviewItemSuggestion(idx, candidate)}
                  >
                    <Text style={[styles.suggestionText, { color: colors.text }]} numberOfLines={2}>{candidate.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      {blocked && (
        <Text style={[styles.poiHint, { color: colors.textSecondary }]}>Seleziona un indirizzo per ogni punto e ogni fermata richiesta per continuare</Text>
      )}

      <View style={styles.footerButtons}>
        <Pressable
          style={[styles.confirmBtn, { backgroundColor: blocked ? colors.surface : colors.accent, opacity: blocked ? 0.5 : 1 }]}
          onPress={blocked ? undefined : handleConfirmPreview}
        >
          <Text style={[styles.confirmBtnText, { color: blocked ? colors.textSecondary : "#000" }]}>Conferma e Calcola</Text>
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
  poiHint: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginBottom: 10 },
  suggestions: { width: "100%", gap: 6, marginTop: 6 },
  suggestionHint: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 2 },
  suggestion: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: "#ffffff25" },
  suggestionSelected: { borderColor: "#22c55e", backgroundColor: "#22c55e18" },
  suggestionText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  confirmBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  confirmBtnText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  cancelBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
