import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RouteDetailMap from "@/components/RouteDetailMap";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { getCurrentLocale } from "@/lib/i18n";

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

interface CustomRouteDetail {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  totalDistanceKm: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  waypoints: Waypoint[];
  isMine: boolean;
  creatorNickname: string;
}

const WAYPOINT_TYPE_LABELS: Record<string, string> = {
  start: "Partenza",
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: route, isLoading } = useQuery<CustomRouteDetail>({
    queryKey: ["/api/custom-routes", id],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/custom-routes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      router.back();
    },
  });

  const handleDelete = () => {
    if (Platform.OS === "web") {
      if (confirm("Eliminare questo percorso?")) {
        deleteMutation.mutate();
      }
    } else {
      Alert.alert("Elimina Percorso", "Eliminare questo percorso?", [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ]);
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
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(getCurrentLocale(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      <View style={styles.mapContainer}>
        <RouteDetailMap
          waypoints={waypoints}
          waypointTypeLabels={WAYPOINT_TYPE_LABELS}
          waypointTypeColors={WAYPOINT_TYPE_COLORS}
        />
      </View>

      {waypoints.length >= 2 && (
        <TouchableOpacity
          style={styles.googleMapsBtn}
          onPress={() => {
            const coords = waypoints.map((wp) => `${wp.latitude},${wp.longitude}`).join("/");
            const url = `https://www.google.com/maps/dir/${coords}`;
            Linking.openURL(url);
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="google-maps" size={20} color="#fff" />
          <Text style={styles.googleMapsBtnText}>Apri in Google Maps</Text>
        </TouchableOpacity>
      )}

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{route.title}</Text>
          {route.isPublic ? (
            <View style={[styles.badge, { backgroundColor: Colors.success }]}>
              <MaterialCommunityIcons name="earth" size={12} color="#fff" />
              <Text style={styles.badgeText}>Pubblico</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: Colors.surfaceLight }]}>
              <MaterialCommunityIcons name="lock" size={12} color={Colors.textSecondary} />
              <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>Privato</Text>
            </View>
          )}
        </View>

        {route.description ? (
          <Text style={styles.description}>{route.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="account" size={16} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{route.creatorNickname}</Text>
          </View>
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="calendar" size={16} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{formatDate(route.createdAt)}</Text>
          </View>
          {(route.totalDistanceKm ?? 0) > 0 && (
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="road-variant" size={16} color={Colors.textSecondary} />
              <Text style={styles.metaText}>
                ~{(route.totalDistanceKm ?? 0).toFixed(1)} km
              </Text>
            </View>
          )}
        </View>
      </View>

      {route.isMine && (
        <View style={styles.ownerActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push(`/routes/create?editId=${route.id}`)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="pencil" size={20} color={Colors.accent} />
            <Text style={styles.editButtonText}>Modifica</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={20}
              color={Colors.accentRed}
            />
            <Text style={styles.deleteButtonText}>Elimina</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.waypointsSection}>
        <Text style={styles.sectionTitle}>
          Tappe ({waypoints.length})
        </Text>
        {waypoints.length === 0 ? (
          <View style={styles.emptyWaypoints}>
            <MaterialCommunityIcons
              name="map-marker-plus"
              size={40}
              color={Colors.textSecondary}
            />
            <Text style={styles.emptyWaypointsText}>
              Nessuna tappa aggiunta
            </Text>
          </View>
        ) : (
          waypoints.map((wp, index) => (
            <WaypointCard
              key={wp.id}
              waypoint={wp}
              index={index}
              isLast={index === waypoints.length - 1}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function WaypointCard({
  waypoint,
  index,
  isLast,
}: {
  waypoint: Waypoint;
  index: number;
  isLast: boolean;
}) {
  const color = WAYPOINT_TYPE_COLORS[waypoint.waypointType] || Colors.accent;
  const iconName = WAYPOINT_TYPE_ICONS[waypoint.waypointType] || "map-marker";
  const typeLabel = WAYPOINT_TYPE_LABELS[waypoint.waypointType] || waypoint.waypointType;

  return (
    <View style={styles.waypointRow}>
      <View style={styles.waypointTimeline}>
        <View style={[styles.waypointDot, { backgroundColor: color }]}>
          <MaterialCommunityIcons name={iconName as any} size={14} color="#fff" />
        </View>
        {!isLast && <View style={styles.waypointLine} />}
      </View>
      <View style={styles.waypointContent}>
        <View style={styles.waypointHeader}>
          <Text style={styles.waypointName}>{waypoint.name}</Text>
          <Text style={[styles.waypointType, { color }]}>{typeLabel}</Text>
        </View>
        {waypoint.description ? (
          <Text style={styles.waypointDescription}>{waypoint.description}</Text>
        ) : null}
        <Text style={styles.waypointCoords}>
          {waypoint.latitude.toFixed(4)}, {waypoint.longitude.toFixed(4)}
        </Text>
      </View>
    </View>
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
  googleMapsBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#1a73e8",
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    gap: 8,
  },
  googleMapsBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  mapContainer: {
    height: 280,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700" as const,
    flex: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600" as const,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 14,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  ownerActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  editButtonText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accentRed,
  },
  deleteButtonText: {
    color: Colors.accentRed,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  waypointsSection: {
    padding: 20,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700" as const,
    marginBottom: 16,
  },
  emptyWaypoints: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyWaypointsText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  waypointRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  waypointTimeline: {
    width: 36,
    alignItems: "center",
  },
  waypointDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  waypointLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  waypointContent: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginLeft: 8,
    marginBottom: 8,
  },
  waypointHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  waypointName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600" as const,
    flex: 1,
  },
  waypointType: {
    fontSize: 11,
    fontWeight: "600" as const,
    marginLeft: 8,
  },
  waypointDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  waypointCoords: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 6,
    opacity: 0.7,
  },
});
