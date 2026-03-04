import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface Analytics {
  totalUsers: number;
  activeUsersMonth: number;
  activeUsersWeek: number;
  workshopContactsMonth: number;
  totalAdClicks: number;
  activeCampaigns: number;
  pendingReports: number;
}

export default function AdminAnalytics() {
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["/api/admin/analytics"],
  });

  function handleExportCSV() {
    const baseUrl = getApiUrl();
    const url = new URL("/api/admin/analytics/export-csv", baseUrl);
    Linking.openURL(url.toString()).catch(() => {
      Alert.alert("Errore", "Impossibile aprire il link per il download");
    });
  }

  const stats = [
    { label: "Utenti totali", value: data?.totalUsers ?? 0, icon: "people" as const, color: Colors.maleIcon },
    { label: "Attivi (30gg)", value: data?.activeUsersMonth ?? 0, icon: "trending-up" as const, color: Colors.success },
    { label: "Attivi (7gg)", value: data?.activeUsersWeek ?? 0, icon: "show-chart" as const, color: Colors.accent },
    { label: "Contatti officine (30gg)", value: data?.workshopContactsMonth ?? 0, icon: "store" as const, color: Colors.femaleIcon },
    { label: "Click ads totali", value: data?.totalAdClicks ?? 0, icon: "ads-click" as const, color: Colors.warning },
    { label: "Campagne attive", value: data?.activeCampaigns ?? 0, icon: "campaign" as const, color: Colors.accent },
    { label: "Segnalazioni pendenti", value: data?.pendingReports ?? 0, icon: "flag" as const, color: Colors.error },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
    >
      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento analytics...</Text>
      ) : (
        <>
          <View style={styles.grid}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: stat.color + "22" }]}>
                  <MaterialIcons name={stat.icon} size={24} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
            <MaterialIcons name="file-download" size={20} color={Colors.background} />
            <Text style={styles.exportBtnText}>Esporta CSV per Syneco</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    width: "47%", backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  statIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 16, marginTop: 24,
  },
  exportBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.background },
});
