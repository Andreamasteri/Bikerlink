import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface SystemStatusCardProps {
  backendUptimeSec: number;
  backendStartedAt: number;
  formatDuration: (totalSec: number) => string;
  formatTimestamp: (iso: string) => string;
}

export const SystemStatusCard: React.FC<SystemStatusCardProps> = ({
  backendUptimeSec,
  backendStartedAt,
  formatDuration,
  formatTimestamp,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="server-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Backend</Text>
        <View style={[styles.badge, { backgroundColor: "#44AA44" }]}>
          <Text style={styles.badgeText}>ONLINE</Text>
        </View>
      </View>
      <Text style={styles.uptimeTimer}>{formatDuration(backendUptimeSec)}</Text>
      <Text style={styles.startedAt}>
        Avviato: {formatTimestamp(new Date(backendStartedAt).toISOString())}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  uptimeTimer: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: 1,
  },
  startedAt: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 4,
  },
});
