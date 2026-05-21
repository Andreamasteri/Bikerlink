import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface OtaErrorEntry {
  error: string;
  failCount: number;
  updateId: string;
  runtimeVersion: string;
  timestamp: string;
}

interface OtaErrorListProps {
  errors: OtaErrorEntry[];
  formatTimestamp: (iso: string) => string;
}

export const OtaErrorList: React.FC<OtaErrorListProps> = ({
  errors,
  formatTimestamp,
}) => {
  if (errors.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="alert-circle-outline" size={18} color="#FF4444" />
        <Text style={styles.cardTitle}>Errori OTA checker</Text>
        <View style={[styles.badge, { backgroundColor: "#FF4444" }]}>
          <Text style={styles.badgeText}>{errors.length}</Text>
        </View>
      </View>
      <Text style={styles.hintText}>
        Errori catturati dal background worker nelle ultime ore.
      </Text>
      {errors.map((err, idx) => (
        <View key={idx} style={styles.row}>
          <Ionicons name="warning-outline" size={14} color="#FF4444" />
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={styles.rowReason} numberOfLines={2}>
              {err.error}
            </Text>
            <Text style={styles.rowTime}>
              rv={err.runtimeVersion} · uid={err.updateId.substring(0, 12)} · fail#
              {err.failCount} · {formatTimestamp(err.timestamp)}
            </Text>
          </View>
        </View>
      ))}
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
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  rowReason: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  rowTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
