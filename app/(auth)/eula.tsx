import React from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EulaScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/auth/eula"],
  });

  const eulaText = (data as any)?.text || "Caricamento...";

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
    >
      <Text style={styles.text}>{eulaText}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  text: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 22 },
});
