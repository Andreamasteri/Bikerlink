import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, Switch } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { styles } from "./ThinkCentreCardStyles";
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
import { useThinkCentreToggles } from "./ThinkCentreCardToggles";

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

const ALL_UNKNOWN: Pick<SystemStatuses, ThinkCentreStatusKeys> = {
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
};

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

  const {
    pushData, pushLoading, pushMutation,
    maintenanceLoading, maintenanceMutation, maintenanceActive,
    poweredOffLoading, poweredOffMutation, poweredOffActive,
    ignoreTestsLoading, ignoreTestsMutation, ignoreTestsActive,
  } = useThinkCentreToggles();

  useEffect(() => {
    if (!onStatuses) return;
    if (poweredOffActive) { onStatuses(ALL_UNKNOWN); return; }
    if (!data) return;
    if (data.maintenanceMode) { onStatuses(ALL_UNKNOWN); return; }
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
  }, [data, onStatuses, poweredOffActive]);

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
        <MaterialCommunityIcons name="home-assistant" size={18} color={poweredOffActive ? "#6b7280" : headerColor} />
        <Text style={styles.cardTitle}>ThinkCentre</Text>
        {poweredOffActive && (
          <View style={styles.poweredOffBadge}>
            <Ionicons name="power-outline" size={11} color="#ef4444" />
            <Text style={styles.poweredOffBadgeText}>OFF</Text>
          </View>
        )}
        {!poweredOffActive && maintenanceActive && (
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

      {data && !poweredOffActive && <ServiceBadgeStrip data={data} />}

      {!collapsed && (
        <View style={styles.list}>
          {!poweredOffActive && error && !isLoading && (
            <Text style={styles.errorText}>Impossibile leggere lo stato dei servizi.</Text>
          )}
          {!poweredOffActive && data && data.graphhopperConfigured && (
            <GraphHopperBlock
              areas={data.graphhopperAreas}
              fingerprint={fp?.graphhopper ?? null}
              url={data.graphhopperUrl}
              tokenMissing={data.graphhopperTokenMissing}
            />
          )}
          {!poweredOffActive && (
            <ValhallaBlock
              detail={error ? null : (data?.valhallaDetail ?? null)}
              fingerprint={error ? null : (fp?.valhalla ?? null)}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <NominatimBlock
              detail={error ? null : (data?.nominatimDetail ?? null)}
              fingerprint={error ? null : (fp?.nominatim ?? null)}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <UfwBlock
              detail={error ? null : (data?.ufwDetail ?? null)}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <OllamaBlock
              service={error ? undefined : data?.services.find((s) => s.key === "ollama")}
              fingerprint={error ? null : (fp?.ollama ?? null)}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <WhisperBlock
              service={error ? undefined : data?.services.find((s) => s.key === "whisper")}
              fingerprint={error ? null : (fp?.whisper ?? null)}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <RedisBlock
              service={error ? undefined : data?.services.find((s) => s.key === "redis")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <PostgresBlock
              service={error ? undefined : data?.services.find((s) => s.key === "postgres")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <PgAdminBlock
              service={error ? undefined : data?.services.find((s) => s.key === "pgadmin")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <NginxBlock
              service={error ? undefined : data?.services.find((s) => s.key === "nginx")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <UptimeKumaBlock
              service={error ? undefined : data?.services.find((s) => s.key === "uptimekuma")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}

          {!poweredOffActive && data && data.configuredCount > 0 && data.onlineCount < data.configuredCount && (
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

          {!poweredOffActive && data && data.configuredCount > 0 && (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
              <View style={styles.noteBody}>
                <Text style={styles.noteText}>
                  Il fingerprint del token Replit è sempre visibile per confronto preventivo — utile
                  per verificare che una modifica ai secret sia stata applicata prima che scatti un 401.
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

          {!poweredOffActive && eventsData && eventsData.events.length > 0 && (
            <EventLog events={eventsData.events} />
          )}

          {poweredOffActive && (
            <View style={styles.poweredOffOverlay}>
              <Ionicons name="power-outline" size={22} color="#ef4444" />
              <Text style={styles.poweredOffOverlayTitle}>ThinkCentre spento</Text>
              <Text style={styles.poweredOffOverlaySub}>
                Override manuale attivo — tutti i servizi offline, probe e notifiche sospesi
              </Text>
            </View>
          )}

          <View style={styles.pushToggleRow}>
            <View style={styles.pushToggleLeft}>
              <Ionicons name="notifications-outline" size={15} color={Colors.textSecondary} />
              <Text style={styles.pushToggleLabel}>Push per servizio offline</Text>
              <Text style={styles.pushToggleSub}>
                Notifiche per singolo servizio (es. Ollama offline) con debounce 15 min — le notifiche globali ThinkCentre escono sempre
              </Text>
            </View>
            {pushLoading || pushData === undefined ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Switch
                value={pushData.enabled}
                onValueChange={(val) => pushMutation.mutate(val)}
                trackColor={{ false: Colors.border, true: "#f59e0b" }}
                thumbColor={pushData.enabled ? Colors.text : Colors.textSecondary}
              />
            )}
          </View>

          <View style={styles.pushToggleRow}>
            <View style={styles.pushToggleLeft}>
              <Ionicons name="flask-outline" size={15} color={ignoreTestsActive ? "#f97316" : Colors.textSecondary} />
              <Text style={[styles.pushToggleLabel, ignoreTestsActive && { color: "#f97316" }]}>
                ThinkCentre offline per test
              </Text>
              <Text style={styles.pushToggleSub}>
                Sopprime errori e alert legati al ThinkCentre — routing cloud attivo
              </Text>
            </View>
            {ignoreTestsLoading || ignoreTestsMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Switch
                value={ignoreTestsActive}
                onValueChange={(val) => ignoreTestsMutation.mutate(val)}
                trackColor={{ false: Colors.border, true: "#f97316" }}
                thumbColor={ignoreTestsActive ? Colors.text : Colors.textSecondary}
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

          <View style={styles.pushToggleRow}>
            <View style={styles.pushToggleLeft}>
              <Ionicons name="power-outline" size={15} color={poweredOffActive ? "#ef4444" : Colors.textSecondary} />
              <Text style={[styles.pushToggleLabel, poweredOffActive && styles.poweredOffLabelActive]}>
                ThinkCentre spento
              </Text>
              <Text style={styles.pushToggleSub}>
                Tutti i servizi offline · nessuna notifica · routing su cloud
              </Text>
            </View>
            {poweredOffLoading || poweredOffMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Switch
                value={poweredOffActive}
                onValueChange={(val) => poweredOffMutation.mutate(val)}
                trackColor={{ false: Colors.border, true: "#ef4444" }}
                thumbColor={poweredOffActive ? Colors.text : Colors.textSecondary}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

