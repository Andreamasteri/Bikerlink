import React from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { MapsRollout, MapsRendererId, MapsTileId, RoutingEngineId, RoutingProfileId } from "@shared/maps-config";
import { RolloutCard } from "./RolloutCard";
import { RendererCard } from "./RendererCard";
import { RoutingCard } from "./RoutingCard";

interface AdminMapsConfig {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  tile: MapsTileId;
  routing: RoutingEngineId;
  profile: RoutingProfileId;
  renderer_notes: string;
  routing_notes: string;
  mapbox_quota?: {
    used: number;
    limit: number;
    percent: number;
    resets_at: string;
    warning_threshold: number;
  };
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

      <RolloutCard
        rollout={data.rollout}
        isPending={rolloutMutation.isPending}
        onRolloutChange={(rollout) => rolloutMutation.mutate(rollout)}
      />

      <RendererCard
        renderer={data.renderer}
        tile={data.tile}
        rendererNotes={data.renderer_notes}
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
});
