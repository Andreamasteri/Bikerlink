import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface BikerInfoBannerProps {
  visible: boolean;
}

export const BikerInfoBanner: React.FC<BikerInfoBannerProps> = ({ visible }) => {
  const t = useT();
  if (!visible) return null;

  return (
    <View style={styles.bikerInfoBanner}>
      <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
      <Text style={styles.bikerInfoText}>{t("match.bikerTabInfo")}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bikerInfoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  bikerInfoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
