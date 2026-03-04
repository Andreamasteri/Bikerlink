import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ModeratorLogEntry {
  id: string;
  moderatorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  createdAt: string;
}

function getActionIcon(action: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  if (action.includes("approve")) return { name: "checkmark-circle", color: Colors.success };
  if (action.includes("reject")) return { name: "close-circle", color: Colors.error };
  return { name: "document-text", color: Colors.accent };
}

function getActionLabel(action: string): string {
  switch (action) {
    case "approve_photo": return "Foto approvata";
    case "reject_photo": return "Foto rifiutata";
    default: return action;
  }
}

function LogItem({ item }: { item: ModeratorLogEntry }) {
  const icon = getActionIcon(item.action);

  return (
    <View style={styles.logItem}>
      <View style={[styles.iconContainer, { backgroundColor: icon.color + "20" }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.logContent}>
        <Text style={styles.logAction}>{getActionLabel(item.action)}</Text>
        {item.details ? (
          <Text style={styles.logDetails} numberOfLines={2}>{item.details}</Text>
        ) : null}
        <Text style={styles.logMeta}>
          {item.targetType} · {new Date(item.createdAt).toLocaleString("it-IT")}
        </Text>
      </View>
    </View>
  );
}

export default function ModeratorLogsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { data: logs, isLoading } = useQuery<ModeratorLogEntry[]>({
    queryKey: ["/api/moderator/logs"],
  });

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, webTopInset) }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Moderazione</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : !logs || logs.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={64} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun log di moderazione</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          renderItem={({ item }) => <LogItem item={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  list: {
    padding: 16,
  },
  logItem: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    alignItems: "center",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  logContent: {
    flex: 1,
    gap: 4,
  },
  logAction: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  logDetails: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  logMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});
