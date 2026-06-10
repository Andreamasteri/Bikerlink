import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { TelemetryCard, GraphHopperCard, ValhallaCard, NominatimCard } from "@/components/admin/AdminStatsCards";
import { ServerEfficiencyCard } from "@/components/admin/ServerEfficiencyCard";
import { ThinkCentreCard } from "@/components/admin/ThinkCentreCard";
import { ThinkCentreEfficiencyCard } from "@/components/admin/ThinkCentreEfficiencyCard";
import { RoutingCoordinationCard } from "@/components/admin/RoutingCoordinationCard";
import { RoutingCloudBanner } from "@/components/admin/RoutingCloudBanner";
import { WhisperChainCard } from "@/components/admin/WhisperChainCard";
import { MatchingMonitorCard } from "@/components/admin/MatchingMonitorCard";
import { SystemHealthContainer } from "@/components/admin/SystemHealthContainer";
import type { SystemStatuses, DotStatus } from "@/components/admin/SystemHealthContainer";

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

const OPEN_BY_DEFAULT = new Set<string>();

/*
 * SCELTA PROGETTUALE — Refetch al rimount del pannello admin
 *
 * Le card del pannello (ServerEfficiencyCard, ThinkCentreEfficiencyCard,
 * ThinkCentreCard, GraphHopperCard, TelemetryCard) usano React Query con
 * `refetchOnMount: true` (esplicito) e `refetchInterval` per i polling continui.
 *
 * Comportamento al rimount (es. tab switch o navigazione avanti/indietro):
 * - Se i dati in cache sono ancora fresh (< staleTime), React Query li mostra
 *   immediatamente senza fare una nuova richiesta di rete → esperienza fluida.
 * - Se i dati sono stale (>= staleTime), React Query avvia automaticamente un
 *   refetch in background al momento del rimount → dati sempre aggiornati.
 *
 * NON è stato implementato un pattern di caricamento sequenziale (card1Done…
 * card4Done / settledRef) perché:
 * 1. Ogni card interroga un endpoint indipendente — il parallelismo è corretto.
 * 2. React Query gestisce il ciclo stale/refetch nativamente senza stato manuale.
 * 3. Un reset manuale dei flag al rimount introdurrebbe complessità ingiustificata
 *    e potrebbe causare flash di loading superflui su dati ancora freschi.
 *
 * Se in futuro si volesse caricare le card in sequenza (es. per ridurre il
 * carico sul server al mount), si può usare `enabled` condizionale su ciascuna
 * query, pilotato dallo stato `isSuccess` della query precedente.
 */

const adminGroups: AdminGroup[] = [
  {
    title: "Utenti",
    headerIcon: "people",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "users", label: "Utenti", icon: "people", iconSet: "MaterialIcons", route: "/admin/users" },
      { key: "stregatti", label: "Stregatti", icon: "robot", iconSet: "MaterialCommunityIcons", route: "/admin/stregatti" },
      { key: "blocks", label: "Blocchi", icon: "ban", iconSet: "Ionicons", route: "/admin/blocks" },
    ],
  },
  // Task #2531 — gruppo "Report" autonomo: hub + tutte le sotto-viste.
  {
    title: "Report",
    headerIcon: "flag-variant",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "reports-hub", label: "Hub Report", icon: "view-dashboard-variant", iconSet: "MaterialCommunityIcons", route: "/admin/reports-hub", accentColor: "#FF3B30" },
      { key: "reports", label: "Coda Segnalazioni", icon: "flag", iconSet: "MaterialIcons", route: "/admin/reports", accentColor: "#FF9500" },
      { key: "reports-by-category", label: "Per Categoria", icon: "shape-outline", iconSet: "MaterialCommunityIcons", route: "/admin/reports-by-category", accentColor: "#0EA5E9" },
      { key: "reports-by-role", label: "Per Ruolo", icon: "account-group-outline", iconSet: "MaterialCommunityIcons", route: "/admin/reports-by-role", accentColor: "#10B981" },
      { key: "reports-patterns", label: "Pattern", icon: "chart-bell-curve", iconSet: "MaterialCommunityIcons", route: "/admin/reports-patterns", accentColor: "#E91E63" },
      { key: "false-reports", label: "Falsi Report", icon: "shield-alert-outline", iconSet: "MaterialCommunityIcons", route: "/admin/false-reports", accentColor: "#9C27B0" },
      { key: "active-bans", label: "Ban Attivi", icon: "account-cancel-outline", iconSet: "MaterialCommunityIcons", route: "/admin/active-bans", accentColor: "#FF3B30" },
      { key: "moderator-logs", label: "Log Moderatori", icon: "shield-account-outline", iconSet: "MaterialCommunityIcons", route: "/admin/moderator-logs", accentColor: "#6366F1" },
      { key: "reports-thresholds", label: "Soglie & Policy", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/reports-thresholds", accentColor: "#22C55E" },
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
      { key: "device-stats", label: "Dispositivi", icon: "cellphone-check", iconSet: "MaterialCommunityIcons", route: "/admin/device-stats", accentColor: "#6366F1" },
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
      // Task #2527 — Hub sempre come prima voce del gruppo Matching.
      { key: "matching-hub", label: "Hub Matching", icon: "view-dashboard-variant", iconSet: "MaterialCommunityIcons", route: "/admin/matching-hub", accentColor: "#0EA5E9" },
      { key: "match-engine", label: "Motore Matching", icon: "engine", iconSet: "MaterialCommunityIcons", route: "/admin/match-engine", accentColor: "#FF9500" },
      { key: "match-rules", label: "Regole Matching", icon: "table-large", iconSet: "MaterialCommunityIcons", route: "/admin/match-rules", accentColor: "#10B981" },
      { key: "match-inspector", label: "Match Inspector", icon: "account-search", iconSet: "MaterialCommunityIcons", route: "/admin/match-inspector", accentColor: "#2196F3" },
      { key: "match-control", label: "Controllo Sistema", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/match-control", accentColor: "#9C27B0" },
      { key: "match-health", label: "Match Health", icon: "heart-pulse", iconSet: "MaterialCommunityIcons", route: "/admin/match-health", accentColor: "#4CAF50" },
      { key: "matching-telemetry", label: "Telemetria", icon: "chart-line", iconSet: "MaterialCommunityIcons", route: "/admin/matching-telemetry", accentColor: "#22C55E" },
      { key: "ab", label: "A/B Esperimenti", icon: "flask-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ab", accentColor: "#E91E63" },
    ],
  },
  {
    title: "Sistema",
    headerIcon: "settings",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "ai-hub", label: "Hub AI", icon: "robot-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ai-hub", accentColor: "#FF6600" },
      { key: "ai-assistant", label: "AI Assistant Utenti", icon: "account-question-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ai-assistant", accentColor: "#FF6600" },
      { key: "system-health", label: "AI System Watchdog", icon: "shield-check", iconSet: "MaterialCommunityIcons", route: "/admin/system-health", accentColor: "#22c55e" },
      { key: "whisper-config", label: "Voce & Trascrizione", icon: "microphone-settings", iconSet: "MaterialCommunityIcons", route: "/admin/whisper-config", accentColor: "#8B5CF6" },
      { key: "settings", label: "Impostazioni", icon: "settings", iconSet: "MaterialIcons", route: "/admin/settings" },
      { key: "legal-docs", label: "Manualistica", icon: "document-text-outline", iconSet: "Ionicons", route: "/admin/legal-docs", accentColor: "#0EA5E9" },
      { key: "privacy", label: "Gestione Privacy", icon: "shield-lock", iconSet: "MaterialCommunityIcons", route: "/admin/privacy", accentColor: "#4CAF50" },
      { key: "invite-codes", label: "Codici Invito", icon: "gift", iconSet: "Ionicons", route: "/admin/invite-codes" },
      { key: "backup", label: "Backup automatici", icon: "cloud-upload", iconSet: "MaterialCommunityIcons", route: "/admin/backup" },
      { key: "backup-preview", label: "Esplora Backup", icon: "database-search", iconSet: "MaterialCommunityIcons", route: "/admin/backup-preview", accentColor: "#F59E0B" },
      { key: "exports", label: "Export Dati", icon: "database-export", iconSet: "MaterialCommunityIcons", route: "/admin/exports", accentColor: "#10B981" },
      { key: "tags", label: "Sistema Tag", icon: "tag-multiple", iconSet: "MaterialCommunityIcons", route: "/admin/tags", accentColor: "#9C27B0" },
      { key: "text-aliases", label: "Alias Testo", icon: "spellcheck", iconSet: "MaterialCommunityIcons", route: "/admin/text-aliases", accentColor: "#FF9800" },
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
    title: "Sistema Mappe",
    headerIcon: "map-outline",
    headerIconSet: "Ionicons",
    items: [
      { key: "maps", label: "Sistema Mappe", icon: "map-outline", iconSet: "Ionicons", route: "/admin/maps", accentColor: "#0EA5E9" },
    ],
  },
  {
    title: "Sistema Routing",
    headerIcon: "routes",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "routing-hub", label: "Hub Routing", icon: "view-dashboard-variant", iconSet: "MaterialCommunityIcons", route: "/admin/routing-hub", accentColor: "#0EA5E9" },
      { key: "routing-control", label: "Controllo Routing", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/routing-control", accentColor: "#9C27B0" },
      { key: "routing-health", label: "Routing Health", icon: "heart-pulse", iconSet: "MaterialCommunityIcons", route: "/admin/routing-health", accentColor: "#4CAF50" },
      { key: "telemetry-users", label: "Sessioni Utenti", icon: "map-marker-path", iconSet: "MaterialCommunityIcons", route: "/admin/telemetry-users", accentColor: "#22C55E" },
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
  {
    title: "Controllo OTA",
    headerIcon: "cloud-download",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "ota", label: "Aggiornamenti OTA", icon: "cloud-download", iconSet: "MaterialCommunityIcons", route: "/admin/ota", accentColor: "#0EA5E9" },
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

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const UNKNOWN_STATUSES: SystemStatuses = {
  thinkcentre: "unknown",
  graphhopper: "unknown",
  valhalla: "unknown",
  nominatim: "unknown",
  ollama: "unknown",
  whisper: "unknown",
  ufw: "unknown",
  redis: "unknown",
  postgres: "unknown",
  pgadmin: "unknown",
  nginx: "unknown",
  uptimeKuma: "unknown",
  routing: "unknown",
  matching: "unknown",
};

async function fetchSystemProbe(): Promise<SystemStatuses> {
  const res = await fetch(new URL("/api/admin/system-probe", getApiUrl()).toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<SystemStatuses>;
}

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [systemStatuses, setSystemStatuses] = useState<SystemStatuses>(UNKNOWN_STATUSES);

  const { data: probeData } = useQuery<SystemStatuses>({
    queryKey: ["/api/admin/system-probe"],
    queryFn: fetchSystemProbe,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });

  useEffect(() => {
    if (!probeData) return;
    setSystemStatuses((prev) => ({ ...prev, ...probeData }));
  }, [probeData]);

  const handleThinkCentreStatuses = useCallback(
    (s: Pick<SystemStatuses, "thinkcentre" | "graphhopper" | "valhalla" | "nominatim" | "ollama" | "whisper" | "ufw" | "redis" | "postgres" | "pgadmin" | "nginx" | "uptimeKuma">) => {
      setSystemStatuses((prev) => ({ ...prev, ...s }));
    },
    []
  );

  const handleRoutingStatus = useCallback((routing: DotStatus) => {
    setSystemStatuses((prev) => ({ ...prev, routing }));
  }, []);

  const initialCollapsed = useMemo<Record<string, boolean>>(
    () => Object.fromEntries(adminGroups.map((g) => [g.title, !OPEN_BY_DEFAULT.has(g.title)])),
    []
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);

  function toggleGroup(title: string) {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  function handleItemPress(item: AdminItem) {
    if (item.route) {
      router.push(item.route as Href);
    }
  }

  const normalizedSearch = normalize(search);
  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return adminGroups;
    return adminGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          normalize(item.label).includes(normalizedSearch)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [normalizedSearch]);

  const isSearching = normalizedSearch.length > 0;
  const hasInput = search.length > 0;
  const isEmpty = isSearching && filteredGroups.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 20, paddingTop: 0 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Cerca funzione…"
          placeholderTextColor={Colors.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          testID="admin-search-input"
        />
        {hasInput && (
          <TouchableOpacity
            onPress={() => setSearch("")}
            style={styles.clearButton}
            testID="admin-search-clear"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {!isSearching && (
        <>
          <RoutingCloudBanner onPress={() => router.push("/admin/routing-health" as never)} />
          <SystemHealthContainer statuses={systemStatuses}>
            <ServerEfficiencyCard />
            <ThinkCentreEfficiencyCard />
            <ThinkCentreCard onStatuses={handleThinkCentreStatuses} />
            <ValhallaCard />
            <NominatimCard />
            <RoutingCoordinationCard onStatus={handleRoutingStatus} />
            <GraphHopperCard />
            <TelemetryCard />
            <WhisperChainCard />
            <MatchingMonitorCard onStatus={(s) => setSystemStatuses((prev) => ({ ...prev, matching: s as DotStatus }))} />
          </SystemHealthContainer>
        </>
      )}

      {isEmpty && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Nessuna funzione trovata</Text>
        </View>
      )}

      {filteredGroups.map((group) => {
        const isCollapsed = !isSearching && !!collapsed[group.title];
        return (
          <React.Fragment key={group.title}>
            <View style={styles.groupContainer}>
              <TouchableOpacity
                style={styles.groupHeader}
                onPress={() => toggleGroup(group.title)}
                activeOpacity={0.7}
                disabled={isSearching}
              >
                <View style={styles.groupHeaderLeft}>
                  {renderGroupHeaderIcon(group)}
                  <Text style={styles.groupTitle}>{group.title}</Text>
                </View>
                {!isSearching && (
                  <Ionicons
                    name={isCollapsed ? "chevron-down" : "chevron-up"}
                    size={18}
                    color={Colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
              {!isCollapsed && (
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
              )}
            </View>
          </React.Fragment>
        );
      })}
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 12,
  },
  clearButton: {
    marginLeft: 8,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyStateText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 4,
  },
  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
