import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,

} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { getCurrentLocale } from "@/lib/i18n";

const USER_ROUTES_SCREEN_OPTIONS = {
  headerShown: true,
  title: "Percorsi pubblici",
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.text,
} as const;

interface PublicRoute {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  totalDistanceKm: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  waypointCount: number;
}

export default function UserPublicRoutesScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const baseUrl = getApiUrl();

  const { data, isLoading } = useQuery<{ routes: PublicRoute[] }>({
    queryKey: ["/api/users", userId, "custom-routes"],
    queryFn: async () => {
      const res = await fetch(
        new URL(`/api/users/${userId}/custom-routes`, baseUrl).toString(),
        { credentials: "include" }
      );
      if (!res.ok) return { routes: [] };
      return res.json();
    },
    enabled: !!userId,
  });

  const routes = data?.routes ?? [];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(getCurrentLocale(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const webTopInset = 0;

  return (
    <>
      <Stack.Screen options={USER_ROUTES_SCREEN_OPTIONS} />
      <View style={[styles.container, { paddingTop: webTopInset }]}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : routes.length === 0 ? (
          <View style={styles.centered}>
            <MaterialCommunityIcons name="map-marker-off" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>Nessun percorso pubblico</Text>
            <Text style={styles.emptyText}>
              Questo utente non ha ancora condiviso percorsi pubblici.
            </Text>
          </View>
        ) : (
          <FlatList
            data={routes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const distance = item.totalDistanceKm
                ? `${item.totalDistanceKm.toFixed(1)} km`
                : "N/D";
              return (
                <Pressable
                  style={({ pressed }) => [styles.routeCard, pressed && styles.routeCardPressed]}
                  onPress={() => router.push(`/routes/${item.id}` as never)}
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
                      <Text style={styles.routeTitle} numberOfLines={1}>{item.title}</Text>
                      <View style={styles.publicBadge}>
                        <Ionicons name="globe-outline" size={11} color={Colors.success} />
                        <Text style={styles.publicBadgeText}>Pubblico</Text>
                      </View>
                    </View>
                    {item.description ? (
                      <Text style={styles.routeDescription} numberOfLines={1}>{item.description}</Text>
                    ) : null}
                    <View style={styles.routeMeta}>
                      <View style={styles.metaItem}>
                        <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                        <Text style={styles.metaText}>{item.waypointCount} tappe</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <MaterialCommunityIcons name="road-variant" size={13} color={Colors.textSecondary} />
                        <Text style={styles.metaText}>{distance}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                        <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </>
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
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "600" as const,
    marginTop: 16,
    textAlign: "center",
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
  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  publicBadgeText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: "600" as const,
  },
  routeDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  routeMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
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
});
