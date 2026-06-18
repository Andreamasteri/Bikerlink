import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

export interface TelemetryHealthData {
  maps: { count24h: number; lastEvent: string | null; killSwitchEnabled: boolean };
  device: { count24h: number; lastEvent: string | null };
  ota: { count24h: number; lastEvent: string | null; bootSuccessTotal: number };
}

function adminFetch(path: string): Promise<Response> {
  return fetch(new URL(path, getApiUrl()).toString(), {
    headers: { ...(authFetchHeaders()) },
    credentials: "include",
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  });
}

function formatAge(iso: string | null | undefined): string {
  if (!iso) return "Mai ricevuto";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "< 1 minuto fa";
    if (mins < 60) return `${mins} min fa`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h fa`;
    return `${Math.floor(hours / 24)}g fa`;
  } catch { return iso ?? ""; }
}

function PipelineRow({
  label,
  icon,
  count24h,
  lastEvent,
  extra,
  killSwitchOff,
}: {
  label: string;
  icon: React.ReactNode;
  count24h: number;
  lastEvent: string | null;
  extra?: string;
  killSwitchOff?: boolean;
}) {
  const isStale = count24h === 0;
  const statusColor = killSwitchOff ? "#f59e0b" : isStale ? "#ef4444" : "#22c55e";
  const statusLabel = killSwitchOff ? "Kill-switch OFF" : isStale ? "⚠ Nessun dato recente" : "OK";

  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{formatAge(lastEvent)}{extra ? ` · ${extra}` : ""}</Text>
        </View>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.count, { color: count24h > 0 ? "#22c55e" : "#94a3b8" }]}>{count24h}</Text>
        <Text style={[s.status, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

export function TelemetryHealthCard() {
  const qc = useQueryClient();
  const { data: health, isLoading, refetch } = useQuery<TelemetryHealthData>({
    queryKey: ["/api/admin/telemetry-health"],
    queryFn: () => adminFetch("/api/admin/telemetry-health").then((r) => r.json()),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const pingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(new URL("/api/admin/telemetry-health/ping", getApiUrl()).toString(), {
        method: "POST",
        headers: authFetchHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ ok: boolean; maps_count_24h: number }>;
    },
    onSuccess: (data) => {
      Alert.alert("Pipeline OK", `Evento test inserito. Mappe 24h: ${data.maps_count_24h} eventi.`);
      refetch();
      qc.invalidateQueries({ queryKey: ["/api/admin/telemetry-health"] });
    },
    onError: (err) => {
      Alert.alert("Errore", `Ping fallito: ${(err as Error).message}`);
    },
  });

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <MaterialCommunityIcons name="pulse" size={16} color={Colors.accent} />
        <Text style={s.cardTitle}>Salute Pipeline Telemetria</Text>
        {isLoading && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: "auto" }} />}
      </View>
      <Text style={s.cardSub}>Eventi ricevuti nelle ultime 24h · Ultimo evento ricevuto</Text>

      {health ? (
        <>
          <PipelineRow
            label="Mappe"
            icon={<MaterialCommunityIcons name="map" size={16} color="#60a5fa" style={{ marginRight: 8 }} />}
            count24h={health.maps.count24h}
            lastEvent={health.maps.lastEvent}
            killSwitchOff={!health.maps.killSwitchEnabled}
          />
          <PipelineRow
            label="Device Metrics"
            icon={<MaterialCommunityIcons name="cellphone" size={16} color="#a78bfa" style={{ marginRight: 8 }} />}
            count24h={health.device.count24h}
            lastEvent={health.device.lastEvent}
          />
          <PipelineRow
            label="OTA Boot"
            icon={<MaterialCommunityIcons name="update" size={16} color="#fb923c" style={{ marginRight: 8 }} />}
            count24h={health.ota.count24h}
            lastEvent={health.ota.lastEvent}
            extra={`boot_success totali: ${health.ota.bootSuccessTotal}`}
          />
        </>
      ) : !isLoading ? (
        <Text style={s.errorText}>Errore caricamento stato pipeline</Text>
      ) : null}

      <TouchableOpacity
        style={[s.pingBtn, pingMutation.isPending && { opacity: 0.6 }]}
        onPress={() => pingMutation.mutate()}
        disabled={pingMutation.isPending}
        activeOpacity={0.8}
      >
        {pingMutation.isPending
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="flash" size={14} color="#fff" />
        }
        <Text style={s.pingBtnText}>Invia evento test</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  cardSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  rowLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  rowSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  count: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  status: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  pingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  pingBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#ef4444",
    textAlign: "center",
    paddingVertical: 8,
  },
});
