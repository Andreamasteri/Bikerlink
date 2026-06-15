import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Switch,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

interface DebugEvent {
  id: string;
  event: string;
  component: string | null;
  platform: string | null;
  appVersion: string | null;
  createdAt: string;
}

interface RideSummary {
  total: number;
  lastAt: string | null;
}

interface DebugEventsData {
  mapsEvents: DebugEvent[];
  rideSummary: RideSummary;
}

interface MapsFlags {
  flags: {
    telemetry: boolean;
    collector: boolean;
    llm: boolean;
    alerts: boolean;
  };
}

type FlagKey = "telemetry" | "collector" | "llm" | "alerts";

const FLAG_LABELS: Record<FlagKey, string> = {
  telemetry: "Telemetria client",
  collector: "Collector",
  llm: "Diagnosi LLM",
  alerts: "Alert push",
};

function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, getApiUrl()).toString(), {
    ...init,
    headers: { ...(authFetchHeaders()), ...(init?.headers ?? {}) },
    credentials: "include",
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  });
}

function formatAge(iso: string | null | undefined): string {
  if (!iso) return "Mai";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const secs = Math.floor(diffMs / 1000);
    if (secs < 60) return `${secs}s fa`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m fa`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h fa`;
    return `${Math.floor(hours / 24)}g fa`;
  } catch {
    return iso ?? "";
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso ?? "—";
  }
}

interface PingResult {
  inserted: boolean;
  eventId: string | null;
}

export function TelemetryDebugCard() {
  const qc = useQueryClient();
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [togglingFlag, setTogglingFlag] = useState<FlagKey | null>(null);

  const { data: debugData, isLoading: loadingEvents, refetch: refetchEvents } =
    useQuery<DebugEventsData>({
      queryKey: ["/api/admin/telemetry/debug-events"],
      queryFn: () => adminFetch("/api/admin/telemetry/debug-events").then((r) => r.json()),
      staleTime: 8_000,
      refetchInterval: 10_000,
    });

  const { data: flagsData, isLoading: loadingFlags, refetch: refetchFlags } =
    useQuery<MapsFlags>({
      queryKey: ["/api/admin/watchdog/maps/flags"],
      queryFn: () => adminFetch("/api/admin/watchdog/maps/flags").then((r) => r.json()),
      staleTime: 8_000,
      refetchInterval: 15_000,
    });

  const pingMutation = useMutation({
    mutationFn: async (): Promise<PingResult> => {
      const res = await adminFetch("/api/admin/telemetry/debug-ping", { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      setPingResult(data);
      setPingError(null);
      setTimeout(() => {
        refetchEvents();
        qc.invalidateQueries({ queryKey: ["/api/admin/telemetry/debug-events"] });
      }, 500);
    },
    onError: (err) => {
      setPingResult(null);
      setPingError((err as Error).message);
    },
  });

  const toggleFlag = async (flag: FlagKey, current: boolean) => {
    setTogglingFlag(flag);
    try {
      await adminFetch("/api/admin/watchdog/maps/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag, enabled: !current }),
      });
      await refetchFlags();
      qc.invalidateQueries({ queryKey: ["/api/admin/watchdog/maps/flags"] });
    } catch {
      // silently fail — next refetch will restore correct state
    } finally {
      setTogglingFlag(null);
    }
  };

  const flags = flagsData?.flags;
  const events = debugData?.mapsEvents ?? [];
  const rideSummary = debugData?.rideSummary;

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <MaterialCommunityIcons name="bug-outline" size={16} color="#a78bfa" />
        <Text style={s.cardTitle}>Debug Pipeline</Text>
        {(loadingEvents || loadingFlags) && (
          <ActivityIndicator size="small" color="#a78bfa" style={{ marginLeft: "auto" }} />
        )}
      </View>
      <Text style={s.cardSub}>Feed eventi live · Ping test · Kill-switch watchdog</Text>

      {/* --- Kill-switch flags --- */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Kill-switch Maps Watchdog</Text>
        {(["telemetry", "collector", "llm", "alerts"] as FlagKey[]).map((flag) => {
          const enabled = flags?.[flag] ?? true;
          const isToggling = togglingFlag === flag;
          return (
            <View key={flag} style={s.flagRow}>
              <View style={s.flagLeft}>
                <View style={[s.flagDot, { backgroundColor: enabled ? "#22c55e" : "#ef4444" }]} />
                <Text style={s.flagLabel}>{FLAG_LABELS[flag]}</Text>
              </View>
              {isToggling ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <Switch
                  value={enabled}
                  onValueChange={() => toggleFlag(flag, enabled)}
                  disabled={loadingFlags || togglingFlag !== null}
                  trackColor={{ false: "#374151", true: "#22c55e44" }}
                  thumbColor={enabled ? "#22c55e" : "#6b7280"}
                  ios_backgroundColor="#374151"
                />
              )}
            </View>
          );
        })}
      </View>

      {/* --- Ping test --- */}
      <View style={s.section}>
        <View style={s.pingRow}>
          <TouchableOpacity
            style={[s.pingBtn, pingMutation.isPending && { opacity: 0.6 }]}
            onPress={() => {
              setPingResult(null);
              setPingError(null);
              pingMutation.mutate();
            }}
            disabled={pingMutation.isPending}
            activeOpacity={0.8}
          >
            {pingMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="flash" size={14} color="#fff" />
            )}
            <Text style={s.pingBtnText}>Invia evento test</Text>
          </TouchableOpacity>

          {pingResult !== null && (
            <View style={[s.pingBadge, { backgroundColor: pingResult.inserted ? "#22c55e22" : "#ef444422" }]}>
              <Ionicons
                name={pingResult.inserted ? "checkmark-circle" : "close-circle"}
                size={14}
                color={pingResult.inserted ? "#22c55e" : "#ef4444"}
              />
              <Text style={[s.pingBadgeText, { color: pingResult.inserted ? "#22c55e" : "#ef4444" }]}>
                {pingResult.inserted ? "OK" : "FAIL"}
              </Text>
            </View>
          )}
          {pingError && (
            <View style={[s.pingBadge, { backgroundColor: "#ef444422" }]}>
              <Ionicons name="close-circle" size={14} color="#ef4444" />
              <Text style={[s.pingBadgeText, { color: "#ef4444" }]}>FAIL</Text>
            </View>
          )}
        </View>
        {pingResult?.eventId && (
          <Text style={s.pingDetail}>ID: {pingResult.eventId.slice(0, 18)}…</Text>
        )}
        {pingError && (
          <Text style={[s.pingDetail, { color: "#ef4444" }]}>{pingError}</Text>
        )}
      </View>

      {/* --- Ride telemetry summary --- */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Ride Telemetry</Text>
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{rideSummary?.total?.toLocaleString("it-IT") ?? "—"}</Text>
            <Text style={s.summaryLabel}>Campioni totali</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{formatAge(rideSummary?.lastAt)}</Text>
            <Text style={s.summaryLabel}>Ultimo campione</Text>
          </View>
        </View>
      </View>

      {/* --- Live events feed --- */}
      <View style={s.section}>
        <View style={s.feedHeader}>
          <Text style={s.sectionTitle}>Ultimi 20 eventi maps_telemetry_events</Text>
          <TouchableOpacity onPress={() => refetchEvents()} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="refresh" size={14} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {events.length === 0 && !loadingEvents && (
          <Text style={s.emptyText}>Nessun evento registrato</Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tableScroll}>
          <View>
            {/* Header */}
            <View style={[s.tableRow, s.tableHead]}>
              {["event", "component", "platform", "version", "created_at"].map((col) => (
                <Text key={col} style={[s.tableCell, s.tableHeadCell, colWidth(col)]}>
                  {col}
                </Text>
              ))}
            </View>
            {/* Rows */}
            {events.map((ev, idx) => (
              <View key={ev.id} style={[s.tableRow, idx % 2 === 0 && s.tableRowAlt]}>
                <Text style={[s.tableCell, s.eventCell, colWidth("event")]} numberOfLines={1}>
                  {ev.event}
                </Text>
                <Text style={[s.tableCell, colWidth("component")]} numberOfLines={1}>
                  {ev.component ?? "—"}
                </Text>
                <Text style={[s.tableCell, colWidth("platform")]} numberOfLines={1}>
                  {ev.platform ?? "—"}
                </Text>
                <Text style={[s.tableCell, colWidth("version")]} numberOfLines={1}>
                  {ev.appVersion ?? "—"}
                </Text>
                <Text style={[s.tableCell, colWidth("created_at")]} numberOfLines={1}>
                  {formatDateTime(ev.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <Text style={s.refreshHint}>Auto-refresh ogni 10s</Text>
      </View>
    </View>
  );
}

function colWidth(col: string): object {
  const widths: Record<string, number> = {
    event: 130,
    component: 140,
    platform: 70,
    version: 80,
    created_at: 130,
  };
  return { width: widths[col] ?? 100 };
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
    marginBottom: 14,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  flagLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  flagLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  pingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  pingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pingBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  pingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pingBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  pingDetail: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  summaryLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
  },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tableScroll: {
    maxHeight: 260,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: Colors.background,
  },
  tableHead: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 2,
  },
  tableCell: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.text,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeadCell: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: "uppercase",
  },
  eventCell: {
    fontFamily: "Inter_500Medium",
    color: "#60a5fa",
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  refreshHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "right",
    marginTop: 6,
  },
});
