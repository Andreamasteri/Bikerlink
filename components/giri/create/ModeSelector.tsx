import React from "react";
import type { ThemeColors } from '@/constants/colors';
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ModeChipProps {
  label: string;
  isActive: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  colors: ThemeColors;
}

const ModeChip: React.FC<ModeChipProps> = ({ label, isActive, icon, onPress, colors }) => (
  <Pressable
    style={[
      styles.modeChip,
      { backgroundColor: colors.surface },
      isActive && { backgroundColor: colors.accent }
    ]}
    onPress={onPress}
  >
    <Ionicons name={icon} size={14} color={isActive ? "#000" : colors.text} />
    <Text style={[styles.modeChipText, { color: colors.text }, isActive && { color: "#000" }]}>
      {label}
    </Text>
  </Pressable>
);

interface ModeSelectorProps {
  mode: "ai" | "manual" | "ai-preview";
  setMode: (mode: "ai" | "manual") => void;
  colors: ThemeColors;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, setMode, colors }) => {
  return (
    <View style={styles.modeRow}>
      <ModeChip
        label="AI"
        isActive={mode === "ai" || mode === "ai-preview"}
        icon="sparkles"
        onPress={() => setMode("ai")}
        colors={colors}
      />
      <ModeChip
        label="Manuale"
        isActive={mode === "manual"}
        icon="create-outline"
        onPress={() => setMode("manual")}
        colors={colors}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  modeChip: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 6, 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 20, 
  },
  modeChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
