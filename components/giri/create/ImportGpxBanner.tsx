import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ImportGpxBannerProps {
  isImporting: boolean;
  colors: any;
}

export const ImportGpxBanner: React.FC<ImportGpxBannerProps> = ({ isImporting, colors }) => {
  if (!isImporting) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="cloud-upload-outline" size={16} color={colors.accent} />
      <Text style={[styles.text, { color: colors.text }]}>Importazione GPX in corso...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    borderRadius: 10, 
    padding: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
  },
  text: { 
    fontFamily: "Inter_500Medium", 
    fontSize: 13, 
  },
});
