import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Switch } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders, queryClient } from "@/lib/query-client";
import { ErrorHistory, EventLog, GraphHopperBlock, ProbeLog } from "./ThinkCentreCardParts";
import type { HealthEvent, AreaServiceHealth, ProbeLogEntry } from "./ThinkCentreCardParts";
import { ValhallaBlock, NominatimBlock } from "./ThinkCentreValhallaNominatimBlocks";
import type { ValhallaDetailedHealth, NominatimDetailedHealth } from "./ThinkCentreValhallaNominatimBlocks";
import type { DotStatus, SystemStatuses } from "./SystemHealthContainer";

type ServiceKey = "valhalla" | "ollama" | "whisper" | "nominatim";

interface ServiceHealth {
  key: ServiceKey;
  label: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  tileVersion?: string;
  tokenMissing?: boolean;
  history: { timestamp: number; error: string }[];
  probeLog?: ProbeLogEntry[];
}

interface ThinkCentreHealth {
  overall: "green" | "yellow" | "red" | "idle";
  onlineCount: number;
  configuredCount: number;
  services: ServiceHealth[];
  graphhopperConfigured: boolean;
  graphhopperUrl: string | null;
  graphhopperTokenMissing?: boolean;
  graphhopperAreas: AreaServiceHealth[];
  valhallaDetail?: ValhallaDetailedHealth;
  nominatimDetail?: NominatimDetailedHealth;
  tokenFingerprints?: {
    graphhopper: string | null;
    valhalla: string | null;
    ollama: string | null;
    whisper: string | null;
    nominatim: string | null;
  };
  checkedAt: number;
}

interface HealthEventsResponse {
  events: HealthEvent[];
}

const SERVICE_ICONS: Record<ServiceKey, keyof typeof MaterialCommunityIcons.glyphMap> = {
  valhalla: "routes",
  ollama: "robot-outline",
  whisper: "microphone-outline",
  nominatim: "map-search-outline",
};

const OVERALL_COLOR: Record<ThinkCentreHealth["overall"], string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  idle: "#6b7280",
};

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons
      name={collapsed ? "chevron-down" : "chevron-up"}
      size={18}
      color={Colors.textSecondary}
    />
  );
}

function serviceColor(s: ServiceHealth): string {
  if (!s.configured) return "#6b7280";
  return s.ok ? "#22c55e" : "#ef4444";
}

function serviceStatusLabel(s: ServiceHealth): string {
  if (!s.configured) return "Non configurato";
  if (s.ok) {
    const base = s.latencyMs != null ? `Online · ${s.latencyMs} ms` : "Online";
    return s.tileVersion ? `${base} · tile ${s.tileVersion}` : base;
  }
  if (s.tokenMissing) return "Offline · token assente in Replit";
  return s.error ? `Offline · ${s.error}` : "Offline";
}

function overallToStatus(overall: ThinkCentreHealth["overall"]): DotStatus {
  if (overall === "green") return "ok";
  if (overall === "yellow") return "degraded";
  if (overall === "red") return "offline";
  return "unknown";
}

function serviceToStatus(s: ServiceHealth | undefined): DotStatus {
  if (!s || !s.configured) return "unknown";
  return s.ok ? "ok" : "offline";
}

function ghToStatus(areas: AreaServiceHealth[], configured: boolean): DotStatus {
  if (!configured || areas.length === 0) return "unknown";
  const anyOk = areas.some((a) => a.ok);
  const allOk = areas.every((a) => a.ok);
  if (allOk) return "ok";
  if (anyOk) return "degraded";
  return "offline";
}

export function ThinkCentreCard({
  onStatuses,
}: {
  onStatuses?: (s: Pick<SystemStatuses, "thinkcentre" | "graphhopper" | "valhalla" | "nominatim">) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);

  const { data, isLoading, isFetching, error, refetch } = useQuery<ThinkCentreHealth>({
    queryKey: ["/api/admin/thinkcentre-health"],
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const combined = signal
        ? AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal
        : controller.signal;
      try {
        const res = await fetch(new URL("/api/admin/thinkcentre-health", getApiUrl()).toString(), {
          headers: { ...(await authFetchHeaders()) },
          credentials: "include",
          signal: combined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ThinkCentreHealth>;
      } finally {
        clearTimeout(timer);
      }
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchOnMount: true,
  });

  const { data: eventsData } = useQuery<HealthEventsResponse>({
    queryKey: ["/api/admin/thinkcentre-events"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/thinkcentre-events", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !collapsed,
  });

  const { data: pushData, isLoading: pushLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/admin/settings/thinkcentre-service-push"],
    queryFn: async () => {
      const res = await fetch(
        new URL("/api/admin/settings/thinkcentre-service-push", getApiUrl()).toString(),
        { headers: { ...(await authFetchHeaders()) }, credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const pushMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(
        new URL("/api/admin/settings/thinkcentre-service-push", getApiUrl()).toString(),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
          credentials: "include",
          body: JSON.stringify({ enabled }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/thinkcentre-service-push"] });
    },
  });

  useEffect(() => {
    if (!data || !onStatuses) return;
    const vSvc = data.services.find((s) => s.key === "valhalla");
    const nSvc = data.services.find((s) => s.key === "nominatim");
    onStatuses({
      thinkcentre: overallToStatus(data.overall),
      graphhopper: ghToStatus(data.graphhopperAreas, data.graphhopperConfigured),
      valhalla: serviceToStatus(vSvc),
      nominatim: serviceToStatus(nSvc),
    });
  }, [data, onStatuses]);

  const headerColor = data ? OVERALL_COLOR[data.overall] : "#6b7280";

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
        testID="thinkcentre-card-header"
      >
        <MaterialCommunityIcons name="home-assistant" size={18} color={headerColor} />
        <Text style={styles.cardTitle}>ThinkCentre</Text>
        <View style={styles.headerRight}>
          {isLoading && <ActivityIndicator size="small" color={headerColor} />}
          {error && !isLoading && (
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
          )}
          {!isLoading && !error && data && (
            <Text style={styles.headerCount}>
              {data.onlineCount}/{data.configuredCount}
            </Text>
          )}
          {!isLoading && !error && data && (
            <View style={[styles.healthDot, { backgroundColor: headerColor }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.list}>
          {error && !isLoading && (
            <Text style={styles.errorText}>Impossibile leggere lo stato dei servizi.</Text>
          )}
          {data && data.graphhopperConfigured && (
            <GraphHopperBlock
              areas={data.graphhopperAreas}
              fingerprint={data.tokenFingerprints?.graphhopper ?? null}
              url={data.graphhopperUrl}
              tokenMissing={data.graphhopperTokenMissing}
            />
          )}
          <ValhallaBlock
            detail={error ? null : (data?.valhallaDetail ?? null)}
            fingerprint={error ? null : (data?.tokenFingerprints?.valhalla ?? null)}
            isLoading={isLoading}
            hasError={!!error}
          />
          <NominatimBlock
            detail={error ? null : (data?.nominatimDetail ?? null)}
            fingerprint={error ? null : (data?.tokenFingerprints?.nominatim ?? null)}
            isLoading={isLoading}
            hasError={!!error}
          />
          {data?.services
            .filter((s) => s.key !== "valhalla" && s.key !== "nominatim")
            .map((s) => {
            const fp = data.tokenFingerprints?.[s.key] ?? null;
            const showFingerprint = s.configured && fp != null;
            const tokenOk = showFingerprint && s.ok;
            return (
              <View key={s.key} style={styles.row}>
                <MaterialCommunityIcons
                  name={SERVICE_ICONS[s.key]}
                  size={18}
                  color={serviceColor(s)}
                  style={styles.rowIcon}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{s.label}</Text>
                  <Text style={styles.rowStatus}>
                    {serviceStatusLabel(s)}
                    {s.configured && s.url ? ` · ${s.url}` : ""}
                  </Text>
                  {showFingerprint && (
                    <View style={styles.fingerprintRow}>
                      <Text style={styles.fingerprint} numberOfLines={1}>
                        token Replit: {fp}…
                      </Text>
                      {tokenOk && (
                        <Ionicons name="checkmark-circle" size={11} color="#22c55e" style={styles.tokenOkIcon} />
                      )}
                    </View>
                  )}
                  {s.configured && !fp && (
                    <Text style={styles.fingerprint}>token Replit: non configurato</Text>
                  )}
                  {s.configured && !s.ok && s.history?.length > 0 && (
                    <ErrorHistory history={s.history} />
                  )}
                  {s.configured && s.probeLog && s.probeLog.length > 0 && (
                    <ProbeLog entries={s.probeLog} />
                  )}
                </View>
                <View style={[styles.healthDot, { backgroundColor: serviceColor(s) }]} />
              </View>
            );
          })}
          {data && data.configuredCount > 0 && data.onlineCount < data.configuredCount && (
            <TouchableOpacity
              style={[styles.retryButton, isFetching && styles.retryButtonBusy]}
              onPress={() => { if (!isFetching) void refetch(); }}
              activeOpacity={isFetching ? 1 : 0.7}
              disabled={isFetching}
              testID="thinkcentre-retry-btn"
            >
              {isFetching ? (
                <ActivityIndicator size={12} color="#60a5fa" />
              ) : (
                <Ionicons name="refresh-outline" size={13} color="#60a5fa" />
              )}
              <Text style={styles.retryText}>
                {isFetching ? "Probe in corso…" : "Riprova ora"}
              </Text>
            </TouchableOpacity>
          )}
          {data && data.configuredCount > 0 && (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
              <View style={styles.noteBody}>
                <Text style={styles.noteText}>
                  Il fingerprint del token Replit è sempre visibile per confronto preventivo — utile
                  per verificare che una modifica ai secret sia stata applicata prima che scatti un
                  401.
                  {data.onlineCount === 0
                    ? "\nTutti i servizi risultano offline: verifica che il ThinkCentre sia acceso e il tunnel configurato."
                    : ""}
                  {"\n"}Per confronto lato server esegui{" "}
                  <Text style={styles.mono}>check-token-fingerprints.sh</Text> sul ThinkCentre.
                </Text>
                <View style={styles.legend}>
                  <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
                  <Text style={styles.legendText}>token OK — servizio online + fingerprint presente</Text>
                </View>
              </View>
            </View>
          )}

          {eventsData && eventsData.events.length > 0 && (
            <EventLog events={eventsData.events} />
          )}

          <View style={styles.pushToggleRow}>
            <View style={styles.pushToggleLeft}>
              <Ionicons name="notifications-outline" size={15} color={Colors.textSecondary} />
              <Text style={styles.pushToggleLabel}>Push per servizio offline</Text>
              <Text style={styles.pushToggleSub}>15 min debounce · solo transizioni ok→ko</Text>
            </View>
            {pushLoading || pushMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Switch
                value={pushData?.enabled ?? true}
                onValueChange={(val) => pushMutation.mutate(val)}
                trackColor={{ false: Colors.border, true: "#f59e0b" }}
                thumbColor={(pushData?.enabled ?? true) ? Colors.text : Colors.textSecondary}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  headerRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  headerCount: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
  list: { marginTop: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rowIcon: { width: 22, textAlign: "center", marginTop: 2 },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  rowStatus: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  fingerprint: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#6b7280", marginTop: 2, letterSpacing: 0.4 },
  fingerprintRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  tokenOkIcon: { marginTop: 0 },
  mono: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#9ca3af" },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#ef4444" },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  noteBody: { flex: 1, gap: 4 },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.25)",
    marginTop: 2,
  },
  retryButtonBusy: {
    opacity: 0.55,
  },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#60a5fa" },
  pushToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  pushToggleLeft: { flex: 1, gap: 2, flexDirection: "column" },
  pushToggleLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  pushToggleSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
});
