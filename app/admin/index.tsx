import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

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

interface TelemetryStats {
  totalSamples: number;
  activeUsers: number;
  kmCollected: number;
  latestSample: string | null;
}

interface GHStatus {
  mode: "self-hosted" | "cloud" | "disabled";
  profile: string;
  healthy: boolean;
  url: string;
}

function GraphHopperCard() {
  const { data, isLoading, error } = useQuery<GHStatus>({
    queryKey: ["/api/admin/graphhopper-status"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/graphhopper-status", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const modeLabel: Record<string, string> = {
    "self-hosted": "Self-Hosted",
    cloud: "Cloud API",
    disabled: "Disabilitato",
  };
  const modeColor: Record<string, string> = {
    "self-hosted": "#22c55e",
    cloud: "#f59e0b",
    disabled: "#ef4444",
  };
  const color = data ? modeColor[data.mode] ?? "#6b7280" : "#6b7280";

  return (
    <View style={ghStyles.card}>
      <View style={ghStyles.cardHeader}>
        <MaterialCommunityIcons name="map-marker-path" size={18} color={color} />
        <Text style={ghStyles.cardTitle}>GraphHopper</Text>
        {isLoading && <ActivityIndicator size="small" color={color} style={{ marginLeft: "auto" }} />}
        {error && !isLoading && (
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" style={{ marginLeft: "auto" }} />
        )}
        {!isLoading && !error && data && (
          <View style={[ghStyles.healthDot, { backgroundColor: data.healthy ? "#22c55e" : "#ef4444", marginLeft: "auto" }]} />
        )}
      </View>
      <View style={ghStyles.row}>
        <View style={ghStyles.stat}>
          <Text style={[ghStyles.statValue, { color }]}>{data ? modeLabel[data.mode] ?? data.mode : "—"}</Text>
          <Text style={ghStyles.statLabel}>Modalità</Text>
        </View>
        <View style={ghStyles.divider} />
        <View style={ghStyles.stat}>
          <Text style={ghStyles.statValue}>{data ? data.profile : "—"}</Text>
          <Text style={ghStyles.statLabel}>Profilo</Text>
        </View>
        <View style={ghStyles.divider} />
        <View style={ghStyles.stat}>
          <Text style={[ghStyles.statValue, { color: data ? (data.healthy ? "#22c55e" : "#ef4444") : Colors.textSecondary }]}>
            {data ? (data.healthy ? "OK" : "Errore") : "—"}
          </Text>
          <Text style={ghStyles.statLabel}>Health</Text>
        </View>
      </View>
      {!isLoading && !error && data?.mode === "cloud" && (
        <View style={ghStyles.warningBanner}>
          <MaterialCommunityIcons name="alert-outline" size={13} color="#f59e0b" />
          <Text style={ghStyles.warningText}>Profilo motorcycle non disponibile su Cloud. Usando 'car'.</Text>
        </View>
      )}
    </View>
  );
}

const TELEMETRY_STALE_THRESHOLD_HOURS = 24;

function TelemetryCard() {
  const { data, isLoading, error } = useQuery<TelemetryStats>({
    queryKey: ["/api/admin/telemetry/stats"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/telemetry/stats", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  const isStale = data
    ? !data.latestSample ||
      (() => {
        const ts = new Date(data.latestSample!).getTime();
        return !Number.isFinite(ts) || Date.now() - ts > TELEMETRY_STALE_THRESHOLD_HOURS * 60 * 60 * 1000;
      })()
    : false;

  return (
    <View style={telStyles.card}>
      <View style={telStyles.cardHeader}>
        <MaterialCommunityIcons name="chart-line" size={18} color="#22c55e" />
        <Text style={telStyles.cardTitle}>Telemetria</Text>
        {isLoading && <ActivityIndicator size="small" color="#22c55e" style={{ marginLeft: "auto" }} />}
        {error && !isLoading && <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" style={{ marginLeft: "auto" }} />}
        {!isLoading && !error && isStale && (
          <MaterialCommunityIcons name="alert" size={16} color="#f59e0b" style={{ marginLeft: "auto" }} />
        )}
      </View>
      <View style={telStyles.statsRow}>
        <View style={telStyles.stat}>
          <Text style={telStyles.statValue}>{data ? data.totalSamples.toLocaleString("it-IT") : "—"}</Text>
          <Text style={telStyles.statLabel}>Campioni</Text>
        </View>
        <View style={telStyles.divider} />
        <View style={telStyles.stat}>
          <Text style={telStyles.statValue}>{data ? String(data.activeUsers) : "—"}</Text>
          <Text style={telStyles.statLabel}>Utenti attivi</Text>
        </View>
        <View style={telStyles.divider} />
        <View style={telStyles.stat}>
          <Text style={[telStyles.statValue, { color: "#22c55e" }]}>{data ? `${data.kmCollected.toLocaleString("it-IT")} km` : "—"}</Text>
          <Text style={telStyles.statLabel}>Km stimati</Text>
        </View>
      </View>
      {!isLoading && !error && isStale && (
        <View style={telStyles.staleWarning}>
          <MaterialCommunityIcons name="alert-outline" size={13} color="#f59e0b" />
          <Text style={telStyles.staleWarningText}>
            Nessun campione nelle ultime {TELEMETRY_STALE_THRESHOLD_HOURS}h
          </Text>
        </View>
      )}
      <View style={telStyles.lastSample}>
        <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textSecondary} />
        <Text style={telStyles.lastSampleText}>Ultimo campione: {data ? formatDate(data.latestSample) : "—"}</Text>
      </View>
    </View>
  );
}

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
      { key: "road-hazards", label: "Segnalazioni Stradali", icon: "alert-rhombus-outline", iconSet: "MaterialCommunityIcons", route: "/admin/road-hazards", accentColor: "#f59e0b" },
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
      { key: "telemetry", label: "Telemetria", icon: "chart-line", iconSet: "MaterialCommunityIcons", route: "/admin/telemetry", accentColor: "#22C55E" },
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

      <TelemetryCard />
      <GraphHopperCard />

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

const ghStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 4,
  },
  warningText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#f59e0b",
    flex: 1,
  },
});

const telStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  staleWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
  },
  staleWarningText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#f59e0b",
    flex: 1,
  },
  lastSample: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  lastSampleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
