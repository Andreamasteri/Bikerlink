// Task #162 — TC AI Hub health tile for admin system-health screen.
// Reads from /api/admin/watchdog/ai-hub-health (latest ai_hub signals + in-process state).
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getQueryFnWithTimeout } from "@/lib/query-client";

export interface AiHubHealth {
  configured: boolean;
  reachable: boolean;
  lastProbeAt: string | null;
  latencyMs: number | null;
  consecutiveFailures: number;
  error: string | null;
}

function formatRelTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s fa`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m fa`;
  return `${Math.floor(diff / 3600)}h fa`;
}

export function AiHubHealthCard() {
  const { data, isLoading, isError } = useQuery<AiHubHealth>({
    queryKey: ["/api/admin/watchdog/ai-hub-health"],
    queryFn: getQueryFnWithTimeout<AiHubHealth>(8_000),
    refetchInterval: 30_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>Dati ai-hub non disponibili.</Text>
      </View>
    );
  }

  const { configured, reachable, lastProbeAt, latencyMs, consecutiveFailures, error } = data;

  const status: "OK" | "DOWN" | "UNCONFIGURED" = !configured
    ? "UNCONFIGURED"
    : reachable
      ? "OK"
      : "DOWN";

  const statusColor =
    status === "OK" ? "#22C55E" :
    status === "DOWN" ? "#ef4444" :
    "#6B7280";

  const statusLabel =
    status === "OK" ? "RAGGIUNGIBILE" :
    status === "DOWN" ? "IRRAGGIUNGIBILE" :
    "NON CONFIGURATO";

  const iconName: React.ComponentProps<typeof MaterialCommunityIcons>["name"] =
    status === "OK" ? "check-circle-outline" :
    status === "DOWN" ? "close-circle-outline" :
    "help-circle-outline";

  return (
    <View style={[styles.card, { borderColor: `${statusColor}44`, backgroundColor: `${statusColor}10` }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={iconName} size={20} color={statusColor} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            TC AI Hub — {statusLabel}
          </Text>
          {lastProbeAt && (
            <Text style={styles.meta}>
              Ultima probe: {formatRelTime(lastProbeAt)}
              {latencyMs != null ? `  ·  ${latencyMs}ms` : ""}
            </Text>
          )}
          {!lastProbeAt && configured && (
            <Text style={styles.meta}>Nessuna probe ancora eseguita</Text>
          )}
          {!configured && (
            <Text style={styles.meta}>
              AI_HUB_URL / AI_HUB_GATE_TOKEN non impostati
            </Text>
          )}
        </View>
        {configured && !reachable && consecutiveFailures > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{consecutiveFailures}×</Text>
          </View>
        )}
      </View>
      {status === "DOWN" && error && (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-outline" size={13} color="#f87171" />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
        </View>
      )}
      {status === "DOWN" && (
        <Text style={styles.hint}>
          Verifica il servizio ai-hub (pm2, porta 4405) sul ThinkCentre, il proxy /ai-hub/* e i secret AI_HUB_URL/AI_HUB_GATE_TOKEN. search_manual continua sul motore pgvector locale.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
  meta: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 2,
  },
  muted: {
    color: "#9ca3af",
    fontSize: 12,
  },
  badge: {
    backgroundColor: "#7f1d1d",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
    alignSelf: "flex-start",
  },
  badgeText: {
    color: "#fca5a5",
    fontSize: 11,
    fontWeight: "700" as const,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 2,
  },
  errorText: {
    color: "#f87171",
    fontSize: 11,
    flex: 1,
  },
  hint: {
    color: "#9ca3af",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
});
