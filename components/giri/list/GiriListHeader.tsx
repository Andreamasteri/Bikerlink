import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface GiriListHeaderProps {
  isImporting: boolean;
  onImportGpx: () => void;
  onPlan: () => void;
}

export function GiriListHeader({ isImporting, onImportGpx, onPlan }: GiriListHeaderProps) {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.header}>
      <View>
        <Text style={s.headerTitle}>Giri</Text>
        <Text style={s.headerSub}>I tuoi percorsi in moto</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Pressable
          style={s.importBtn}
          onPress={onImportGpx}
          disabled={isImporting}
          testID="import-gpx-btn"
        >
          {isImporting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <MaterialCommunityIcons name="file-upload-outline" size={18} color={colors.text} />
          )}
          <Text style={s.importBtnText}>Importa GPX</Text>
        </Pressable>
        <Pressable
          style={s.planBtn}
          onPress={onPlan}
        >
          <MaterialCommunityIcons name="map-marker-plus" size={20} color="#000" />
          <Text style={s.planBtnText}>Pianifica</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    headerTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 26,
      color: colors.text,
    },
    headerSub: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.textSecondary,
    },
    planBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
    },
    planBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: "#000",
    },
    importBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
    importBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: colors.text,
    },
  });
