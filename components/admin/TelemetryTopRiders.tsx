import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { fetchWithCause } from "./AdminTelemetryCard";

interface TopRider {
  userId: number;
  username: string;
  sampleCount: number;
  km: number;
}

interface TopRidersResponse {
  riders: TopRider[];
}

export function TelemetryTopRiders({ collapsed }: { collapsed: boolean }) {
  const { data, isLoading, error } = useQuery<TopRidersResponse>({
    queryKey: ["/api/admin/telemetry-top-riders"],
    queryFn: async () => {
      const res = await fetchWithCause(new URL("/api/admin/telemetry-top-riders?limit=5", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      return res.json();
    },
    staleTime: 60_000,
    enabled: !collapsed,
    refetchOnMount: true,
  });

  const ridersErrorDetail = (error as (Error & { detail?: string }) | null)?.detail;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="podium" size={13} color={Colors.textSecondary} />
        <Text style={styles.title}>Top rider — ultime 24h</Text>
        {isLoading && <ActivityIndicator size="small" color="#22c55e" style={{ marginLeft: "auto" }} />}
      </View>
      {!isLoading && error && (
        <View style={styles.errorBlock}>
          <View style={styles.errorRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#ef4444" />
            <Text style={styles.errorText}>Errore caricamento rider</Text>
          </View>
          {!!ridersErrorDetail && (
            <Text style={styles.errorDetail} numberOfLines={3}>{ridersErrorDetail}</Text>
          )}
        </View>
      )}
      {!isLoading && !error && (!data?.riders || data.riders.length === 0) && (
        <Text style={styles.empty}>Nessun rider attivo nelle ultime 24h</Text>
      )}
      {data?.riders.map((rider, idx) => (
        <View key={rider.userId} style={styles.riderRow}>
          <Text style={styles.rank}>{idx + 1}</Text>
          <MaterialCommunityIcons name="account-circle-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.name} numberOfLines={1}>{rider.username}</Text>
          <View style={styles.stats}>
            <Text style={styles.samples}>{rider.sampleCount.toLocaleString("it-IT")}</Text>
            <Text style={styles.statLabel}>camp.</Text>
          </View>
          <View style={styles.kmBadge}>
            <Text style={styles.km}>{rider.km} km</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  empty: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  errorBlock: {
    paddingVertical: 4,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#ef4444",
  },
  errorDetail: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#ef4444",
    opacity: 0.8,
    marginTop: 3,
    lineHeight: 15,
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rank: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.textSecondary,
    width: 14,
    textAlign: "center",
  },
  name: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  stats: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  samples: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  kmBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  km: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#22c55e",
  },
});
