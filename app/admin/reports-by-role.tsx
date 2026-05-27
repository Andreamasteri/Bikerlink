/**
 * Task #2531 — Vista report filtrata per ruolo dell'utente segnalato.
 * URL: /admin/reports-by-role?role=biker|zavorrina|club|moderator
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

const ROLES = [
  { key: "biker", label: "Biker" },
  { key: "zavorrina", label: "Zavorrine" },
  { key: "club", label: "Club" },
  { key: "moderator", label: "Moderatori" },
];

export default function ReportsByRoleScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [persistedRole, setPersistedRole] = useAdminFilterPersist<string>("reports-by-role", "biker");
  const role = (typeof params.role === "string" && params.role) || persistedRole;

  React.useEffect(() => {
    if (typeof params.role === "string" && params.role && params.role !== persistedRole) {
      setPersistedRole(params.role);
    }
  }, [params.role, persistedRole, setPersistedRole]);

  // L'endpoint /api/admin/reports filtra per `reportedUserId`, non per ruolo.
  // Recuperiamo tutto pending e filtriamo lato client per `reportedUserRole`.
  const { data: allReports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["/api/admin/reports", { status: "pending" }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/reports?status=pending&limit=500");
      return res.json();
    },
  });

  const reports = React.useMemo(() => allReports.filter((r) => (r.reportedUserRole ?? "biker") === role), [allReports, role]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.key}
            style={[styles.tab, role === r.key && styles.tabActive]}
            onPress={() => {
              setPersistedRole(r.key);
              router.setParams({ role: r.key });
            }}
          >
            <Text style={[styles.tabText, role === r.key && styles.tabTextActive]}>{r.label}</Text>
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
            : <Text style={styles.empty}>Nessuna segnalazione per questo ruolo</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: Colors.accent },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
