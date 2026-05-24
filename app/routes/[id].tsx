import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest, getQueryFn, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useT } from "@/lib/language-context";

import RouteDetailHeader from "@/components/routes/detail/RouteDetailHeader";
import RouteDetailMap from "@/components/routes/detail/RouteDetailMap";
import RouteDetailStats from "@/components/routes/detail/RouteDetailStats";
import RouteDetailActions from "@/components/routes/detail/RouteDetailActions";
import RouteDetailWaypoints from "@/components/routes/detail/RouteDetailWaypoints";

interface Waypoint {
  id: string;
  routeId: string;
  orderIndex: number;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  waypointType: string;
  createdAt: string;
}

type Visibility = "public" | "friends" | "private";

const VISIBILITY_CYCLE: Visibility[] = ["public", "friends", "private"];

function nextVisibility(current: Visibility): Visibility {
  const idx = VISIBILITY_CYCLE.indexOf(current);
  return VISIBILITY_CYCLE[(idx + 1) % VISIBILITY_CYCLE.length];
}

interface CustomRouteDetail {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  totalDistanceKm: number | null;
  isPublic: boolean;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  waypoints: Waypoint[];
  isMine: boolean;
  creatorNickname: string;
}

const WAYPOINT_TYPE_LABELS: Record<string, string> = {
  start: t("routes.start"),
  stop: "Sosta",
  poi: "Punto di Interesse",
  end: "Arrivo",
};

const WAYPOINT_TYPE_ICONS: Record<string, string> = {
  start: "flag-checkered",
  stop: "coffee",
  poi: "star-circle",
  end: "flag-variant",
};

const WAYPOINT_TYPE_COLORS: Record<string, string> = {
  start: Colors.success,
  stop: Colors.warning,
  poi: Colors.accent,
  end: Colors.accentRed,
};

export default function CustomRouteDetailScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: route, isLoading } = useQuery<CustomRouteDetail>({
    queryKey: ["/api/custom-routes", id],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- elevation data from API
  const [elevation, setElevation] = useState<any | null>(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [elevationError, setElevationError] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/custom-routes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      router.back();
    },
  });

  const handleCycleVisibility = async () => {
    if (!route || isTogglingVisibility) return;
    const current: Visibility = route.visibility ?? (route.isPublic ? "public" : "private");
    const next = nextVisibility(current);
    setIsTogglingVisibility(true);
    try {
      await apiRequest("PUT", `/api/custom-routes/${id}`, { visibility: next });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes", id] });
    } catch (e: unknown) {
      Alert.alert(t("common.error"), (e as Error).message || t("routes.cannotUpdateVisibility"));
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Elimina Percorso", "Eliminare questo percorso?", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  const handleLoadElevation = async () => {
    if (!id) return;
    setElevationLoading(true);
    setElevationError(false);
    try {
      const url = new URL(`/api/custom-routes/${id}/elevation`, getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setElevation(data);
    } catch {
      setElevationError(true);
    } finally {
      setElevationLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!route) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="map-marker-off"
          size={64}
          color={Colors.textSecondary}
        />
        <Text style={styles.emptyText}>Percorso non trovato</Text>
      </View>
    );
  }

  const waypoints = (route.waypoints || []).sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      <RouteDetailMap
        waypoints={waypoints}
        waypointTypeLabels={WAYPOINT_TYPE_LABELS}
        waypointTypeColors={WAYPOINT_TYPE_COLORS}
      />

      <RouteDetailHeader
        title={route.title}
        description={route.description}
        creatorNickname={route.creatorNickname}
        createdAt={route.createdAt}
        totalDistanceKm={route.totalDistanceKm}
        visibility={route.visibility}
        isPublic={route.isPublic}
      />

      <RouteDetailActions
        isMine={route.isMine}
        visibility={route.visibility}
        isPublic={route.isPublic}
        isTogglingVisibility={isTogglingVisibility}
        onCycleVisibility={handleCycleVisibility}
        onEdit={() => router.push(`/routes/create?editId=${route.id}`)}
        onDelete={handleDelete}
        isDeleting={deleteMutation.isPending}
      />

      <RouteDetailStats
        elevation={elevation}
        elevationLoading={elevationLoading}
        elevationError={elevationError}
        onLoadElevation={handleLoadElevation}
      />

      <RouteDetailWaypoints
        waypoints={waypoints}
        waypointTypeLabels={WAYPOINT_TYPE_LABELS}
        waypointTypeIcons={WAYPOINT_TYPE_ICONS}
        waypointTypeColors={WAYPOINT_TYPE_COLORS}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: 12,
  },
});
