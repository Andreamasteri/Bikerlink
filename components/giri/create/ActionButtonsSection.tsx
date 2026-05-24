import React from "react";
import { Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
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
}

export const ActionButtonsSection: React.FC<ActionButtonsSectionProps> = ({
  calculating,
  handleCalculate,
  routeResult,
  handleSave,
  saveMutationPending,
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
