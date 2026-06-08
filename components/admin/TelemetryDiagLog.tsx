import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface TelemetryDiagEntry {
  ts: string;
  type: "ERROR" | "WARN" | "INFO";
  context: string;
  message: string;
  userId?: string | number;
  sessionId?: string;
  detail?: string;
}

interface TelemetryDiagResponse {
  entries: TelemetryDiagEntry[];
  count: number;
}

export function TelemetryDiagLog({ collapsed }: { collapsed: boolean }) {
  const [diagVisible, setDiagVisible] = useState(false);

  const { data, isLoading, refetch } = useQuery<TelemetryDiagResponse>({
    queryKey: ["/api/admin/telemetry/error-log"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/telemetry/error-log", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !collapsed && diagVisible,
    staleTime: 0,
    refetchOnMount: true,
  });

  function formatTs(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => {
          setDiagVisible((v) => !v);
          if (!diagVisible) refetch();
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="bug-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.title}>Log diagnostici pipeline</Text>
        {isLoading && <ActivityIndicator size="small" color={Colors.textSecondary} style={{ marginLeft: 6 }} />}
        <Ionicons name={diagVisible ? "chevron-up" : "chevron-down"} size={14} color={Colors.textSecondary} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>
      {diagVisible && (
        <View style={styles.log}>
          {(!data?.entries || data.entries.length === 0) && (
            <Text style={styles.empty}>Nessun evento registrato</Text>
          )}
          {data?.entries.slice(0, 20).map((entry, i) => {
            const color = entry.type === "ERROR" ? "#ef4444" : entry.type === "WARN" ? "#f59e0b" : Colors.textSecondary;
            return (
              <View key={i} style={styles.row}>
                <Text style={[styles.type, { color }]}>{entry.type}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.context}>{entry.context}</Text>
                  <Text style={styles.message}>{entry.message}</Text>
                  {!!entry.detail && <Text style={styles.detail} numberOfLines={2}>{entry.detail}</Text>}
                </View>
                <Text style={styles.ts}>{formatTs(entry.ts)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  title: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  log: {
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  empty: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  type: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    width: 34,
    marginTop: 1,
  },
  context: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.text,
    lineHeight: 15,
  },
  detail: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#ef4444",
    lineHeight: 14,
    marginTop: 2,
    opacity: 0.85,
  },
  ts: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textSecondary,
    marginLeft: 4,
    marginTop: 1,
  },
});
