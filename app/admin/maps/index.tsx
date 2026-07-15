import React from "react";
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { MapsRollout, MapsRendererId, MapsTileId, RoutingEngineId, RoutingProfileId } from "@shared/maps-config";
import { RENDERER_OPTIONS, TILE_OPTIONS, ROUTING_OPTIONS } from "@shared/maps-config";
import { RolloutCard } from "@/components/admin/maps/RolloutCard";
import { RendererCard } from "@/components/admin/maps/RendererCard";
import { RoutingCard } from "@/components/admin/maps/RoutingCard";
import { TileProvidersCard } from "@/components/admin/maps/TileProvidersCard";
import { GeocodingCard } from "@/components/admin/maps/GeocodingCard";
import type { PhotonHealth } from "@/components/admin/maps/GeocodingCard";

interface AdminMapsConfig {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  tile: MapsTileId;
  routing: RoutingEngineId;
  profile: RoutingProfileId;
  renderer_notes: string;
  routing_notes: string;
  tile_source_status?: "maptiler" | "demo";
  dem_source?: "custom" | "aws-free";
  osm_last_updated_at: string | null;
  tester_can_customize?: boolean;
  mapbox_quota?: {
    used: number;
    limit: number;
    percent: number;
    resets_at: string;
    warning_threshold: number;
  };
  photon?: PhotonHealth;
}

const ROLLOUT_LABELS: Record<MapsRollout, string> = {
  disabled: "Disabilitato",
  tester: "Solo Tester",
  all: "Tutti",
};

function ConfigPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

export default function AdminMapsPage() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, error } = useQuery<AdminMapsConfig>({
    queryKey: ["/api/admin/maps/config"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/admin/maps/config", getApiUrl()).toString(), {
        headers: { ...(await authFetchHeaders()) },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const invalidateMapsQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/maps/config"] });
    queryClient.invalidateQueries({ queryKey: ["/api/settings/maps-rollout"] });
  };

  const rolloutMutation = useMutation({
    mutationFn: async (rollout: MapsRollout) => {
      const res = await apiRequest("PUT", "/api/admin/maps/rollout", { rollout });
      return res.json();
    },
    onSuccess: invalidateMapsQueries,
    onError: () => Alert.alert("Errore", "Impossibile aggiornare il rollout"),
  });

  const rendererMutation = useMutation({
    mutationFn: async ({ renderer, tile }: { renderer: MapsRendererId; tile: MapsTileId }) => {
      const res = await apiRequest("PUT", "/api/admin/maps/renderer", { renderer, tile });
      return res.json();
    },
    onSuccess: invalidateMapsQueries,
    onError: () => Alert.alert("Errore", "Impossibile aggiornare il renderer"),
  });

  const routingMutation = useMutation({
    mutationFn: async ({ engine, profile }: { engine: RoutingEngineId; profile: RoutingProfileId }) => {
      const res = await apiRequest("PUT", "/api/admin/maps/routing", { engine, profile });
      return res.json();
    },
    onSuccess: invalidateMapsQueries,
    onError: () => Alert.alert("Errore", "Impossibile aggiornare il routing engine"),
  });

  const testerCustomizeMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/admin/maps/tester-customize", { enabled });
      return res.json();
    },
    onSuccess: invalidateMapsQueries,
    onError: () => Alert.alert("Errore", "Impossibile aggiornare la personalizzazione tester"),
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>Caricamento configurazione mappe...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Errore caricamento configurazione</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.warningBox}>
        <Text style={styles.warningText}>
          Con rollout = Disabilitato l'app è identica a oggi. Nessun nuovo bundle viene caricato per gli utenti normali.
        </Text>
      </View>

      <TouchableOpacity style={styles.healthLink} onPress={() => router.push("/admin/system-health")}>
        <MaterialCommunityIcons name="heart-pulse" size={18} color={Colors.accent} />
        <Text style={styles.healthLinkText}>Apri Maps Health (System Watchdog)</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.configBar}>
        <Text style={styles.configBarTitle}>Configurazione attiva</Text>
        <View style={styles.configPills}>
          <ConfigPill label="Renderer" value={RENDERER_OPTIONS.find((r) => r.id === data.renderer)?.label ?? data.renderer} />
          <ConfigPill label="Tile" value={TILE_OPTIONS.find((t) => t.id === data.tile)?.label ?? data.tile} />
          <ConfigPill label="Routing" value={ROUTING_OPTIONS.find((r) => r.id === data.routing)?.label ?? data.routing} />
          <ConfigPill label="Rollout" value={ROLLOUT_LABELS[data.rollout] ?? data.rollout} />
        </View>
      </View>

      <RolloutCard
        rollout={data.rollout}
        isPending={rolloutMutation.isPending}
        onRolloutChange={(rollout) => rolloutMutation.mutate(rollout)}
        testerCanCustomize={data.tester_can_customize ?? false}
        isTesterTogglePending={testerCustomizeMutation.isPending}
        onTesterCustomizeChange={(enabled) => testerCustomizeMutation.mutate(enabled)}
      />

      <RendererCard
        renderer={data.renderer}
        tile={data.tile}
        rendererNotes={data.renderer_notes}
        tileSourceStatus={data.tile_source_status}
        demSource={data.dem_source}
        isPending={rendererMutation.isPending}
        onRendererChange={(renderer, tile) => rendererMutation.mutate({ renderer, tile })}
      />

      <RoutingCard
        engine={data.routing}
        profile={data.profile}
        routingNotes={data.routing_notes}
        mapboxQuota={data.mapbox_quota}
        isPending={routingMutation.isPending}
        onRoutingChange={(engine, profile) => routingMutation.mutate({ engine, profile })}
      />

      {data.photon && <GeocodingCard photon={data.photon} />}

      <TileProvidersCard />

      <View style={styles.osmBox}>
        <Text style={styles.osmLabel}>Ultimo aggiornamento OSM</Text>
        <Text style={styles.osmValue}>
          {data.osm_last_updated_at
            ? new Date(data.osm_last_updated_at).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })
            : "Mai eseguito"}
        </Text>
      </View>

      <View style={styles.reminderBox}>
        <Text style={styles.reminderTitle}>⚙️  TODO — Setup aggiornamento OSM mensile</Text>
        <Text style={styles.reminderLine}>1. Copia <Text style={styles.reminderCode}>infra/osm/</Text> → server in <Text style={styles.reminderCode}>/opt/graphhopper/scripts/</Text></Text>
        <Text style={styles.reminderLine}>2. Crea <Text style={styles.reminderCode}>/opt/graphhopper/scripts/.env</Text> con:</Text>
        <Text style={styles.reminderCode2}>{"   OSM_UPDATE_SECRET=<segreto>"}</Text>
        <Text style={styles.reminderCode2}>{"   SLACK_WEBHOOK_URL=https://hooks.slack.com/..."}</Text>
        <Text style={styles.reminderCode2}>{"   BACKEND_URL=https://bikerlink.replit.app"}</Text>
        <Text style={styles.reminderLine}>3. Aggiungi <Text style={styles.reminderCode}>OSM_UPDATE_SECRET</Text> nei Secrets Replit</Text>
        <Text style={styles.reminderLine}>4. Cron (root) — <Text style={styles.reminderCode}>sudo crontab -e</Text>:</Text>
        <Text style={styles.reminderCode2}>{"   CRON_TZ=Europe/Rome"}</Text>
        <Text style={styles.reminderCode2}>{"   0 2 1 * * /opt/graphhopper/scripts/update-osm.sh"}</Text>
        <Text style={styles.reminderNote}>Istruzioni complete: infra/osm/README.md</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.error },
  warningBox: {
    backgroundColor: Colors.accent + "15",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  warningText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  healthLink: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  healthLinkText: { flex: 1, color: Colors.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  configBar: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  configBarTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  configPills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  pillValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.accent, marginTop: 1 },
  osmBox: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  osmLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  osmValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  reminderBox: {
    backgroundColor: "#1a1400",
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#f59e0b40",
  },
  reminderTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#f59e0b", marginBottom: 10 },
  reminderLine: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 4, lineHeight: 18 },
  reminderCode: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#f59e0b" },
  reminderCode2: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#a3a3a3", marginBottom: 2 },
  reminderNote: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 8, fontStyle: "italic" },
});
