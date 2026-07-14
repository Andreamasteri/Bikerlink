import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, Switch } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { styles } from "./ThinkCentreCardStyles";
import { GraphHopperBlock } from "./ThinkCentreCardParts";
import type { HealthEvent, AreaServiceHealth, ProbeLogEntry } from "./ThinkCentreCardParts";
import { ServiceBadgeStrip } from "./ThinkCentreServiceBadge";
import { ValhallaBlock, PhotonBlock, UfwBlock } from "./ThinkCentreValhallaPhotonBlocks";
import type { ValhallaDetailedHealth, PhotonDetailedHealth, UfwDetailedHealth } from "./ThinkCentreValhallaPhotonBlocks";
import {
  OllamaBlock,
  WhisperBlock,
  DragonflyBlock,
  PostgresBlock,
  PgAdminBlock,
  NginxBlock,
  UptimeKumaBlock,
} from "./ThinkCentreInfraBlocks";
import { AresBlock } from "./ThinkCentreAresBlock";
import type { AresDetailedHealth } from "./ThinkCentreAresBlock";
import type { SystemStatuses } from "./SystemHealthContainer";
import { useThinkCentreToggles } from "./ThinkCentreCardToggles";
import {
  ThinkCentreFooter,
  CollapseChevron,
  overallToStatus,
  serviceToStatus,
  ghToStatus,
  ufwToStatus,
} from "./ThinkCentreCard.part2";

type ServiceKey =
  | "valhalla"
  | "ollama"
  | "whisper"
  | "photon"
  | "dragonfly"
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
  photonDetail?: PhotonDetailedHealth;
  ufwDetail?: UfwDetailedHealth;
  aresDetail?: AresDetailedHealth | null;
  tokenFingerprints?: {
    graphhopper: string | null;
    valhalla: string | null;
    ollama: string | null;
    whisper: string | null;
    photon: string | null;
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

type ThinkCentreStatusKeys =
  | "thinkcentre"
  | "graphhopper"
  | "valhalla"
  | "photon"
  | "ollama"
  | "whisper"
  | "ufw"
  | "dragonfly"
  | "postgres"
  | "pgadmin"
  | "nginx"
  | "uptimeKuma";

const ALL_UNKNOWN: Pick<SystemStatuses, ThinkCentreStatusKeys> = {
  thinkcentre: "unknown",
  graphhopper: "unknown",
  valhalla: "unknown",
  photon: "unknown",
  ollama: "unknown",
  whisper: "unknown",
  ufw: "unknown",
  dragonfly: "unknown",
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
      photon: serviceToStatus(findSvc("photon")),
      ollama: serviceToStatus(findSvc("ollama")),
      whisper: serviceToStatus(findSvc("whisper")),
      ufw: ufwToStatus(data.ufwDetail),
      dragonfly: serviceToStatus(findSvc("dragonfly")),
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
            <PhotonBlock
              detail={error ? null : (data?.photonDetail ?? null)}
              fingerprint={error ? null : (fp?.photon ?? null)}
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
            <AresBlock
              detail={error ? null : (data?.aresDetail ?? null)}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <DragonflyBlock
              service={error ? undefined : data?.services.find((s) => s.key === "dragonfly")}
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

          <ThinkCentreFooter
            poweredOffActive={poweredOffActive}
            data={data}
            isFetching={isFetching}
            refetch={refetch}
            eventsData={eventsData}
          />
        </View>
      )}
    </View>
  );
}

