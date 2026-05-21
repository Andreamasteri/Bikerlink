import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { StatCard } from "./StatCard";

interface TelemetryAdminStats {
  users_with_telemetry: number;
  total_rides: number;
  total_samples: number;
  total_km: number;
  avg_km_per_user: number;
  target_km: number;
}

interface TelemetryStatsProps {
  stats: TelemetryAdminStats;
}

export function TelemetryStats({ stats }: TelemetryStatsProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Riepilogo globale</Text>
      <View style={styles.statsGrid}>
        <StatCard
          label="Utenti con dati"
          value={stats.users_with_telemetry}
          icon="account-group"
          color="#3b82f6"
        />
        <StatCard
          label="Giri registrati"
          value={stats.total_rides}
          icon="map-marker-path"
          color="#8b5cf6"
        />
        <StatCard
          label="Campioni totali"
          value={stats.total_samples.toLocaleString("it-IT")}
          icon="crosshairs-gps"
          color="#f59e0b"
        />
        <StatCard
          label="Km totali raccolti"
          value={`${stats.total_km.toLocaleString("it-IT", { maximumFractionDigits: 0 })} km`}
          icon="road-variant"
          color="#22c55e"
        />
        <StatCard
          label="Media km / utente"
          value={`${stats.avg_km_per_user.toFixed(1)} km`}
          icon="account-arrow-right"
          color="#06b6d4"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff", // Colors.text assuming white
    marginBottom: 12,
  },
  statsGrid: {
    gap: 10,
  },
});
