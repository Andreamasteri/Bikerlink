import React from "react";
import { Text, StyleSheet, ScrollView } from "react-native";
import { useTheme } from "@/lib/theme-context";
import OtaAdminPanel from "@/components/admin/ota/OtaPanel";

export default function OtaPanel() {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
        Gestione OTA Updates
      </Text>
      <OtaAdminPanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 16,
  },
});
