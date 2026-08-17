import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, Switch, Alert } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFnWithTimeout } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { styles } from "./ThinkCentreCardStyles";
import { GraphHopperBlock } from "./ThinkCentreCardParts";
import type { HealthEvent, AreaServiceHealth, ProbeLogEntry } from "./ThinkCentreCardParts";
import { ServiceBadgeStrip } from "./ThinkCentreServiceBadge";
import { ValhallaBlock, PhotonBlock, UfwBlock, AreaResolverBlock } from "./ThinkCentreValhallaPhotonBlocks";
import type { ValhallaDetailedHealth, PhotonDetailedHealth, UfwDetailedHealth, AreaResolverDetail } from "./ThinkCentreValhallaPhotonBlocks";
import {
  OllamaBlock,
  DragonflyBlock,
  NginxBlock,
  UptimeKumaBlock,
  AiHubBlock,
  type PersonaModels,
} from "./ThinkCentreInfraBlocks";
import { AresBlock } from "./ThinkCentreAresBlock";
import type { AresDetailedHealth } from "./ThinkCentreAresBlock";
import type { SystemStatuses } from "./SystemHealthContainer";

/** Specchio del tipo RedisTunnelExitReason da server/cache/redis-tunnel.ts */
type RedisTunnelExitReason = "dns_failure" | "oom" | "auth" | "signal" | "unknown";
import { useThinkCentreToggles } from "./ThinkCentreCardToggles";
import {
  ThinkCentreFooter,
  CollapseChevron,
  overallToStatus,
  serviceToStatus,
  ghToStatus,
  ufwToStatus,
} from "./ThinkCentreCard.part2";
import { RepoDriftBanner } from "./ThinkCentreRepoDriftBanner";
import type { RepoDriftHealth } from "./ThinkCentreRepoDriftBanner";
import { ApkSection } from "./ThinkCentreApkSection";

type ServiceKey =
  | "valhalla"
  | "ollama"
  | "photon"
  | "dragonfly"
  | "nginx"
  | "uptimekuma"
  | "aihub";

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
  /** Task #165 — modello Ollama configurato + disponibilità per ogni persona AI. */
  personaModels?: PersonaModels | null;
  repoDrift?: RepoDriftHealth;
  tokenFingerprints?: {
    graphhopper: string | null;
    valhalla: string | null;
    ollama: string | null;
    photon: string | null;
  };
  /** Non-null only when the area resolver emits a non-info signal (SQL error). */
  areaResolverDetail?: AreaResolverDetail | null;
  maintenanceMode?: boolean;
  /** Task #549 — "default" during pre-push window after ai-hub redeploy. */
  aiHubVramAgentMapSource?: "default" | "pushed" | null;
  /** Stato del bridge cloudflared access tcp Replit→DragonflyDB (Task #815). */
  redisTunnel?: {
    enabled: boolean;
    running: boolean;
    restarts: number;
    lastExitCode: number | null;
    lastExitReason: RedisTunnelExitReason | null;
    lastError: string | null;
    lastExitAt: number | null;
    floodActive: boolean;
  } | null;
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
  | "ufw"
  | "dragonfly"
  | "nginx"
  | "uptimeKuma"
  | "aihub";


const REASON_LABEL: Record<RedisTunnelExitReason, string> = {
  dns_failure: "DNS failure",
  oom:         "OOM kill",
  auth:        "Auth rifiutato",
  signal:      "Segnale inatteso",
  unknown:     "Causa ignota",
};
const REASON_COLOR: Record<RedisTunnelExitReason, string> = {
  dns_failure: "#f59e0b",
  oom:         "#ef4444",
  auth:        "#ef4444",
  signal:      "#f59e0b",
  unknown:     "#6b7280",
};

function RedisTunnelBadge({
  tunnel,
}: {
  tunnel: NonNullable<ThinkCentreHealth["redisTunnel"]>;
}) {
  if (!tunnel.enabled) return null;
  const statusColor = tunnel.running ? "#22c55e" : tunnel.floodActive ? "#ef4444" : "#f59e0b";
  const statusLabel = tunnel.running
    ? "Tunnel attivo"
    : tunnel.floodActive
      ? `Flood (${tunnel.restarts} restart)`
      : `Inattivo (${tunnel.restarts} restart)`;
  return (
    <View style={redisTunnelStyles.row}>
      <Ionicons name="git-network-outline" size={12} color={statusColor} style={redisTunnelStyles.icon} />
      <Text style={[redisTunnelStyles.label, { color: statusColor }]}>
        cloudflared·redis — {statusLabel}
      </Text>
      {!tunnel.running && tunnel.lastExitReason && (
        <View style={[redisTunnelStyles.reasonBadge, { borderColor: REASON_COLOR[tunnel.lastExitReason] }]}>
          <Text style={[redisTunnelStyles.reasonText, { color: REASON_COLOR[tunnel.lastExitReason] }]}>
            {REASON_LABEL[tunnel.lastExitReason]}
          </Text>
        </View>
      )}
    </View>
  );
}

const redisTunnelStyles = {
  row: { flexDirection: "row" as const, alignItems: "center" as const, marginTop: 6, flexWrap: "wrap" as const, gap: 6 },
  icon: { marginRight: 4 },
  label: { fontSize: 11 },
  reasonBadge: {
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  reasonText: { fontSize: 10, fontWeight: "600" as const },
};

const ALL_UNKNOWN: Pick<SystemStatuses, ThinkCentreStatusKeys> = {
  thinkcentre: "unknown",
  graphhopper: "unknown",
  valhalla: "unknown",
  photon: "unknown",
  ollama: "unknown",
  ufw: "unknown",
  dragonfly: "unknown",
  nginx: "unknown",
  uptimeKuma: "unknown",
  aihub: "unknown",
};

export function ThinkCentreCard({
  onStatuses,
}: {
  onStatuses?: (s: Pick<SystemStatuses, ThinkCentreStatusKeys>) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [apkEditing, setApkEditing] = useState(false);
  const [apkInputUrl, setApkInputUrl] = useState("");
  const queryClient = useQueryClient();

  const { data: apkData } = useQuery<{ url: string }>({
    queryKey: ["/api/admin/settings/tc-terminal-apk-url"],
  });

  const apkSaveMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("PUT", "/api/admin/settings/tc-terminal-apk-url", { url }, { timeoutMs: 10_000 });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/tc-terminal-apk-url"] });
      setApkEditing(false);
      Alert.alert("Salvato", "URL TC Terminal APK aggiornato.");
    },
    onError: (e: Error) => {
      Alert.alert("Errore", e.message);
    },
  });

  const handleApkEdit = () => {
    setApkInputUrl(apkData?.url ?? "");
    setApkEditing(true);
  };

  const handleApkSave = () => {
    const trimmed = apkInputUrl.trim();
    if (trimmed && !trimmed.startsWith("http")) {
      Alert.alert("Errore", "Inserisci un URL valido (https://...)");
      return;
    }
    apkSaveMutation.mutate(trimmed);
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery<ThinkCentreHealth>({
    queryKey: ["/api/admin/thinkcentre-health"],
    queryFn: getQueryFnWithTimeout<ThinkCentreHealth>(20_000),
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: eventsData } = useQuery<HealthEventsResponse>({
    queryKey: ["/api/admin/thinkcentre-events"],
    queryFn: getQueryFnWithTimeout<HealthEventsResponse>(10_000),
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

  const repoDriftFixMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/thinkcentre/repo-drift-fix", {}, { timeoutMs: 35_000 });
      return res.json();
    },
    onSuccess: () => { void refetch(); },
  });

  useEffect(() => {
    if (!onStatuses) return;
    if (poweredOffActive) { onStatuses(ALL_UNKNOWN); return; }
    if (!data) return;
    if (data.maintenanceMode) { onStatuses(ALL_UNKNOWN); return; }
    const findSvc = (key: ServiceKey) => data.services?.find((s) => s.key === key);
    onStatuses({
      thinkcentre: overallToStatus(data.overall),
      graphhopper: ghToStatus(data.graphhopperAreas ?? [], data.graphhopperConfigured),
      valhalla: serviceToStatus(findSvc("valhalla")),
      photon: serviceToStatus(findSvc("photon")),
      ollama: serviceToStatus(findSvc("ollama")),
      ufw: ufwToStatus(data.ufwDetail),
      dragonfly: serviceToStatus(findSvc("dragonfly")),
      nginx: serviceToStatus(findSvc("nginx")),
      uptimeKuma: serviceToStatus(findSvc("uptimekuma")),
      aihub: serviceToStatus(findSvc("aihub")),
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

      {data?.repoDrift?.driftDetected && !poweredOffActive && (
        <RepoDriftBanner
          drift={data.repoDrift}
          onSync={() => repoDriftFixMutation.mutate()}
          syncing={repoDriftFixMutation.isPending}
        />
      )}

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
              areas={data.graphhopperAreas ?? []}
              fingerprint={fp?.graphhopper ?? null}
              url={data.graphhopperUrl}
              tokenMissing={data.graphhopperTokenMissing}
            />
          )}
          {!poweredOffActive && data?.areaResolverDetail != null && (
            <AreaResolverBlock detail={data.areaResolverDetail} />
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
              service={error ? undefined : data?.services?.find((s) => s.key === "ollama")}
              fingerprint={error ? null : (fp?.ollama ?? null)}
              personaModels={error ? null : (data?.personaModels ?? null)}
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
              service={error ? undefined : data?.services?.find((s) => s.key === "dragonfly")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && data?.redisTunnel && data.redisTunnel.enabled && (
            <RedisTunnelBadge tunnel={data.redisTunnel} />
          )}
          {!poweredOffActive && (
            <NginxBlock
              service={error ? undefined : data?.services?.find((s) => s.key === "nginx")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <UptimeKumaBlock
              service={error ? undefined : data?.services?.find((s) => s.key === "uptimekuma")}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}
          {!poweredOffActive && (
            <AiHubBlock
              service={error ? undefined : data?.services?.find((s) => s.key === "aihub")}
              vramAgentMapSource={error ? null : (data?.aiHubVramAgentMapSource ?? null)}
              isLoading={isLoading}
              hasError={!!error}
            />
          )}

          <ApkSection
            apkData={apkData}
            apkEditing={apkEditing}
            apkInputUrl={apkInputUrl}
            setApkInputUrl={setApkInputUrl}
            setApkEditing={setApkEditing}
            onEdit={handleApkEdit}
            onSave={handleApkSave}
            isSaving={apkSaveMutation.isPending}
          />

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
