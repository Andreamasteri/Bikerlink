import React from "react";
import { Text, Pressable, StyleSheet, ActivityIndicator, View } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

interface ActionButtonsSectionProps {
  calculating: boolean;
  handleCalculate: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route result from API
  routeResult: any;
  handleSave: () => void;
  saveMutationPending: boolean;
  routeError?: string | null;
}

export const ActionButtonsSection: React.FC<ActionButtonsSectionProps> = ({
  calculating,
  handleCalculate,
  routeResult,
  handleSave,
  saveMutationPending,
  routeError,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <>
      <Pressable
        style={[s.primaryBtn, calculating && { opacity: 0.6 }]}
        onPress={handleCalculate}
        disabled={calculating}
      >
        {calculating ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <MaterialCommunityIcons name="map-marker-path" size={18} color="#000" />
        )}
        <Text style={s.primaryBtnText}>{calculating ? "Calcolo in corso..." : "Calcola percorso"}</Text>
      </Pressable>

      {!!routeError && !calculating && (
        <View style={s.errorCard}>
          <Ionicons name="warning-outline" size={16} color="#ef4444" />
          <Text style={s.errorText} numberOfLines={3}>{routeError}</Text>
          <Pressable onPress={handleCalculate} style={s.retryBtn} hitSlop={8}>
            <Ionicons name="refresh-outline" size={15} color="#ef4444" />
            <Text style={s.retryText}>Riprova</Text>
          </Pressable>
        </View>
      )}

      {routeResult && (
        <Pressable
          style={[s.saveBtn, saveMutationPending && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saveMutationPending}
        >
          {saveMutationPending ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Ionicons name="save-outline" size={18} color={colors.accent} />
          )}
          <Text style={s.saveBtnText}>{saveMutationPending ? "Salvataggio..." : "Salva giro"}</Text>
        </Pressable>
      )}
    </>
  );
};

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      marginBottom: 10,
    },
    primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
    errorCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#ef444418",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#ef444440",
      padding: 12,
      marginBottom: 10,
    },
    errorText: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: "#ef4444",
      flex: 1,
    },
    retryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#ef444460",
    },
    retryText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      color: "#ef4444",
    },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      borderWidth: 1.5,
      borderColor: colors.accent,
      marginTop: 4,
    },
    saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.accent },
  });
