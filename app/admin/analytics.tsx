import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AdminAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/analytics"] });
  const analytics = (data as any)?.analytics;

  const downloadCSV = () => {
    const url = new URL("/api/admin/export/syneco", getApiUrl());
    Linking.openURL(url.toString());
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
      <Text style={styles.title}>Analytics</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="people" size={24} color={Colors.maleIcon} />
          <Text style={styles.statValue}>{analytics?.totalUsers || 0}</Text>
          <Text style={styles.statLabel}>Utenti Totali</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="pulse" size={24} color={Colors.success} />
          <Text style={styles.statValue}>{analytics?.activeToday || 0}</Text>
          <Text style={styles.statLabel}>Attivi Oggi</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="navigate" size={24} color={Colors.accent} />
          <Text style={styles.statValue}>{analytics?.totalRoutes || 0}</Text>
          <Text style={styles.statLabel}>Percorsi</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="finger-print" size={24} color={Colors.warning} />
          <Text style={styles.statValue}>{analytics?.totalAdClicks || 0}</Text>
          <Text style={styles.statLabel}>Click Annunci</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Export Syneco</Text>
      <Pressable style={styles.exportBtn} onPress={downloadCSV}>
        <Ionicons name="download" size={20} color={Colors.background} />
        <Text style={styles.exportBtnText}>Scarica Report CSV</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.accent, marginBottom: 24 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 32 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: Colors.surface, borderRadius: 16, padding: 20, alignItems: "center", gap: 4 },
  statValue: { fontSize: 32, fontFamily: "Inter_700Bold", color: Colors.text },
  statLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 12 },
  exportBtn: { flexDirection: "row", backgroundColor: Colors.syneco, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8 },
  exportBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
