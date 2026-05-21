import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface DatabaseSectionProps {
  isCleanupRunning: boolean;
  onCacheCleanup: () => void;
  isPurging: boolean;
  onPurgeNonAdminUsers: () => void;
  t: (key: string) => string;
}

export const DatabaseSection: React.FC<DatabaseSectionProps> = ({
  isCleanupRunning,
  onCacheCleanup,
  isPurging,
  onPurgeNonAdminUsers,
  t,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="database-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>{t("admin.database")}</Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, isCleanupRunning && styles.actionBtnDisabled]}
          onPress={onCacheCleanup}
          disabled={isCleanupRunning}
        >
          {isCleanupRunning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="trash-outline" size={16} color="#fff" />
          )}
          <Text style={styles.actionBtnText}>{t("admin.cleanupCache")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: "#CC0000" }, isPurging && styles.actionBtnDisabled]}
          onPress={onPurgeNonAdminUsers}
          disabled={isPurging}
        >
          {isPurging ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="nuclear-outline" size={16} color="#fff" />
          )}
          <Text style={styles.actionBtnText}>{t("admin.purgeDb")}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hintText}>
        La pulizia cache rimuove file temporanei e log obsoleti.
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
});
