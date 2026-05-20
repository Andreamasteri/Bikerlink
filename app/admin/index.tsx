import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"];
type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

type AdminItem = {
  key: string;
  label: string;
  route?: string;
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
      { key: "stregatti", label: "Stregatti", icon: "robot", iconSet: "MaterialCommunityIcons", route: "/admin/stregatti" },
      { key: "blocks", label: "Blocchi", icon: "ban", iconSet: "Ionicons", route: "/admin/blocks" },
      { key: "reports", label: "Bugs & Co", icon: "flag", iconSet: "MaterialIcons", route: "/admin/reports" },
    ],
  },
  {
    title: "Contenuti",
    headerIcon: "layers",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "workshops", label: "Officine", icon: "store", iconSet: "MaterialIcons", route: "/admin/workshops" },
      { key: "motoclubs", label: "Clubs", icon: "shield", iconSet: "Ionicons", route: "/admin/motoclubs" },
      { key: "eventi", label: "Raduni", icon: "calendar", iconSet: "Ionicons", route: "/admin/eventi" },
      { key: "easter-eggs", label: "Easter Eggs", icon: "egg-easter", iconSet: "MaterialCommunityIcons", route: "/admin/easter-eggs" },
      { key: "ads", label: "Campagne", icon: "campaign", iconSet: "MaterialIcons", route: "/admin/ads" },
    ],
  },
  {
    title: "Monitoraggio",
    headerIcon: "bar-chart",
    headerIconSet: "Ionicons",
    items: [
      { key: "analytics", label: "Analytics", icon: "analytics", iconSet: "MaterialIcons", route: "/admin/analytics" },
      { key: "performance", label: "Performance", icon: "speedometer", iconSet: "Ionicons", route: "/admin/performance" },
      { key: "gps-errors", label: "GPS Error Log", icon: "location-sharp", iconSet: "Ionicons", route: "/admin/gps-errors" },
      { key: "gps-rejections", label: "GPS Rifiutati", icon: "alert-circle", iconSet: "Ionicons", route: "/admin/gps-rejections", accentColor: "#FF9500" },
      { key: "db-debug", label: "DB Debug", icon: "database", iconSet: "MaterialCommunityIcons", route: "/admin/db-debug" },
      { key: "db-tables", label: "Dimensioni DB", icon: "database-settings", iconSet: "MaterialCommunityIcons", route: "/admin/db-tables" },
      { key: "system", label: "System Monitor", icon: "pulse-outline", iconSet: "Ionicons", route: "/admin/system", accentColor: "#FF4444" },
      { key: "moderator-logs", label: "Log Moderatori", icon: "shield-account-outline", iconSet: "MaterialCommunityIcons", route: "/admin/moderator-logs" },
      { key: "crash-logs", label: "Log Riavvii", icon: "phone-alert", iconSet: "MaterialCommunityIcons", route: "/admin/crash-logs", accentColor: "#FF6B35" },
      { key: "visitatori", label: "Visitatori Sito", icon: "web", iconSet: "MaterialCommunityIcons", route: "/admin/visitatori", accentColor: "#22C55E" },
      { key: "ota-history", label: "Sistema OTA", icon: "update", iconSet: "MaterialCommunityIcons", route: "/admin/ota-history", accentColor: "#FF9500" },
    ],
  },
  {
    title: "Marketing",
    headerIcon: "email-newsletter",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "newsletter", label: "Newsletter", icon: "email-newsletter", iconSet: "MaterialCommunityIcons", route: "/admin/newsletter", accentColor: "#2196F3" },
    ],
  },
  {
    title: "Matching",
    headerIcon: "link-variant",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "match-inspector", label: "Match Inspector", icon: "account-search", iconSet: "MaterialCommunityIcons", route: "/admin/match-inspector", accentColor: "#2196F3" },
      { key: "match-control", label: "Controllo Sistema", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/match-control", accentColor: "#9C27B0" },
      { key: "match-health", label: "Match Health", icon: "heart-pulse", iconSet: "MaterialCommunityIcons", route: "/admin/match-health", accentColor: "#4CAF50" },
    ],
  },
  {
    title: "Sistema",
    headerIcon: "settings",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "settings", label: "Impostazioni", icon: "settings", iconSet: "MaterialIcons", route: "/admin/settings" },
      { key: "privacy", label: "Gestione Privacy", icon: "shield-lock", iconSet: "MaterialCommunityIcons", route: "/admin/privacy", accentColor: "#4CAF50" },
      { key: "invite-codes", label: "Codici Invito", icon: "gift", iconSet: "Ionicons", route: "/admin/invite-codes" },
      { key: "backup", label: "Backup automatici", icon: "cloud-upload", iconSet: "MaterialCommunityIcons", route: "/admin/backup" },
    ],
  },
  {
    title: "Traduzioni",
    headerIcon: "translate",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "traduzioni", label: "Traduzioni", icon: "translate", iconSet: "MaterialIcons", route: "/admin/traduzioni", accentColor: "#9C27B0" },
      { key: "tabella-lingue", label: "Tabella Lingue", icon: "table-large", iconSet: "MaterialCommunityIcons", route: "/admin/tabella-lingue", accentColor: "#9C27B0" },
    ],
  },
  {
    title: "Laboratorio",
    headerIcon: "flask",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "sensors", label: "Sensori", icon: "chip", iconSet: "MaterialCommunityIcons", route: "/admin/sensors", accentColor: "#FF9800" },
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

  function handleItemPress(item: AdminItem) {
    if (item.route) {
      router.push(item.route as Href);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 20, paddingTop: 0 },
      ]}
    >
      <Text style={styles.subtitle}>Gestisci tutti gli aspetti dell'app</Text>

      {adminGroups.map((group) => (
        <React.Fragment key={group.title}>
          <View style={styles.groupContainer}>
            <View style={styles.groupHeader}>
              {renderGroupHeaderIcon(group)}
              <Text style={styles.groupTitle}>{group.title}</Text>
            </View>
            <View style={styles.grid}>
              {group.items.map((section) => {
                const iconColor = section.accentColor || Colors.accent;
                return (
                  <TouchableOpacity
                    key={section.key}
                    style={styles.card}
                    onPress={() => handleItemPress(section)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardIcon}>
                      {renderIcon(section, 28, iconColor)}
                    </View>
                    <Text style={styles.cardLabel}>
                      {section.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </React.Fragment>
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
