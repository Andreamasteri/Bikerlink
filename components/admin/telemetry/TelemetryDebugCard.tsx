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
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
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

interface BucketItem {
  bucketStart: string;
  at: string;
  total: number;
  events: number;
  errors: number;
}

interface BucketsData {
  minutes: number;
  buckets: BucketItem[];
}

interface PingResult {
  inserted: boolean;
  eventId: string | null;
}

const CHART_W = 280;
const CHART_H = 56;
const CHART_PAD_LEFT = 28;
const CHART_PAD_BOTTOM = 16;
const CHART_INNER_W = CHART_W - CHART_PAD_LEFT - 4;
const CHART_INNER_H = CHART_H - CHART_PAD_BOTTOM - 4;

function formatHour(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function SparklineChart({
  buckets,
  color,
  valueKey,
  label,
  emptyText,
}: {
  buckets: BucketItem[];
  color: string;
  valueKey: "total" | "errors";
  label: string;
  emptyText: string;
}) {
  if (buckets.length === 0) {
    return (
      <View style={sparkS.emptyWrap}>
        <Text style={sparkS.emptyLabel}>{label}</Text>
        <Text style={sparkS.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const values = buckets.map((b) => b[valueKey]);
  const maxVal = Math.max(...values, 1);
  const n = buckets.length;
  const barW = Math.max(2, Math.floor((CHART_INNER_W / n) * 0.7));
  const gap = CHART_INNER_W / n;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const colorBg = color + "22";

  return (
    <View style={sparkS.chartWrap}>
      <Text style={sparkS.chartLabel}>{label}</Text>
      <Svg width={CHART_W} height={CHART_H}>
        {/* Y-axis grid lines + labels */}
        {yTicks.map((tick, i) => {
          const y = 4 + CHART_INNER_H - (tick / maxVal) * CHART_INNER_H;
          return (
            <React.Fragment key={i}>
              <Line
                x1={CHART_PAD_LEFT}
                y1={y}
                x2={CHART_W - 4}
                y2={y}
                stroke="#374151"
                strokeWidth={0.5}
                strokeDasharray={i === 0 ? undefined : "2,2"}
              />
              <SvgText
                x={CHART_PAD_LEFT - 2}
                y={y + 3}
                fontSize={7}
                fill="#6b7280"
                textAnchor="end"
              >
                {tick > 999 ? `${Math.round(tick / 100) / 10}k` : String(tick)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Bars */}
        {buckets.map((b, i) => {
          const val = b[valueKey];
          const barH = Math.max(1, (val / maxVal) * CHART_INNER_H);
          const x = CHART_PAD_LEFT + i * gap + (gap - barW) / 2;
          const y = 4 + CHART_INNER_H - barH;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={y} width={barW} height={barH} fill={colorBg} rx={1} />
              <Rect x={x} y={y} width={barW} height={Math.min(2, barH)} fill={color} rx={1} />
            </React.Fragment>
          );
        })}

        {/* X-axis labels: first, middle, last — deduplicated to avoid key collisions on small datasets */}
        {Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1].filter((idx) => idx < n))).map((idx) => {
          const x = CHART_PAD_LEFT + idx * gap + gap / 2;
          return (
            <SvgText
              key={idx}
              x={x}
              y={CHART_H - 2}
              fontSize={7}
              fill="#6b7280"
              textAnchor="middle"
            >
              {formatHour(buckets[idx].bucketStart)}
            </SvgText>
          );
        })}
      </Svg>
      <View style={sparkS.statsRow}>
        <Text style={sparkS.statText}>
          max <Text style={[sparkS.statValue, { color }]}>{maxVal.toLocaleString("it-IT")}</Text>
        </Text>
        <Text style={sparkS.statText}>
          tot{" "}
          <Text style={[sparkS.statValue, { color }]}>
            {values.reduce((a, b) => a + b, 0).toLocaleString("it-IT")}
          </Text>
        </Text>
        <Text style={sparkS.statText}>
          {n} bucket / 24h
        </Text>
      </View>
    </View>
  );
}

const sparkS = StyleSheet.create({
  chartWrap: {
    marginBottom: 8,
  },
  chartLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
  },
  statText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  statValue: {
    fontFamily: "Inter_600SemiBold",
  },
  emptyWrap: {
    paddingVertical: 8,
  },
  emptyLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
});

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

  const { data: bucketsData, isLoading: loadingBuckets, refetch: refetchBuckets } =
    useQuery<BucketsData>({
      queryKey: ["/api/admin/watchdog/maps/buckets", 1440],
      queryFn: () => adminFetch("/api/admin/watchdog/maps/buckets?minutes=1440").then((r) => r.json()),
      staleTime: 60_000,
      refetchInterval: 120_000,
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

      {/* --- Trend 24h sparkline --- */}
      <View style={s.section}>
        <View style={s.feedHeader}>
          <Text style={s.sectionTitle}>Trend 24h</Text>
          <TouchableOpacity onPress={() => refetchBuckets()} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            {loadingBuckets ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Ionicons name="refresh" size={14} color={Colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.sparkRow}>
            <SparklineChart
              buckets={bucketsData?.buckets ?? []}
              color="#60a5fa"
              valueKey="total"
              label="Eventi totali / ora"
              emptyText="Nessun dato nelle ultime 24h"
            />
            <View style={s.sparkDivider} />
            <SparklineChart
              buckets={bucketsData?.buckets ?? []}
              color="#f87171"
              valueKey="errors"
              label="Errori / ora"
              emptyText="Nessun errore nelle ultime 24h"
            />
          </View>
        </ScrollView>
        <Text style={s.refreshHint}>Auto-refresh ogni 2m</Text>
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
  sparkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingVertical: 4,
  },
  sparkDivider: {
    width: 1,
    height: 80,
    backgroundColor: Colors.border,
    alignSelf: "center",
  },
});
