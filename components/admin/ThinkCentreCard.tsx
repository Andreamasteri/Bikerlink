import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Switch } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders, queryClient } from "@/lib/query-client";
import { EventLog, GraphHopperBlock } from "./ThinkCentreCardParts";
import type { HealthEvent, AreaServiceHealth, ProbeLogEntry } from "./ThinkCentreCardParts";
import { ServiceBadgeStrip } from "./ThinkCentreServiceBadge";
import { ValhallaBlock, NominatimBlock, UfwBlock } from "./ThinkCentreValhallaNominatimBlocks";
import type { ValhallaDetailedHealth, NominatimDetailedHealth, UfwDetailedHealth } from "./ThinkCentreValhallaNominatimBlocks";
import {
  OllamaBlock,
  WhisperBlock,
  RedisBlock,
  PostgresBlock,
  PgAdminBlock,
  NginxBlock,
  UptimeKumaBlock,
} from "./ThinkCentreInfraBlocks";
import type { DotStatus, SystemStatuses } from "./SystemHealthContainer";

type ServiceKey =
  | "valhalla"
  | "ollama"
  | "whisper"
  | "nominatim"
  | "redis"
  | "postgres"
  | "pgadmin"
  | "nginx"
  | "uptimekuma";

interface ServiceHealth {
  key: ServiceKey;
  label: string;
  configured: boolean;
  ok: boolean;
  startingUp?: boolean;
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
  ufwDetail?: UfwDetailedHealth;
  tokenFingerprints?: {
    graphhopper: string | null;
    valhalla: string | null;
    ollama: string | null;
    whisper: string | null;
    nominatim: string | null;
  };
  maintenanceMode?: boolean;
  checkedAt: number;
}

interface HealthEventsResponse {
  events: HealthEvent[];
}

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

function overallToStatus(overall: ThinkCentreHealth["overall"]): DotStatus {
  if (overall === "green") return "ok";
  if (overall === "yellow") return "degraded";
  if (overall === "red") return "offline";
  return "unknown";
}

function serviceToStatus(s: ServiceHealth | undefined): DotStatus {
  if (!s || !s.configured) return "unknown";
  if (s.ok) return "ok";
  if (s.startingUp) return "degraded";
  return "offline";
}

function ghToStatus(areas: AreaServiceHealth[], configured: boolean): DotStatus {
  if (!configured || areas.length === 0) return "unknown";
  const anyOk = areas.some((a) => a.ok);
  const allOk = areas.every((a) => a.ok);
  if (allOk) return "ok";
  if (anyOk) return "degraded";
  const anyStarting = areas.some((a) => a.enabled && a.startingUp);
  if (anyStarting) return "degraded";
  return "offline";
}

function ufwToStatus(ufw: UfwDetailedHealth | undefined): DotStatus {
  if (!ufw || !ufw.configured) return "unknown";
  return ufw.ok ? "ok" : "offline";
}

type ThinkCentreStatusKeys =
  | "thinkcentre"
  | "graphhopper"
  | "valhalla"
  | "nominatim"
  | "ollama"
  | "whisper"
  | "ufw"
  | "redis"
  | "postgres"
  | "pgadmin"
  | "nginx"
  | "uptimeKuma";

export function ThinkCentreCard({
  onStatuses,
}: {
  onStatuses?: (s: Pick<SystemStatuses, ThinkCentreStatusKeys>) => void;
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
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
    refetchOnMount: "always",
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

  const { data: maintenanceData, isLoading: maintenanceLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/admin/thinkcentre/maintenance"],
    queryFn: async () => {
      const res = await fetch(
        new URL("/api/admin/thinkcentre/maintenance", getApiUrl()).toString(),
        { headers: { ...(await authFetchHeaders()) }, credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(
        new URL("/api/admin/thinkcentre/maintenance", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authFetchHeaders()) },
          credentials: "include",
          body: JSON.stringify({ enabled }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/thinkcentre/maintenance"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/thinkcentre-health"] });
    },
  });

  const maintenanceActive = maintenanceData?.enabled ?? false;

  useEffect(() => {
    if (!data || !onStatuses) return;
    // In manutenzione il ThinkCentre non contribuisce allo stato globale: tutti "unknown".
    if (data.maintenanceMode) {
      onStatuses({
        thinkcentre: "unknown",
        graphhopper: "unknown",
        valhalla: "unknown",
        nominatim: "unknown",
        ollama: "unknown",
        whisper: "unknown",
        ufw: "unknown",
        redis: "unknown",
        postgres: "unknown",
        pgadmin: "unknown",
        nginx: "unknown",
        uptimeKuma: "unknown",
      });
      return;
    }
    const findSvc = (key: ServiceKey) => data.services.find((s) => s.key === key);
    onStatuses({
      thinkcentre: overallToStatus(data.overall),
      graphhopper: ghToStatus(data.graphhopperAreas, data.graphhopperConfigured),
      valhalla: serviceToStatus(findSvc("valhalla")),
      nominatim: serviceToStatus(findSvc("nominatim")),
      ollama: serviceToStatus(findSvc("ollama")),
      whisper: serviceToStatus(findSvc("whisper")),
      ufw: ufwToStatus(data.ufwDetail),
      redis: serviceToStatus(findSvc("redis")),
      postgres: serviceToStatus(findSvc("postgres")),
      pgadmin: serviceToStatus(findSvc("pgadmin")),
      nginx: serviceToStatus(findSvc("nginx")),
      uptimeKuma: serviceToStatus(findSvc("uptimekuma")),
    });
  }, [data, onStatuses]);

  const headerColor = data ? OVERALL_COLOR[data.overall] : "#6b7280";
  const fp = data?.tokenFingerprints;

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
        {maintenanceActive && (
          <View style={styles.maintenanceBadge}>
            <Ionicons name="build-outline" size={11} color="#f97316" />
            <Text style={styles.maintenanceBadgeText}>MNT</Text>
          </View>
        )}
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
          {!isLoading && !error && data?.ufwDetail && (() => {
            const ufw = data.ufwDetail!;
            const ufwColor = !ufw.configured
              ? "#6b7280"
              : ufw.ok
                ? "#22c55e"
                : ufw.status === "inactive"
                  ? "#ef4444"
                  : "#6b7280";
            return (
              <View style={styles.ufwBadge}>
                <MaterialCommunityIcons
                  name={ufw.ok ? "shield-check-outline" : "shield-off-outline"}
                  size={13}
                  color={ufwColor}
                />
              </View>
            );
          })()}
          {!isLoading && !error && data && (
            <View style={[styles.healthDot, { backgroundColor: headerColor }]} />
          )}
          <CollapseChevron collapsed={collapsed} />
        </View>
      </TouchableOpacity>

      {data && <ServiceBadgeStrip data={data} />}

      {!collapsed && (
        <View style={styles.list}>
          {error && !isLoading && (
            <Text style={styles.errorText}>Impossibile leggere lo stato dei servizi.</Text>
          )}
          {data && data.graphhopperConfigured && (
            <GraphHopperBlock
              areas={data.graphhopperAreas}
              fingerprint={fp?.graphhopper ?? null}
              url={data.graphhopperUrl}
              tokenMissing={data.graphhopperTokenMissing}
            />
          )}

          <ValhallaBlock
            detail={error ? null : (data?.valhallaDetail ?? null)}
            fingerprint={error ? null : (fp?.valhalla ?? null)}
            isLoading={isLoading}
            hasError={!!error}
          />
          <NominatimBlock
            detail={error ? null : (data?.nominatimDetail ?? null)}
            fingerprint={error ? null : (fp?.nominatim ?? null)}
            isLoading={isLoading}
            hasError={!!error}
          />
          <UfwBlock
            detail={error ? null : (data?.ufwDetail ?? null)}
            isLoading={isLoading}
            hasError={!!error}
          />

          <OllamaBlock
            service={error ? undefined : data?.services.find((s) => s.key === "ollama")}
            fingerprint={error ? null : (fp?.ollama ?? null)}
            isLoading={isLoading}
            hasError={!!error}
          />
          <WhisperBlock
            service={error ? undefined : data?.services.find((s) => s.key === "whisper")}
            fingerprint={error ? null : (fp?.whisper ?? null)}
            isLoading={isLoading}
            hasError={!!error}
          />
          <RedisBlock
            service={error ? undefined : data?.services.find((s) => s.key === "redis")}
            isLoading={isLoading}
            hasError={!!error}
          />
          <PostgresBlock
            service={error ? undefined : data?.services.find((s) => s.key === "postgres")}
            isLoading={isLoading}
            hasError={!!error}
          />
          <PgAdminBlock
            service={error ? undefined : data?.services.find((s) => s.key === "pgadmin")}
            isLoading={isLoading}
            hasError={!!error}
          />
          <NginxBlock
            service={error ? undefined : data?.services.find((s) => s.key === "nginx")}
            isLoading={isLoading}
            hasError={!!error}
          />
          <UptimeKumaBlock
            service={error ? undefined : data?.services.find((s) => s.key === "uptimekuma")}
            isLoading={isLoading}
            hasError={!!error}
          />

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

          <View style={styles.pushToggleRow}>
            <View style={styles.pushToggleLeft}>
              <Ionicons name="build-outline" size={15} color={maintenanceActive ? "#f97316" : Colors.textSecondary} />
              <Text style={[styles.pushToggleLabel, maintenanceActive && styles.maintenanceLabelActive]}>
                Manutenzione programmata
              </Text>
              <Text style={styles.pushToggleSub}>Probe e alert sospesi</Text>
            </View>
            {maintenanceLoading || maintenanceMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Switch
                value={maintenanceActive}
                onValueChange={(val) => maintenanceMutation.mutate(val)}
                trackColor={{ false: Colors.border, true: "#f97316" }}
                thumbColor={maintenanceActive ? Colors.text : Colors.textSecondary}
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  headerRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  headerCount: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
  list: { marginTop: 14, gap: 10 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#ef4444" },
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
  noteText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 16 },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  mono: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#9ca3af" },
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
  retryButtonBusy: { opacity: 0.55 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#60a5fa" },
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
  pushToggleSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  maintenanceLabelActive: { color: "#f97316" },
  ufwBadge: { justifyContent: "center", alignItems: "center" },
  maintenanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.35)",
  },
  maintenanceBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#f97316",
    letterSpacing: 0.5,
  },
});
