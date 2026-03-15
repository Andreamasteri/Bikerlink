import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

const adminGroups = [
  {
    title: "Utenti",
    icon: "people" as const,
    iconSet: "MaterialIcons",
    items: [
      { key: "users", label: "Utenti", icon: "people" as const, iconSet: "MaterialIcons", route: "/admin/users" },
      { key: "fake-users", label: "Utenti Fake", icon: "robot" as const, iconSet: "MaterialCommunityIcons", route: "/admin/fake-users" },
      { key: "reports", label: "Segnalazioni", icon: "flag" as const, iconSet: "MaterialIcons", route: "/admin/reports" },
      { key: "chats", label: "Chat Utenti", icon: "chatbubbles" as const, iconSet: "Ionicons", route: "/admin/chats" },
    ],
  },
  {
    title: "Contenuti",
    icon: "layers" as const,
    iconSet: "MaterialIcons",
    items: [
      { key: "workshops", label: "Officine", icon: "store" as const, iconSet: "MaterialIcons", route: "/admin/workshops" },
      { key: "motoclubs", label: "Motoclub", icon: "shield" as const, iconSet: "Ionicons", route: "/admin/motoclubs" },
      { key: "easter-eggs", label: "Easter Eggs", icon: "egg-easter" as const, iconSet: "MaterialCommunityIcons", route: "/admin/easter-eggs" },
      { key: "ads", label: "Advertisement", icon: "campaign" as const, iconSet: "MaterialIcons", route: "/admin/ads" },
    ],
  },
  {
    title: "Monitoraggio",
    icon: "bar-chart" as const,
    iconSet: "Ionicons",
    items: [
      { key: "analytics", label: "Analytics", icon: "analytics" as const, iconSet: "MaterialIcons", route: "/admin/analytics" },
      { key: "performance", label: "Performance", icon: "speedometer" as const, iconSet: "Ionicons", route: "/admin/performance" },
    ],
  },
  {
    title: "Sistema",
    icon: "settings" as const,
    iconSet: "MaterialIcons",
    items: [
      { key: "settings", label: "Impostazioni", icon: "settings" as const, iconSet: "MaterialIcons", route: "/admin/settings" },
    ],
  },
];

function getIcon(iconSet: string, icon: string, size = 28, color = Colors.accent) {
  if (iconSet === "MaterialCommunityIcons") {
    return <MaterialCommunityIcons name={icon as any} size={size} color={color} />;
  }
  if (iconSet === "Ionicons") {
    return <Ionicons name={icon as any} size={size} color={color} />;
  }
  return <MaterialIcons name={icon as any} size={size} color={color} />;
}

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
            {getIcon(group.iconSet, group.icon, 20, Colors.textSecondary)}
            <Text style={styles.groupTitle}>{group.title}</Text>
          </View>
          <View style={styles.grid}>
            {group.items.map((section) => (
              <TouchableOpacity
                key={section.key}
                style={styles.card}
                onPress={() => router.push(section.route as any)}
                activeOpacity={0.7}
              >
                <View style={styles.cardIcon}>
                  {getIcon(section.iconSet, section.icon)}
                </View>
                <Text style={styles.cardLabel}>{section.label}</Text>
              </TouchableOpacity>
            ))}
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
