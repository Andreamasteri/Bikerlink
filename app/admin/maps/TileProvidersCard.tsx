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

type SectionData = { title: TileCategory; data: ProviderItem[] };

const ALL_CATEGORIES: TileCategory[] = ["base", "topo", "satellite", "overlay"];

function groupByCategory(providers: ProviderItem[], filter: TileCategory | "all"): SectionData[] {
  const filtered = filter === "all" ? providers : providers.filter((p) => p.category === filter);
  const map: Record<string, ProviderItem[]> = {};
  for (const p of filtered) {
    (map[p.category] ??= []).push(p);
  }
  return ALL_CATEGORIES.filter((c) => map[c]?.length).map((c) => ({ title: c, data: map[c] }));
}

export function TileProvidersCard() {
  const [expanded, setExpanded] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState<TileCategory | "all">("all");

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
      queryClient.invalidateQueries({ queryKey: ["/api/settings/tile-providers"] });
    },
  });

  const sections = data ? groupByCategory(data.providers, categoryFilter) : [];
  const active = data?.providers.find((p) => p.isActive);

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
        <Text style={styles.currentLabel}> · {data?.providers.length ?? 0} provider</Text>
      </View>

      {expanded && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {(["all", ...ALL_CATEGORIES] as Array<"all" | TileCategory>).map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.filterChip, categoryFilter === cat && styles.filterChipActive]}
                onPress={() => setCategoryFilter(cat)}
              >
                <Text style={[styles.filterChipText, categoryFilter === cat && styles.filterChipTextActive]}>
                  {cat === "all" ? "Tutti" : cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
            )}
            renderItem={({ item }) => (
              <TileProviderRow
                item={item}
                onSelect={(id) => activeMutation.mutate(id)}
                isPending={activeMutation.isPending}
              />
            )}
          />
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
  filterRow: { marginTop: 12, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background, marginRight: 8,
  },
  filterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  filterChipText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text },
  filterChipTextActive: { color: Colors.accent, fontFamily: "Inter_500Medium" },
  sectionLabel: {
    fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6,
  },
});
