import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { t } from "@/lib/i18n";

const adminSections = [
  { key: "users", label: "Utenti", icon: "people" as const, iconSet: "MaterialIcons", route: "/admin/users" },
  { key: "workshops", label: "Officine", icon: "store" as const, iconSet: "MaterialIcons", route: "/admin/workshops" },
  { key: "easter-eggs", label: "Easter Eggs", icon: "egg-easter" as const, iconSet: "MaterialCommunityIcons", route: "/admin/easter-eggs" },
  { key: "ads", label: "Campagne Syneco", icon: "campaign" as const, iconSet: "MaterialIcons", route: "/admin/ads" },
  { key: "reports", label: "Segnalazioni", icon: "flag" as const, iconSet: "MaterialIcons", route: "/admin/reports" },
  { key: "analytics", label: "Analytics", icon: "analytics" as const, iconSet: "MaterialIcons", route: "/admin/analytics" },
  { key: "settings", label: "Impostazioni", icon: "settings" as const, iconSet: "MaterialIcons", route: "/admin/settings" },
];

function getIcon(iconSet: string, icon: string) {
  if (iconSet === "MaterialCommunityIcons") {
    return <MaterialCommunityIcons name={icon as any} size={28} color={Colors.dark.accent} />;
  }
  return <MaterialIcons name={icon as any} size={28} color={Colors.dark.accent} />;
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

      <View style={styles.grid}>
        {adminSections.map((section) => (
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    padding: 16,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47%",
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.dark.text,
    textAlign: "center",
  },
});
