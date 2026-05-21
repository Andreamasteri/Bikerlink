import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";

interface SystemLoadingDisplayProps {
  topPadding?: number;
}

export function SystemLoadingDisplay({ topPadding = 0 }: SystemLoadingDisplayProps) {
  return (
    <View style={[styles.center, { paddingTop: topPadding }]}>
      <ActivityIndicator size="large" color={Colors.accent} />
      <Text style={styles.loadingText}>Caricamento sistema…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: 12,
  },
  loadingText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
