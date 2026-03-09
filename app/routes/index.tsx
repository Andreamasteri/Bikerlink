import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";

interface CustomRoute {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  totalDistanceKm: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  waypointCount?: number;
  ownerNickname?: string;
}

export default function RoutesListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const settingsQuery = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/custom-routes"],
  });

  const routesQuery = useQuery<{ myRoutes: CustomRoute[]; publicRoutes: CustomRoute[] }>({
    queryKey: ["/api/custom-routes"],
    enabled: settingsQuery.data?.enabled !== false,
  });

  const featureEnabled = settingsQuery.data?.enabled !== false;
  const isLoading = settingsQuery.isLoading || routesQuery.isLoading;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!featureEnabled) {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons name="map-marker-off" size={48} color={Colors.textSecondary} />
        <Text style={styles.disabledTitle}>Funzione non disponibile</Text>
        <Text style={styles.disabledText}>
          I percorsi personalizzati non sono attualmente abilitati.
        </Text>
      </View>
    );
  }

  const myRoutes = routesQuery.data?.myRoutes ?? [];
  const publicRoutes = routesQuery.data?.publicRoutes ?? [];

  const sections: { title: string; data: CustomRoute[]; isMine: boolean }[] = [];
  if (myRoutes.length > 0) {
    sections.push({ title: "I Miei Percorsi", data: myRoutes, isMine: true });
  }
  if (publicRoutes.length > 0) {
    sections.push({ title: "Percorsi Pubblici", data: publicRoutes, isMine: false });
  }

  const allItems: ({ type: "header"; title: string } | { type: "route"; route: CustomRoute; isMine: boolean })[] = [];
  for (const section of sections) {
    allItems.push({ type: "header", title: section.title });
    for (const route of section.data) {
      allItems.push({ type: "route", route, isMine: section.isMine });
    }
  }

  const renderItem = ({ item }: { item: (typeof allItems)[number] }) => {
    if (item.type === "header") {
      return <Text style={styles.sectionHeader}>{item.title}</Text>;
    }

    const route = item.route;
    const waypointCount = route.waypointCount ?? 0;
    const distance = route.totalDistanceKm ? `${route.totalDistanceKm.toFixed(1)} km` : "N/D";

    return (
      <Pressable
        style={({ pressed }) => [styles.routeCard, pressed && styles.routeCardPressed]}
        onPress={() => router.push(`/routes/${route.id}` as any)}
      >
        <View style={styles.routeIconContainer}>
          <MaterialCommunityIcons
            name="map-marker-path"
            size={28}
            color={Colors.accent}
          />
        </View>
        <View style={styles.routeInfo}>
          <View style={styles.routeTitleRow}>
            <Text style={styles.routeTitle} numberOfLines={1}>{route.title}</Text>
            {route.isPublic ? (
              <View style={styles.badge}>
                <Ionicons name="globe-outline" size={12} color={Colors.success} />
                <Text style={styles.badgeText}>Pubblico</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.privateBadge]}>
                <Ionicons name="lock-closed-outline" size={12} color={Colors.textSecondary} />
                <Text style={[styles.badgeText, styles.privateBadgeText]}>Privato</Text>
              </View>
            )}
          </View>
          {route.description ? (
            <Text style={styles.routeDescription} numberOfLines={1}>{route.description}</Text>
          ) : null}
          <View style={styles.routeMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{waypointCount} tappe</Text>
            </View>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="road-variant" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{distance}</Text>
            </View>
            {!item.isMine && route.ownerNickname ? (
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{route.ownerNickname}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {allItems.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="map-marker-plus-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>Nessun percorso</Text>
          <Text style={styles.emptyText}>
            Crea il tuo primo percorso personalizzato con tappe e punti di interesse.
          </Text>
        </View>
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item, index) =>
            item.type === "header" ? `header-${index}` : `route-${item.route.id}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
          { bottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        onPress={() => router.push("/routes/create" as any)}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  disabledTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "600" as const,
    marginTop: 16,
    textAlign: "center",
  },
  disabledText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "600" as const,
    marginTop: 16,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionHeader: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: "700" as const,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 12,
  },
  routeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routeCardPressed: {
    opacity: 0.7,
  },
  routeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  routeInfo: {
    flex: 1,
    marginRight: 8,
  },
  routeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600" as const,
    flexShrink: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: "600" as const,
  },
  privateBadge: {
    backgroundColor: "rgba(170, 170, 170, 0.15)",
  },
  privateBadgeText: {
    color: Colors.textSecondary,
  },
  routeDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  routeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
    }),
  },
  fabPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
