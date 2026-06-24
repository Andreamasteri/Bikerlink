import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import { loadIndex } from "@/lib/offline-tiles";
import { TelemetryProgressBanner } from "@/components/giri/list/TelemetryProgressBanner";
import { GiriListHeader } from "@/components/giri/list/GiriListHeader";
import { GiriListFilters, FilterTab } from "@/components/giri/list/GiriListFilters";
import { GiriListCard, PlannedRoute } from "@/components/giri/list/GiriListCard";
import { GiriEmptyState } from "@/components/giri/list/GiriEmptyState";
import OfflineMapsPanel from "@/components/profile/OfflineMapsPanel";

export default function GiriScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>("mine");

  const topPad = insets.top;
  const botPad = insets.bottom;

  const { data: routesData, isLoading, refetch } = useQuery<PlannedRoute[]>({
    queryKey: ["/api/planned-routes", filter],
    queryFn: async () => {
      const url = filter === "public"
        ? "/api/planned-routes?filter=public"
        : "/api/planned-routes";
      return apiRequest("GET", url).then((r) => r.json());
    },
  });
  const routes = useMemo(() => routesData ?? [], [routesData]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/planned-routes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/planned-routes"] }); },
  });

  const [offlineRouteIds, setOfflineRouteIds] = useState<Set<string>>(new Set());
  const offlineCheckScheduled = useRef(false);

  const refreshOfflineIndex = useCallback(async () => {
    try {
      const index = await loadIndex();
      setOfflineRouteIds(new Set(Object.keys(index)));
    } catch {
      // silently ignore — offline index is best-effort
    }
  }, []);

  useEffect(() => {
    refreshOfflineIndex();
  }, [refreshOfflineIndex]);

  // Re-check after routes load so new route IDs are evaluated
  useEffect(() => {
    if (!routes.length) return;
    if (offlineCheckScheduled.current) return;
    offlineCheckScheduled.current = true;
    const timer = setTimeout(() => {
      offlineCheckScheduled.current = false;
      refreshOfflineIndex();
    }, 300);
    return () => clearTimeout(timer);
  }, [routes, refreshOfflineIndex]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refreshOfflineIndex()]);
    setRefreshing(false);
  }, [refetch, refreshOfflineIndex]);

  const [isImporting, setIsImporting] = useState(false);

  const handleImportGpx = useCallback(async () => {
    try {
      setIsImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const gpxContent = await FileSystem.readAsStringAsync(asset.uri);

      const rawName = asset.name ?? "";
      const guessedTitle = rawName.replace(/\.gpx$/i, "").replace(/[_-]+/g, " ").trim();

      const res = await apiRequest("POST", "/api/planned-routes/import-gpx", {
        gpxContent,
        title: guessedTitle || undefined,
        visibility: "private",
      });
      const route = await res.json() as { id: string };
      qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
      router.push(`/giri/${route.id}` as never);
    } catch (err: unknown) {
      const msg = err instanceof Error ? (err as Error).message : "Impossibile leggere il file GPX.";
      Alert.alert("Errore", msg);
    } finally {
      setIsImporting(false);
    }
  }, [qc, router]);

  const s = styles(colors);

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <GiriListHeader
        isImporting={isImporting}
        onImportGpx={handleImportGpx}
        onPlan={() => router.push("/giri/create" as never)}
      />

      <TelemetryProgressBanner />

      <GiriListFilters
        filter={filter}
        onFilterChange={setFilter}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: botPad + 80, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <OfflineMapsPanel onIndexChanged={refreshOfflineIndex} />

        {isLoading ? (
          <View style={s.loadingState}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={s.loadingText}>Caricamento...</Text>
          </View>
        ) : routes.length === 0 ? (
          <GiriEmptyState 
            filter={filter} 
            onPlan={() => router.push("/giri/create" as never)} 
          />
        ) : (
          routes.map((route) => (
            <GiriListCard
              key={route.id}
              route={route}
              isOffline={offlineRouteIds.has(route.id)}
              isMine={filter === "mine"}
              onPress={() => router.push(`/giri/${route.id}` as never)}
              onDelete={() => deleteMutation.mutate(route.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingState: {
      alignItems: "center",
      paddingTop: 60,
      gap: 12,
    },
    loadingText: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.textSecondary,
    },
  });


