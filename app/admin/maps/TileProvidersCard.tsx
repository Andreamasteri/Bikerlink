import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SectionList, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { TileProviderRow, type ProviderItem, type TileCategory } from "./TileProviderRow";

interface ProvidersResponse {
  providers: ProviderItem[];
  activeId: string;
}

type PlatformTab = "mobile" | "web" | "archiviati";
type SectionData = { title: TileCategory; data: ProviderItem[] };

const ALL_CATEGORIES: TileCategory[] = ["base", "topo", "satellite", "overlay"];

const PLATFORM_TABS: Array<{ id: PlatformTab; label: string; icon: "phone-portrait-outline" | "desktop-outline" | "archive-outline" }> = [
  { id: "mobile", label: "Mobile", icon: "phone-portrait-outline" },
  { id: "web", label: "Web", icon: "desktop-outline" },
  { id: "archiviati", label: "Archiviati", icon: "archive-outline" },
];

function groupByCategory(providers: ProviderItem[]): SectionData[] {
  const map: Record<string, ProviderItem[]> = {};
  for (const p of providers) {
    (map[p.category] ??= []).push(p);
  }
  return ALL_CATEGORIES.filter((c) => map[c]?.length).map((c) => ({ title: c, data: map[c] }));
}

function filterByTab(providers: ProviderItem[], tab: PlatformTab): ProviderItem[] {
  if (tab === "archiviati") return providers.filter((p) => p.archived);
  return providers.filter((p) => !p.archived && (p.platform === tab || p.platform === "both"));
}

export function TileProvidersCard() {
  const [expanded, setExpanded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<PlatformTab>("mobile");
  const [archivedOpen, setArchivedOpen] = React.useState(false);

  const { data, isLoading } = useQuery<ProvidersResponse>({
    queryKey: ["/api/admin/maps/providers"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/maps/providers", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const activeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", "/api/admin/maps/providers/active", { id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maps/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps"] });
      // Invalidate both the bare key and the platform-filtered key used by mobile clients.
      queryClient.invalidateQueries({ queryKey: ["/api/settings/tile-providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/tile-providers?platform=mobile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/tile-providers?platform=web"] });
    },
  });

  const visibleProviders = data ? filterByTab(data.providers, activeTab) : [];
  const sections = groupByCategory(visibleProviders);
  const active = data?.providers.find((p) => p.isActive);

  const mobileCnt = data ? filterByTab(data.providers, "mobile").length : 0;
  const webCnt = data ? filterByTab(data.providers, "web").length : 0;
  const archivedCnt = data ? filterByTab(data.providers, "archiviati").length : 0;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Ionicons name="layers-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Tile Provider</Text>
        {(isLoading || activeMutation.isPending) && (
          <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 8 }} />
        )}
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      <View style={styles.currentRow}>
        <Text style={styles.currentLabel}>Attivo: </Text>
        <Text style={styles.currentValue}>{active?.label ?? data?.activeId ?? "—"}</Text>
        <Text style={styles.currentLabel}> · {data?.providers.filter((p) => !p.archived).length ?? 0} attivi</Text>
      </View>

      {expanded && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
            {PLATFORM_TABS.map((tab) => {
              const count = tab.id === "mobile" ? mobileCnt : tab.id === "web" ? webCnt : archivedCnt;
              const isActive = activeTab === tab.id;
              const isArchived = tab.id === "archiviati";
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tabChip,
                    isActive && (isArchived ? styles.tabChipArchivedActive : styles.tabChipActive),
                  ]}
                  onPress={() => setActiveTab(tab.id)}
                >
                  <Ionicons
                    name={tab.icon}
                    size={13}
                    color={isActive ? (isArchived ? "#6b7280" : Colors.accent) : Colors.textSecondary}
                  />
                  <Text style={[styles.tabChipText, isActive && (isArchived ? styles.tabChipTextArchivedActive : styles.tabChipTextActive)]}>
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View style={[styles.tabCount, isActive && (isArchived ? styles.tabCountArchived : styles.tabCountActive)]}>
                      <Text style={[styles.tabCountText, isActive && (isArchived ? styles.tabCountTextArchived : styles.tabCountTextActive)]}>
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {activeTab === "archiviati" && (
            <TouchableOpacity
              style={styles.archivedToggle}
              onPress={() => setArchivedOpen((v) => !v)}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={14} color="#6b7280" />
              <Text style={styles.archivedToggleText}>
                {archivedOpen ? "Nascondi" : "Mostra"} provider archiviati ({archivedCnt})
              </Text>
              <Ionicons name={archivedOpen ? "chevron-up" : "chevron-down"} size={14} color="#6b7280" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          )}

          {(activeTab !== "archiviati" || archivedOpen) && (
            <>
              {activeTab === "archiviati" && (
                <View style={styles.archivedNote}>
                  <Ionicons name="archive-outline" size={13} color="#6b7280" />
                  <Text style={styles.archivedNoteText}>
                    I provider archiviati non sono selezionabili né caricati dall'app.
                  </Text>
                </View>
              )}
              <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderSectionHeader={({ section }) => (
                  <Text style={[styles.sectionLabel, activeTab === "archiviati" && styles.sectionLabelArchived]}>
                    {section.title.toUpperCase()}
                  </Text>
                )}
                renderItem={({ item }) => (
                  <TileProviderRow
                    item={item}
                    onSelect={(id) => activeMutation.mutate(id)}
                    isPending={activeMutation.isPending}
                  />
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Nessun provider in questa sezione</Text>
                }
              />
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  currentRow: { flexDirection: "row", flexWrap: "wrap" },
  currentLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  currentValue: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.accent },
  tabRow: { marginTop: 12, marginBottom: 8 },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    marginRight: 8,
  },
  tabChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  tabChipArchivedActive: { borderColor: "#6b7280", backgroundColor: "#6b728015" },
  tabChipText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  tabChipTextActive: { color: Colors.accent, fontFamily: "Inter_500Medium" },
  tabChipTextArchivedActive: { color: "#6b7280", fontFamily: "Inter_500Medium" },
  tabCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabCountActive: { backgroundColor: Colors.accent + "30" },
  tabCountArchived: { backgroundColor: "#6b728030" },
  tabCountText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.textSecondary },
  tabCountTextActive: { color: Colors.accent },
  tabCountTextArchived: { color: "#6b7280" },
  archivedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#6b728010",
    marginBottom: 8,
  },
  archivedToggleText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#6b7280", flex: 1 },
  archivedNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#6b728010",
    marginBottom: 8,
  },
  archivedNoteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#6b7280",
    flex: 1,
    lineHeight: 16,
  },
  sectionLabel: {
    fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6,
  },
  sectionLabelArchived: { color: "#6b728080" },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
});
