import React from "react";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import otaUpdates from "@/ota-updates.json";

interface OtaUpdate {
  updateNumber: number;
  publishedAt?: string;
  message?: string;
  note?: string;
  status?: string;
  platforms?: string[];
  updateGroupId?: string;
  [key: string]: unknown;
}

function formatOtaDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function statusColor(status?: string): string {
  if (status === "published") return Colors.accent;
  if (status === "superseded") return Colors.textSecondary;
  return Colors.textSecondary;
}

function statusLabel(status?: string): string {
  if (status === "published") return "attivo";
  if (status === "superseded") return "superato";
  return status || "—";
}

export default function OtaHistoryScreen() {
  const insets = useSafeAreaInsets();
  const updates = (otaUpdates as OtaUpdate[]).slice().reverse();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === "web" ? 67 : 0,
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      <Text style={styles.summary}>{updates.length} aggiornamenti totali</Text>

      {updates.map((u) => (
        <View key={u.updateNumber} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <MaterialCommunityIcons name="update" size={16} color={statusColor(u.status)} />
              <Text style={[styles.otaNumber, { color: statusColor(u.status) }]}>
                OTA-{u.updateNumber}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={[styles.statusText, { color: statusColor(u.status) }]}>
                {statusLabel(u.status)}
              </Text>
            </View>
          </View>

          <Text style={styles.message}>{u.message || "—"}</Text>

          <View style={styles.meta}>
            <Text style={styles.metaText}>{formatOtaDate(u.publishedAt)}</Text>
            {u.platforms && u.platforms.length > 0 && (
              <Text style={styles.metaText}>{u.platforms.join(", ")}</Text>
            )}
          </View>

          {u.note ? (
            <Text style={styles.note} numberOfLines={3}>{u.note}</Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  summary: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  otaNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.background,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  message: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 6,
    lineHeight: 20,
  },
  meta: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
});
