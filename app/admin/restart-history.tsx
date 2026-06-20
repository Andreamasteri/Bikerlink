import React from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

type RestartCategory = "cold_start" | "restart" | "crash" | "unknown";

interface RestartEvent {
  id: string;
  startedAt: string;
  reason: string;
  category: RestartCategory;
  reasonLabel: string;
  isCrash: boolean;
}

interface RestartHistoryResponse {
  total: number;
  restarts: RestartEvent[];
}

const CRASH_COLOR = "#FF3B30";
const COLD_COLOR = "#0A84FF";
const RESTART_COLOR = "#34C759";

function categoryVisual(category: RestartCategory): {
  color: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
} {
  switch (category) {
    case "crash":
      return { color: CRASH_COLOR, icon: "alert-octagon" };
    case "cold_start":
      return { color: COLD_COLOR, icon: "power" };
    case "restart":
      return { color: RESTART_COLOR, icon: "restart" };
    default:
      return { color: "#8E8E93", icon: "help-circle-outline" };
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function RestartHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isRefetching } =
    useQuery<RestartHistoryResponse>({
      queryKey: ["/api/admin/restart-history"],
      queryFn: async () => {
        const res = await apiRequest("GET", "/api/admin/restart-history");
        return res.json() as Promise<RestartHistoryResponse>;
      },
      staleTime: 30_000,
    });

  const restarts = data?.restarts ?? [];
  const total = data?.total ?? 0;
  const crashCount = restarts.filter((r) => r.isCrash).length;

  function renderItem({ item }: { item: RestartEvent }) {
    const { color, icon } = categoryVisual(item.category);
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: item.isCrash ? `${CRASH_COLOR}55` : colors.border,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
          <MaterialCommunityIcons name={icon} size={22} color={color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.reasonLabel, { color: colors.text }]} numberOfLines={1}>
              {item.reasonLabel}
            </Text>
            <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
              <Text style={[styles.badgeText, { color }]}>
                {item.isCrash ? "CRASH" : item.category === "cold_start" ? "COLD" : "OK"}
              </Text>
            </View>
          </View>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDateTime(item.startedAt)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : isError && !data ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Errore caricamento storico
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={restarts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                {total} {total === 1 ? "riavvio registrato" : "riavvii registrati"}
                {crashCount > 0 ? ` · ${crashCount} crash` : ""}
              </Text>
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                Eventi più recenti in alto
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="history" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Nessun riavvio registrato
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 12,
  },
  list: { padding: 16 },
  headerWrap: { marginBottom: 12 },
  summaryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  legendText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
