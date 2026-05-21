import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ServerRestart {
  id: string;
  startedAt: string;
  reason: string;
}

interface RestartHistory {
  total: number;
  restarts: ServerRestart[];
}

interface ServerRestartSectionProps {
  restartHistory?: RestartHistory;
  formatTimestamp: (iso: string) => string;
}

export const ServerRestartSection: React.FC<ServerRestartSectionProps> = ({
  restartHistory,
  formatTimestamp,
}) => {
  if (!restartHistory) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="refresh-circle-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Storico Riavvii</Text>
        <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
          <Text style={styles.badgeText}>{restartHistory.total}</Text>
        </View>
      </View>
      {restartHistory.restarts.slice(0, 10).map((r) => (
        <View key={r.id} style={styles.restartRow}>
          <Ionicons
            name={r.reason === "manual_restart" ? "hand-right-outline" : "flash-outline"}
            size={14}
            color={Colors.textMuted ?? "#888"}
          />
          <Text style={styles.restartReason}>
            {r.reason === "manual_restart" ? "Manuale" : "Automatico"}
          </Text>
          <Text style={styles.restartTime}>{formatTimestamp(r.startedAt)}</Text>
        </View>
      ))}
      {restartHistory.restarts.length === 0 && (
        <Text style={styles.emptyText}>Nessun riavvio registrato</Text>
      )}
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
  restartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  restartReason: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  restartTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  emptyText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
