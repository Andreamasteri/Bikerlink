import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  BackHandler,
  Text,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import MapPickerContent from "@/components/MapPickerModal";
import { useT } from "@/lib/language-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { buildPlannerMapHtml } from "@/lib/leaflet-route-map-html";
import { useMapConfig } from "@/lib/map-context";

// Sub-components
import { RouteOptionsPanel } from "@/components/routes/create/RouteOptionsPanel";
import { RouteMapPreview } from "@/components/routes/create/RouteMapPreview";
import { RouteWaypointsInput } from "@/components/routes/create/RouteWaypointsInput";
import { WaypointFormModal } from "@/components/routes/create/WaypointFormModal";
import { PublishRouteModal } from "@/components/routes/create/PublishRouteModal";
import { RouteAiSection } from "@/components/routes/create/RouteAiSection";

function getWaypointTypes(t: (key: string) => string) {
  return [
    { value: "start", label: t("routes.start"), icon: "flag" as const, color: "#4CAF50" },
    { value: "stop", label: t("routes.stopType"), icon: "pause-circle" as const, color: "#FF9800" },
    { value: "poi", label: t("routes.poiType"), icon: "star" as const, color: "#2196F3" },
    { value: "end", label: t("routes.endType"), icon: "flag-checkered" as const, color: "#E63946" },
  ];
}

interface LocalWaypoint {
  localId: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  waypointType: string;
  orderIndex: number;
}

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export default function CreateRouteScreen() {
  const t = useT();
  const WAYPOINT_TYPES = useMemo(() => getWaypointTypes(t), [t]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditMode = !!editId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebView ref type
  const webviewRef = useRef<any>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [waypoints, setWaypoints] = useState<LocalWaypoint[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [pendingCoord, setPendingCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [, setEditingWaypointIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!mapOpen) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      setMapOpen(false);
      return true;
    });
    return () => handler.remove();
  }, [mapOpen]);

  const [waypointName, setWaypointName] = useState("");
  const [waypointDesc, setWaypointDesc] = useState("");
  const [waypointType, setWaypointType] = useState("stop");
  const [showWaypointForm, setShowWaypointForm] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [createdRouteId, setCreatedRouteId] = useState<string | null>(null);
  const [isSettingVisibility, setIsSettingVisibility] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [routePolylinePts, setRoutePolylinePts] = useState<Array<{ lat: number; lng: number }>>([]);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const routeAbortControllerRef = useRef<AbortController | null>(null);
  const routeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [routeStats, setRouteStats] = useState<{ distanceKm: number; durationMinutes: number } | null>(null);
  const [routeStyle, setRouteStyle] = useState<"curvy" | "balanced" | "fastest">("balanced");

  // Edit mode: load existing route
  const { data: existingRoute } = useQuery({
    queryKey: ["/api/custom-routes", editId],
    queryFn: async () => {
      if (!editId) return null;
      const url = new URL(`/api/custom-routes/${editId}`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return null;
      return res.json() as Promise<{ id: string; title: string; description: string | null; waypoints: Array<{ id: string; name: string; description: string | null; latitude: number; longitude: number; waypointType: string; orderIndex: number }> }>;
    },
    enabled: !!editId,
  });

  useEffect(() => {
    if (!existingRoute) return;
    setTitle(existingRoute.title);
    setDescription(existingRoute.description ?? "");
    const wps: LocalWaypoint[] = existingRoute.waypoints
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((wp) => ({
        localId: wp.id,
        name: wp.name,
        description: wp.description ?? "",
        latitude: wp.latitude,
        longitude: wp.longitude,
        waypointType: wp.waypointType,
        orderIndex: wp.orderIndex,
      }));
    setWaypoints(wps);
  }, [existingRoute]);

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

      const res = await apiRequest("POST", "/api/custom-routes/import-gpx", {
        gpxContent,
        title: guessedTitle || undefined,
      });
      const route = await res.json() as { id: string };
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace(`/routes/${route.id}` as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? (err as Error).message : "Impossibile leggere il file GPX.";
      Alert.alert("Errore", msg);
    } finally {
      setIsImporting(false);
    }
  }, [router]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEditMode && editId) {
        await apiRequest("PUT", `/api/custom-routes/${editId}`, {
          title: title.trim(),
          description: description.trim() || null,
        });
        await apiRequest("DELETE", `/api/custom-routes/${editId}/waypoints`);
        for (let i = 0; i < waypoints.length; i++) {
          const wp = waypoints[i];
          await apiRequest("POST", `/api/custom-routes/${editId}/waypoints`, {
            name: wp.name,
            description: wp.description || null,
            latitude: parseFloat(String(wp.latitude)),
            longitude: parseFloat(String(wp.longitude)),
            waypointType: wp.waypointType,
            orderIndex: i,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
        return { id: editId };
      } else {
        const routeRes = await apiRequest("POST", "/api/custom-routes", {
          title: title.trim(),
          description: description.trim() || null,
          isPublic: false,
        });
        const route = await routeRes.json() as { id: string };
        if (!route.id) throw new Error("Risposta inattesa dal server");

        for (let i = 0; i < waypoints.length; i++) {
          const wp = waypoints[i];
          await apiRequest("POST", `/api/custom-routes/${route.id}/waypoints`, {
            name: wp.name,
            description: wp.description || null,
            latitude: parseFloat(String(wp.latitude)),
            longitude: parseFloat(String(wp.longitude)),
            waypointType: wp.waypointType,
            orderIndex: i,
          });
        }

        return route;
      }
    },
    onSuccess: (route) => {
      if (isEditMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
        router.replace(`/routes/${route.id}` as any);
      } else {
        setCreatedRouteId(route.id);
        setShowPublishDialog(true);
      }
    },
    onError: (err: Error) => {
      Alert.alert("Errore", (err as Error).message);
    },
  });

  const handlePublishChoice = async (publish: boolean) => {
    if (!createdRouteId) return;
    setIsSettingVisibility(true);
    try {
      await apiRequest("PUT", `/api/custom-routes/${createdRouteId}`, { isPublic: publish });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      setShowPublishDialog(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace(`/routes/${createdRouteId}` as any);
    } catch (e: unknown) {
      Alert.alert(t("common.error"), (e as Error).message || t("routes.cannotUpdateVisibilityLater"));
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      setShowPublishDialog(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace(`/routes/${createdRouteId}` as any);
    } finally {
      setIsSettingVisibility(false);
    }
  };

  const openMapForNewWaypoint = useCallback(() => {
    setPendingCoord(null);
    setEditingWaypointIndex(null);
    setMapOpen(true);
  }, []);

  const handleMapConfirm = useCallback(() => {
    if (!pendingCoord) return;
    setMapOpen(false);

    const autoType = waypoints.length === 0 ? "start" : "stop";

    setWaypointName("");
    setWaypointDesc("");
    setWaypointType(autoType);
    setShowWaypointForm(true);
  }, [pendingCoord, waypoints.length]);

  const handleWaypointFormSave = useCallback(() => {
    if (!pendingCoord || !waypointName.trim()) {
      Alert.alert("Errore", "Inserisci un nome per il waypoint");
      return;
    }

    const newWp: LocalWaypoint = {
      localId: generateId(),
      name: waypointName.trim(),
      description: waypointDesc.trim(),
      latitude: pendingCoord.latitude,
      longitude: pendingCoord.longitude,
      waypointType,
      orderIndex: waypoints.length,
    };

    setWaypoints((prev) => [...prev, newWp]);
    setShowWaypointForm(false);
    setPendingCoord(null);
  }, [pendingCoord, waypointName, waypointDesc, waypointType, waypoints.length]);

  const removeWaypoint = useCallback((index: number) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveWaypoint = useCallback((index: number, direction: "up" | "down") => {
    setWaypoints((prev) => {
      const arr = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= arr.length) return prev;
      [arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]];
      return arr;
    });
  }, []);

  const getWaypointMeta = useCallback((type: string) => {
    return WAYPOINT_TYPES.find((w) => w.value === type) || WAYPOINT_TYPES[1];
  }, [WAYPOINT_TYPES]);

  const canSave = title.trim().length > 0 && waypoints.length >= 2;

  // Curvature map
  const { activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const [curvatureMapHtml, setCurvatureMapHtml] = useState<string>("");
  const curvatureMapMountedRef = useRef(false);

  const waypointsRef = useRef<LocalWaypoint[]>(waypoints);
  waypointsRef.current = waypoints;

  const routePolylinePtsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  routePolylinePtsRef.current = routePolylinePts;

  const injectWaypoints = useCallback((wps: LocalWaypoint[], polylinePts?: Array<{ lat: number; lng: number }>) => {
    if (!webviewRef.current || wps.length < 2) return;
    const pts = polylinePts && polylinePts.length > 1 ? polylinePts : wps.map((wp) => ({ lat: wp.latitude, lng: wp.longitude }));
    const ptsJson = JSON.stringify(pts);
    const wpsJson = JSON.stringify(wps.map((wp) => ({ lat: wp.latitude, lng: wp.longitude, name: wp.name })));
    const js = `(function(){ if(typeof window.updateWaypoints==='function'){ window.updateWaypoints(${wpsJson}, ${ptsJson}); } })(); true;`;
    webviewRef.current.injectJavaScript(js);
  }, []);

  const calculateRealRoute = useCallback(async (wps: LocalWaypoint[], signal: AbortSignal, style: "curvy" | "balanced" | "fastest" = "balanced") => {
    if (wps.length < 2) {
      setRoutePolylinePts([]);
      setRouteStats(null);
      return;
    }
    setIsCalculatingRoute(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/planned-routes/calculate", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal,
        body: JSON.stringify({
          waypoints: wps.map((wp) => ({ lat: wp.latitude, lng: wp.longitude, name: wp.name })),
          style,
        }),
      });
      if (signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rawPoints?: Array<{ lat: number; lng: number }>; distanceKm?: number; durationMinutes?: number };
      const pts = data.rawPoints && data.rawPoints.length > 1 ? data.rawPoints : [];
      setRoutePolylinePts(pts);
      if (typeof data.distanceKm === "number" && typeof data.durationMinutes === "number") {
        setRouteStats({ distanceKm: data.distanceKm, durationMinutes: data.durationMinutes });
      } else {
        setRouteStats(null);
      }
      injectWaypoints(wps, pts.length > 1 ? pts : undefined);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setRoutePolylinePts([]);
      setRouteStats(null);
      injectWaypoints(wps);
    } finally {
      if (!signal.aborted) {
        setIsCalculatingRoute(false);
      }
    }
  }, [injectWaypoints]);

  const handleMapLoaded = useCallback(() => {
    injectWaypoints(waypointsRef.current, routePolylinePtsRef.current.length > 1 ? routePolylinePtsRef.current : undefined);
  }, [injectWaypoints]);

  useEffect(() => {
    if (waypoints.length < 2) {
      curvatureMapMountedRef.current = false;
      setRoutePolylinePts([]);
      if (routeDebounceTimerRef.current !== null) {
        clearTimeout(routeDebounceTimerRef.current);
        routeDebounceTimerRef.current = null;
      }
      if (routeAbortControllerRef.current) {
        routeAbortControllerRef.current.abort();
        routeAbortControllerRef.current = null;
      }
      setIsCalculatingRoute(false);
      return;
    }

    if (!curvatureMapMountedRef.current) {
      curvatureMapMountedRef.current = true;
      setCurvatureMapHtml(buildPlannerMapHtml(
        activeTileUrl,
        activeTileMaxZoom,
        Colors.accent,
        waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude, name: wp.name })),
        waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude })),
        null,
      ));
    } else {
      injectWaypoints(waypoints, routePolylinePtsRef.current.length > 1 ? routePolylinePtsRef.current : undefined);
    }

    if (routeDebounceTimerRef.current !== null) {
      clearTimeout(routeDebounceTimerRef.current);
    }
    if (routeAbortControllerRef.current) {
      routeAbortControllerRef.current.abort();
    }

    const snapshotWaypoints = waypoints;
    const snapshotStyle = routeStyle;
    routeDebounceTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      routeAbortControllerRef.current = controller;
      routeDebounceTimerRef.current = null;
      calculateRealRoute(snapshotWaypoints, controller.signal, snapshotStyle);
    }, 600);

    return () => {
      if (routeDebounceTimerRef.current !== null) {
        clearTimeout(routeDebounceTimerRef.current);
        routeDebounceTimerRef.current = null;
      }
      if (routeAbortControllerRef.current) {
        routeAbortControllerRef.current.abort();
        routeAbortControllerRef.current = null;
      }
    };
  }, [waypoints, activeTileUrl, activeTileMaxZoom, injectWaypoints, calculateRealRoute, routeStyle]);

  return (
    <View style={[styles.container]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        <RouteAiSection t={t} />

        <RouteOptionsPanel
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
        />

        <RouteMapPreview
          waypoints={waypoints}
          curvatureMapHtml={curvatureMapHtml}
          webviewRef={webviewRef}
          handleMapLoaded={handleMapLoaded}
          routeStyle={routeStyle}
          setRouteStyle={setRouteStyle}
          isCalculatingRoute={isCalculatingRoute}
          routeStats={routeStats}
        />

        <RouteWaypointsInput
          waypoints={waypoints}
          t={t}
          handleImportGpx={handleImportGpx}
          isImporting={isImporting}
          openMapForNewWaypoint={openMapForNewWaypoint}
          getWaypointMeta={getWaypointMeta}
          moveWaypoint={moveWaypoint}
          removeWaypoint={removeWaypoint}
        />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark" size={22} color="#fff" />
              <Text style={styles.saveBtnText}>Salva Percorso</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {mapOpen && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999 }}>
          <MapPickerContent
            coord={pendingCoord}
            onCoordChange={setPendingCoord}
            onConfirm={handleMapConfirm}
            onClose={() => setMapOpen(false)}
            initialRegion={waypoints.length > 0 ? {
              latitude: waypoints[waypoints.length - 1].latitude,
              longitude: waypoints[waypoints.length - 1].longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            } : undefined}
            existingWaypoints={waypoints.map((wp) => ({
              latitude: wp.latitude,
              longitude: wp.longitude,
              name: wp.name,
              waypointType: wp.waypointType,
            }))}
          />
        </View>
      )}

      <WaypointFormModal
        visible={showWaypointForm}
        waypointName={waypointName}
        setWaypointName={setWaypointName}
        waypointDesc={waypointDesc}
        setWaypointDesc={setWaypointDesc}
        waypointType={waypointType}
        setWaypointType={setWaypointType}
        waypointTypes={WAYPOINT_TYPES}
        pendingCoord={pendingCoord}
        onClose={() => {
          setShowWaypointForm(false);
          setPendingCoord(null);
        }}
        onSave={handleWaypointFormSave}
      />

      <PublishRouteModal
        visible={showPublishDialog}
        isSettingVisibility={isSettingVisibility}
        onChoice={handlePublishChoice}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  betaWarning: {
    flexDirection: "row" as const,
    backgroundColor: "#FF660018",
    borderWidth: 1,
    borderColor: "#FF6600",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 16,
    alignItems: "flex-start" as const,
  },
  betaWarningText: {
    flex: 1,
    color: "#FF6600",
    fontSize: 12,
    fontWeight: "700" as const,
    lineHeight: 18,
  },
  bottomBar: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  saveBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" as const },
});

