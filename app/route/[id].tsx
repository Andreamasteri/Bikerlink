import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RouteMap from "@/components/RouteMap";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { t, getCurrentLocale } from "@/lib/i18n";
import { useUnits } from "@/lib/units-context";
import { formatDistance, formatSpeed, formatDateTime, convertSpeed } from "@/lib/units";
import { StatCard, SparklineChart } from "./_[id].part2";
import { styles } from "@/components/route/route-styles";

interface RouteDetail {
  id: string;
  title: string | null;
  trackingFrequency: number;
  status: string;
  totalDistanceKm: number | null;
  maxSpeedKmh: number | null;
  avgSpeedKmh: number | null;
  maxAltitude: number | null;
  durationSeconds: number | null;
  maxAccelerationG: number | null;
  maxDecelerationG: number | null;
  maxLateralG: number | null;
  maxTiltDeg: number | null;
  sprint0to100Ms: number | null;
  likes: number;
  startedAt: string;
  stoppedAt: string | null;
  points: Array<{
    id: string;
    latitude: number;
    longitude: number;
    altitude: number | null;
    speedKmh: number | null;
    accelG: number | null;
    tiltDeg: number | null;
    timestamp: string;
  }>;
}

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { distanceUnit, speedUnit, timeFormat } = useUnits();
  const locale = getCurrentLocale();

  const { data: route, isLoading } = useQuery<RouteDetail>({
    queryKey: ["/api/routes", id],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/routes/${id}/like`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes", id] });
    },
  });

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    return formatDateTime(dateStr, locale, timeFormat);
  };

  const pts = useMemo(() => route?.points || [], [route?.points]);
  const mappedPoints = useMemo(
    () => pts.map((p) => ({ latitude: p.latitude, longitude: p.longitude, speedKmh: p.speedKmh ?? null })),
    [pts]
  );

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

  const hasSensorData = pts.some((p) => p.accelG != null || p.tiltDeg != null);
  const speedUnitLabel = convertSpeed(0, speedUnit).label;


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      <RouteMap
        waypoints={mappedPoints.length > 0 ? [
          { lat: mappedPoints[0].latitude, lng: mappedPoints[0].longitude, name: "Partenza", waypointType: "start" },
          { lat: mappedPoints[mappedPoints.length - 1].latitude, lng: mappedPoints[mappedPoints.length - 1].longitude, name: "Arrivo", waypointType: "end" },
        ] : []}
        trackPoints={mappedPoints.map((p) => ({ lat: p.latitude, lng: p.longitude, speedKmh: p.speedKmh }))}
        height={260}
        showMarkers={true}
      />

      <View style={styles.header}>
        <Text style={styles.title}>
          {route.title || `Percorso del ${formatDate(route.startedAt)}`}
        </Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  route.status === "completed"
                    ? Colors.success
                    : Colors.warning,
              },
            ]}
          >
            <Text style={styles.statusText}>
              {route.status === "completed" ? "Completato" : "Attivo"}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(route.startedAt)}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          icon="road-variant"
          label={t("tracking.distance")}
          value={formatDistance(route.totalDistanceKm ?? 0, distanceUnit, 2)}
        />
        <StatCard
          icon="speedometer"
          label="Vel. Media"
          value={formatSpeed(route.avgSpeedKmh ?? 0, speedUnit, 1)}
        />
        <StatCard
          icon="speedometer-medium"
          label="Vel. Max"
          value={formatSpeed(route.maxSpeedKmh ?? 0, speedUnit, 1)}
        />
        <StatCard
          icon="mountain"
          label="Alt. Max"
          value={`${(route.maxAltitude ?? 0).toFixed(0)} m`}
        />
        <StatCard
          icon="timer-outline"
          label={t("tracking.duration")}
          value={formatDuration(route.durationSeconds ?? 0)}
        />
        <StatCard
          icon="map-marker-multiple"
          label="Punti GPS"
          value={`${pts.length}`}
        />
        {route.sprint0to100Ms !== null && (route.sprint0to100Ms ?? 0) > 0 && (
          <StatCard
            icon="timer-outline"
            label={`0→${convertSpeed(100, speedUnit).value.toFixed(0)} ${convertSpeed(100, speedUnit).label}`}
            value={`${((route.sprint0to100Ms ?? 0) / 1000).toFixed(2)}s`}
          />
        )}
      </View>

      {(route.maxAccelerationG != null || route.maxDecelerationG != null || route.maxLateralG != null || route.maxTiltDeg != null) && (
        <View style={styles.sensorSection}>
          <Text style={styles.sensorSectionTitle}>{t("tracking.sensorSection")}</Text>
          <View style={styles.sensorGrid}>
            {route.maxAccelerationG != null && (
              <View style={styles.sensorCard}>
                <MaterialCommunityIcons name="gauge" size={20} color={Colors.accentRed} />
                <Text style={styles.sensorValue}>{route.maxAccelerationG.toFixed(2)} G</Text>
                <Text style={styles.sensorLabel}>{t("tracking.gMaxAccel")}</Text>
              </View>
            )}
            {route.maxDecelerationG != null && (
              <View style={styles.sensorCard}>
                <MaterialCommunityIcons name="gauge" size={20} color={Colors.warning} />
                <Text style={styles.sensorValue}>{route.maxDecelerationG.toFixed(2)} G</Text>
                <Text style={styles.sensorLabel}>{t("tracking.gMaxBrake")}</Text>
              </View>
            )}
            {route.maxLateralG != null && (
              <View style={styles.sensorCard}>
                <MaterialCommunityIcons name="approximately-equal" size={20} color={Colors.accent} />
                <Text style={styles.sensorValue}>{route.maxLateralG.toFixed(2)} G</Text>
                <Text style={styles.sensorLabel}>{t("tracking.gLateral")}</Text>
              </View>
            )}
            {route.maxTiltDeg != null && (
              <View style={styles.sensorCard}>
                <MaterialCommunityIcons name="rotate-3d-variant" size={20} color={Colors.accent} />
                <Text style={styles.sensorValue}>{route.maxTiltDeg.toFixed(1)}°</Text>
                <Text style={styles.sensorLabel}>{t("tracking.tiltMax")}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {pts.length > 1 && (
        <View style={styles.chartSection}>
          <Text style={styles.chartTitle}>Andamento giro</Text>
          <SparklineChart
            values={pts.map((p) =>
              p.speedKmh != null ? convertSpeed(p.speedKmh, speedUnit).value : null
            )}
            color={Colors.accent}
            label="Velocità"
            unit={speedUnitLabel}
            toFixed={0}
          />
          {hasSensorData && (
            <>
              <SparklineChart
                values={pts.map((p) => p.accelG)}
                color="#FF3B30"
                label="G-Force"
                unit="G"
                toFixed={2}
              />
              <SparklineChart
                values={pts.map((p) => p.tiltDeg)}
                color="#0A84FF"
                label="Inclinazione"
                unit="°"
                toFixed={1}
              />
            </>
          )}
        </View>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.likeButton}
          onPress={() => likeMutation.mutate()}
          disabled={likeMutation.isPending}
        >
          <MaterialCommunityIcons
            name="heart"
            size={22}
            color={Colors.femaleIcon}
          />
          <Text style={styles.likeText}>{route.likes}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
