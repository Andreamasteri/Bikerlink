import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];
type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

type AdminItem = {
  key: string;
  label: string;
  route?: string;
  action?: "backup-now";
  accentColor?: string;
} & (
  | { iconSet: "MaterialIcons"; icon: MaterialIconName }
  | { iconSet: "MaterialCommunityIcons"; icon: MaterialCommunityIconName }
  | { iconSet: "Ionicons"; icon: IoniconsName }
);

type AdminGroupHeader =
  | { headerIconSet: "MaterialIcons"; headerIcon: MaterialIconName }
  | { headerIconSet: "MaterialCommunityIcons"; headerIcon: MaterialCommunityIconName }
  | { headerIconSet: "Ionicons"; headerIcon: IoniconsName };

type AdminGroup = AdminGroupHeader & {
  title: string;
  items: AdminItem[];
};

const adminGroups: AdminGroup[] = [
  {
    title: "Utenti",
    headerIcon: "people",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "users", label: "Utenti", icon: "people", iconSet: "MaterialIcons", route: "/admin/users" },
      { key: "fake-users", label: "Utenti Fake", icon: "robot", iconSet: "MaterialCommunityIcons", route: "/admin/fake-users" },
      { key: "reports", label: "Segnalazioni", icon: "flag", iconSet: "MaterialIcons", route: "/admin/reports" },
      { key: "chats", label: "Chat Utenti", icon: "chatbubbles", iconSet: "Ionicons", route: "/admin/chats" },
    ],
  },
  {
    title: "Contenuti",
    headerIcon: "layers",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "workshops", label: "Officine", icon: "store", iconSet: "MaterialIcons", route: "/admin/workshops" },
      { key: "motoclubs", label: "Motoclub", icon: "shield", iconSet: "Ionicons", route: "/admin/motoclubs" },
      { key: "easter-eggs", label: "Easter Eggs", icon: "egg-easter", iconSet: "MaterialCommunityIcons", route: "/admin/easter-eggs" },
      { key: "ads", label: "Advertisement", icon: "campaign", iconSet: "MaterialIcons", route: "/admin/ads" },
    ],
  },
  {
    title: "Monitoraggio",
    headerIcon: "bar-chart",
    headerIconSet: "Ionicons",
    items: [
      { key: "analytics", label: "Analytics", icon: "analytics", iconSet: "MaterialIcons", route: "/admin/analytics" },
      { key: "performance", label: "Performance", icon: "speedometer", iconSet: "Ionicons", route: "/admin/performance" },
      { key: "db-debug", label: "DB Debug", icon: "database", iconSet: "MaterialCommunityIcons", route: "/admin/db-debug" },
    ],
  },
  {
    title: "Sistema",
    headerIcon: "settings",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "settings", label: "Impostazioni", icon: "settings", iconSet: "MaterialIcons", route: "/admin/settings" },
      { key: "invite-codes", label: "Codici Invito", icon: "gift", iconSet: "Ionicons", route: "/admin/invite-codes" },
      { key: "backup", label: "Backup automatici", icon: "cloud-upload", iconSet: "MaterialCommunityIcons", route: "/admin/backup" },
      { key: "backup-now", label: "Backup ora", icon: "play-circle", iconSet: "MaterialCommunityIcons", action: "backup-now", accentColor: "#22c55e" },
    ],
  },
];

function renderIcon(item: AdminItem, size = 28, color = Colors.accent) {
  switch (item.iconSet) {
    case "MaterialCommunityIcons":
      return <MaterialCommunityIcons name={item.icon} size={size} color={color} />;
    case "Ionicons":
      return <Ionicons name={item.icon} size={size} color={color} />;
    case "MaterialIcons":
      return <MaterialIcons name={item.icon} size={size} color={color} />;
  }
}

function renderGroupHeaderIcon(group: AdminGroup) {
  switch (group.headerIconSet) {
    case "MaterialCommunityIcons":
      return <MaterialCommunityIcons name={group.headerIcon} size={20} color={Colors.textSecondary} />;
    case "Ionicons":
      return <Ionicons name={group.headerIcon} size={20} color={Colors.textSecondary} />;
    case "MaterialIcons":
      return <MaterialIcons name={group.headerIcon} size={20} color={Colors.textSecondary} />;
  }
}

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [backingUp, setBackingUp] = useState(false);

  async function handleBackupNow() {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const url = new URL("/api/admin/backup/db", getApiUrl()).toString();
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Backup completato", `File: ${data.name}\nDimensione: ${formatBytes(data.size)}`);
      } else {
        Alert.alert("Errore backup", data.message || "Errore durante il backup");
      }
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Errore durante il backup");
    } finally {
      setBackingUp(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function handleItemPress(item: AdminItem) {
    if (item.action === "backup-now") {
      handleBackupNow();
    } else if (item.route) {
      router.push(item.route);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 20 },
      ]}
    >
      <Text style={styles.subtitle}>Gestisci tutti gli aspetti dell'app</Text>

      {adminGroups.map((group) => (
        <View key={group.title} style={styles.groupContainer}>
          <View style={styles.groupHeader}>
            {renderGroupHeaderIcon(group)}
            <Text style={styles.groupTitle}>{group.title}</Text>
          </View>
          <View style={styles.grid}>
            {group.items.map((section) => {
              const isAction = !!section.action;
              const iconColor = section.accentColor || Colors.accent;
              const isLoading = section.action === "backup-now" && backingUp;
              return (
                <TouchableOpacity
                  key={section.key}
                  style={[
                    styles.card,
                    isAction && section.accentColor
                      ? { borderColor: section.accentColor, borderWidth: 2 }
                      : null,
                  ]}
                  onPress={() => handleItemPress(section)}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <View style={[styles.cardIcon, isAction && section.accentColor ? { backgroundColor: section.accentColor + "20" } : null]}>
                    {isLoading
                      ? <ActivityIndicator size="small" color={iconColor} />
                      : renderIcon(section, 28, iconColor)
                    }
                  </View>
                  <Text style={[styles.cardLabel, isAction && section.accentColor ? { color: section.accentColor } : null]}>
                    {section.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  groupTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    textAlign: "center",
  },
});
