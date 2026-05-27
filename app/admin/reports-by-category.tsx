/**
 * Task #2531 — Vista report filtrata per categoria.
 * URL: /admin/reports-by-category?cat=aggressive|harassment|...
 */
import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { ReportRow, type Report } from "@/components/admin/reports/ReportRow";
import { useAdminFilterPersist } from "@/hooks/useAdminFilterPersist";

const CATEGORIES = [
  { key: "aggressive", label: "Aggressivo" },
  { key: "harassment", label: "Molestia" },
  { key: "fake_profile", label: "Profilo Falso" },
  { key: "no_show", label: "No-Show" },
  { key: "opportunist", label: "Opportunista" },
  { key: "group_misconduct", label: "Cattiva condotta" },
  { key: "dangerous_riding", label: "Pericoloso" },
  { key: "other", label: "Altro" },
];

export default function ReportsByCategoryScreen() {
  const params = useLocalSearchParams<{ cat?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [persistedCat, setPersistedCat] = useAdminFilterPersist<string>("reports-by-category", "aggressive");
  const cat = (typeof params.cat === "string" && params.cat) || persistedCat;

  React.useEffect(() => {
    if (typeof params.cat === "string" && params.cat && params.cat !== persistedCat) {
      setPersistedCat(params.cat);
    }
  }, [params.cat, persistedCat, setPersistedCat]);

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["/api/admin/reports", { category: cat, status: "pending" }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/reports?category=${encodeURIComponent(cat)}&status=pending`);
      return res.json();
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.tab, cat === c.key && styles.tabActive]}
            onPress={() => {
              setPersistedCat(c.key);
              router.setParams({ cat: c.key });
            }}
          >
            <Text style={[styles.tabText, cat === c.key && styles.tabTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ReportRow report={item} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.accent} />
            : <Text style={styles.empty}>Nessuna segnalazione in questa categoria</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  tabTextActive: { color: Colors.accent },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
