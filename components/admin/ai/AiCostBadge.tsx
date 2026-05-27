/**
 * Task #2532 — Badge stato AI (budget, provider attivi, ultimi 24h).
 * Compatto, da inserire in header/cards.
 */
import React from "react";
import { Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface HubCard {
  state: "ok" | "warn" | "frozen";
  budgetPct: number;
  providersAvailable: number;
  providersTotal: number;
  queuePending: number;
  analyzed24h: number;
  anomalies24h: number;
  acceptedDrafts7d: number;
  totalDrafts7d: number;
}

export default function AiCostBadge({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const { data, isLoading } = useQuery<HubCard>({
    queryKey: ["/api/admin/ai/hub-card"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai/hub-card")).json(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const color = data?.state === "frozen" ? Colors.error
    : data?.state === "warn" ? Colors.warning : Colors.success;
  const label = data?.state === "frozen" ? "Budget esaurito"
    : data?.state === "warn" ? `Budget ${Math.round((data?.budgetPct ?? 0) * 100)}%`
    : "AI attiva";

  return (
    <TouchableOpacity
      style={[styles.badge, { borderColor: color }]}
      onPress={onPress ?? (() => router.push("/admin/ai-moderation-stats" as never))}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <>
          <MaterialCommunityIcons name="robot-outline" size={14} color={color} />
          <Text style={[styles.text, { color }]}>{label}</Text>
          {data ? (
            <Text style={styles.subText}>
              {data.providersAvailable}/{data.providersTotal} • {data.analyzed24h} 24h
              {data.anomalies24h > 0 ? ` • ⚠️${data.anomalies24h}` : ""}
            </Text>
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  text: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  subText: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
});
