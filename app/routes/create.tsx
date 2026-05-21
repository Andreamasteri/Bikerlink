import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import WebView from "react-native-webview";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import MapPickerContent from "@/components/MapPickerModal";
import { useT } from "@/lib/language-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { buildPlannerMapHtml } from "@/lib/leaflet-route-map-html";
import { getTileConfig } from "@/lib/map-tiles";

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


function getWaypointMeta(type: string, types: ReturnType<typeof getWaypointTypes>) {
  return types.find((w) => w.value === type) || types[1];
}

export default function CreateRouteScreen() {
  const t = useT();
  const WAYPOINT_TYPES = getWaypointTypes(t);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditMode = !!editId;
  const webviewRef = useRef<any>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [waypoints, setWaypoints] = useState<LocalWaypoint[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [pendingCoord, setPendingCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [editingWaypointIndex, setEditingWaypointIndex] = useState<number | null>(null);

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

  // Edit mode: load existing route
  const { data: existingRoute, isLoading: isLoadingExisting } = useQuery({
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
      router.replace(`/routes/${route.id}` as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Impossibile leggere il file GPX.";
      Alert.alert("Errore", msg);
    } finally {
      setIsImporting(false);
    }
  }, [router]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEditMode && editId) {
        // Update title/description
        await apiRequest("PUT", `/api/custom-routes/${editId}`, {
          title: title.trim(),
          description: description.trim() || null,
        });
        // Delete old waypoints then re-create (simple approach)
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
        router.replace(`/routes/${route.id}` as any);
      } else {
        setCreatedRouteId(route.id);
        setShowPublishDialog(true);
      }
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  const handlePublishChoice = async (publish: boolean) => {
    if (!createdRouteId) return;
    setIsSettingVisibility(true);
    try {
      await apiRequest("PUT", `/api/custom-routes/${createdRouteId}`, { isPublic: publish });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      setShowPublishDialog(false);
      router.replace(`/routes/${createdRouteId}` as any);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("routes.cannotUpdateVisibilityLater"));
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      setShowPublishDialog(false);
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

    const autoType =
      waypoints.length === 0
        ? "start"
        : "stop";

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

  const canSave = title.trim().length > 0 && waypoints.length >= 2;

  // Curvature map
  const tileConfig = useMemo(() => getTileConfig(), []);
  const [curvatureMapHtml, setCurvatureMapHtml] = useState<string>("");
  const curvatureMapMountedRef = useRef(false);

  // Always-current ref so onLoadEnd can read the latest waypoints without stale closures
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

  const calculateRealRoute = useCallback(async (wps: LocalWaypoint[], signal: AbortSignal) => {
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
          style: "balanced",
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

  // When the WebView finishes loading (initial load or any reload), sync current
  // waypoints so fitBounds is always called with up-to-date coordinates.
  const handleMapLoaded = useCallback(() => {
    injectWaypoints(waypointsRef.current, routePolylinePtsRef.current.length > 1 ? routePolylinePtsRef.current : undefined);
  }, [injectWaypoints]);

  useEffect(() => {
    if (waypoints.length < 2) {
      curvatureMapMountedRef.current = false;
      setRoutePolylinePts([]);
      // Cancel any in-flight request and pending debounce
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
      // First time the map becomes visible: bake current waypoints into the HTML.
      // handleMapLoaded will fire once the WebView finishes loading and will
      // call updateWaypoints (+ fitBounds) with the then-current waypoints.
      curvatureMapMountedRef.current = true;
      setCurvatureMapHtml(buildPlannerMapHtml(
        tileConfig.url,
        tileConfig.maxZoom,
        Colors.accent,
        waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude, name: wp.name })),
        waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude })),
        null,
      ));
    } else {
      // Already mounted: update markers, polyline and re-fit via JS injection
      // (no reload/flicker). Covers add, remove AND reorder.
      injectWaypoints(waypoints, routePolylinePtsRef.current.length > 1 ? routePolylinePtsRef.current : undefined);
    }

    // Debounce + abort: cancel any pending timer and previous in-flight request,
    // then wait 600ms before firing a new route calculation.
    if (routeDebounceTimerRef.current !== null) {
      clearTimeout(routeDebounceTimerRef.current);
    }
    if (routeAbortControllerRef.current) {
      routeAbortControllerRef.current.abort();
    }

    const snapshotWaypoints = waypoints;
    routeDebounceTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      routeAbortControllerRef.current = controller;
      routeDebounceTimerRef.current = null;
      calculateRealRoute(snapshotWaypoints, controller.signal);
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
  }, [waypoints, tileConfig, injectWaypoints, calculateRealRoute]);

  return (
    <View style={[styles.container]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.betaWarning}>
          <MaterialCommunityIcons name="alert" size={22} color="#FF6600" />
          <Text style={styles.betaWarningText}>
            {t("routes.betaWarning")}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Titolo *</Text>
          <TextInput
            style={styles.input}
            placeholder="Es. Giro del Lago di Garda"
            placeholderTextColor={Colors.textSecondary}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Descrizione</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Descrivi il percorso..."
            placeholderTextColor={Colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>


        {/* Curvature map — shown when there are at least 2 waypoints */}
        {waypoints.length >= 2 && curvatureMapHtml !== "" && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Anteprima percorso (curvatura)</Text>
            <View style={{ height: 200, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: Colors.border }}>
              <WebView
                ref={webviewRef}
                source={{ html: curvatureMapHtml, baseUrl: "" }}
                style={{ flex: 1 }}
                scrollEnabled={false}
                javaScriptEnabled
                originWhitelist={["*"]}
                onLoadEnd={handleMapLoaded}
              />
              {isCalculatingRoute && (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </View>
            {routeStats && !isCalculatingRoute && (
              <View style={styles.routeStatsRow}>
                <Ionicons name="navigate" size={14} color={Colors.accent} />
                <Text style={styles.routeStatText}>{routeStats.distanceKm % 1 === 0 ? routeStats.distanceKm : routeStats.distanceKm.toFixed(1)} km</Text>
                <Text style={styles.routeStatSep}>·</Text>
                <Ionicons name="time-outline" size={14} color={Colors.accent} />
                <Text style={styles.routeStatText}>
                  {routeStats.durationMinutes >= 60
                    ? `${Math.floor(routeStats.durationMinutes / 60)}h ${routeStats.durationMinutes % 60 > 0 ? `${routeStats.durationMinutes % 60} min` : ""}`.trim()
                    : `${routeStats.durationMinutes} min`}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.waypointHeader}>
          <Text style={styles.sectionTitle}>Tappe ({waypoints.length})</Text>
          <View style={styles.waypointHeaderBtns}>
            <TouchableOpacity
              style={[styles.addBtn, styles.importBtn]}
              onPress={handleImportGpx}
              disabled={isImporting}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color="#FF6600" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#FF6600" />
                  <Text style={styles.importBtnText}>Importa GPX</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={openMapForNewWaypoint}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addBtnText}>Aggiungi</Text>
            </TouchableOpacity>
          </View>
        </View>

        {waypoints.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="navigate-outline" size={36} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>
              {t("routes.noStops")}
            </Text>
          </View>
        )}

        {waypoints.map((wp, index) => {
          const meta = getWaypointMeta(wp.waypointType, WAYPOINT_TYPES);
          return (
            <View key={wp.localId} style={styles.waypointCard}>
              <View style={styles.waypointCardLeft}>
                <View style={[styles.waypointIconWrap, { backgroundColor: meta.color + "22" }]}>
                  <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={styles.waypointInfo}>
                  <Text style={styles.waypointName} numberOfLines={1}>{wp.name}</Text>
                  <Text style={styles.waypointMeta}>
                    {meta.label} - {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                  </Text>
                  {wp.description ? (
                    <Text style={styles.waypointDescText} numberOfLines={1}>{wp.description}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.waypointActions}>
                <TouchableOpacity
                  onPress={() => moveWaypoint(index, "up")}
                  disabled={index === 0}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="chevron-up"
                    size={20}
                    color={index === 0 ? Colors.border : Colors.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveWaypoint(index, "down")}
                  disabled={index === waypoints.length - 1}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={index === waypoints.length - 1 ? Colors.border : Colors.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeWaypoint(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {waypoints.length > 0 && waypoints.length < 2 && (
          <Text style={styles.hint}>Aggiungi almeno 2 tappe per salvare il percorso.</Text>
        )}
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

      <Modal visible={showWaypointForm} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Dettagli Tappa</Text>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Nome *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Es. Ristorante da Mario"
                  placeholderTextColor={Colors.textSecondary}
                  value={waypointName}
                  onChangeText={setWaypointName}
                  maxLength={200}
                  autoFocus
                />

                <Text style={styles.fieldLabel}>Descrizione</Text>
                <TextInput
                  style={[styles.modalInput, { height: 60 }]}
                  placeholder="Opzionale"
                  placeholderTextColor={Colors.textSecondary}
                  value={waypointDesc}
                  onChangeText={setWaypointDesc}
                  multiline
                />

                <Text style={styles.fieldLabel}>Tipo</Text>
                <View style={styles.typeRow}>
                  {WAYPOINT_TYPES.map((wt) => (
                    <TouchableOpacity
                      key={wt.value}
                      style={[
                        styles.typeChip,
                        waypointType === wt.value && { backgroundColor: wt.color + "33", borderColor: wt.color },
                      ]}
                      onPress={() => setWaypointType(wt.value)}
                    >
                      <MaterialCommunityIcons name={wt.icon} size={16} color={wt.color} />
                      <Text style={[styles.typeChipText, waypointType === wt.value && { color: wt.color }]}>
                        {wt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {pendingCoord && (
                  <Text style={styles.coordPreview}>
                    {pendingCoord.latitude.toFixed(6)}, {pendingCoord.longitude.toFixed(6)}
                  </Text>
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setShowWaypointForm(false);
                    setPendingCoord(null);
                  }}
                >
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleWaypointFormSave}>
                  <Ionicons name="checkmark" size={22} color="#fff" />
                  <Text style={styles.modalSaveBtnText}>Aggiungi</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Publish dialog after save */}
      <Modal visible={showPublishDialog} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <MaterialCommunityIcons name="earth" size={40} color={Colors.accent} style={{ marginBottom: 12 }} />
            <Text style={styles.dialogTitle}>Vuoi pubblicare il tuo percorso?</Text>
            <Text style={styles.dialogSubtitle}>
              I percorsi pubblici sono visibili a tutti gli utenti. Puoi cambiare questa impostazione in qualsiasi momento.
            </Text>
            {isSettingVisibility ? (
              <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 20 }} />
            ) : (
              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={styles.dialogBtnSecondary}
                  onPress={() => handlePublishChoice(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.dialogBtnSecondaryText}>No, tienilo privato</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dialogBtnPrimary}
                  onPress={() => handlePublishChoice(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="globe-outline" size={18} color="#fff" />
                  <Text style={styles.dialogBtnPrimaryText}>{t("routes.publishConfirm")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: { height: 80, textAlignVertical: "top" as const },
  switchRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  switchLabelWrap: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  switchLabel: { fontSize: 15, color: Colors.text, fontWeight: "500" as const },
  waypointHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700" as const, color: Colors.text },
  addBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" as const },
  waypointHeaderBtns: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  importBtn: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#FF6600",
  },
  importBtnText: { color: "#FF6600", fontSize: 14, fontWeight: "600" as const },
  emptyState: {
    alignItems: "center" as const,
    padding: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    lineHeight: 22,
  },
  waypointCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  waypointCardLeft: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  waypointIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  waypointInfo: { flex: 1 },
  waypointName: { fontSize: 15, fontWeight: "600" as const, color: Colors.text },
  waypointMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  waypointDescText: { fontSize: 12, color: Colors.textSecondary, marginTop: 1, fontStyle: "italic" as const },
  waypointActions: {
    flexDirection: "column" as const,
    alignItems: "center" as const,
    gap: 4,
    marginLeft: 8,
  },
  hint: {
    fontSize: 13,
    color: Colors.warning,
    textAlign: "center" as const,
    marginTop: 8,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 18, fontWeight: "700" as const, color: Colors.text, marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, marginTop: 4 },
  typeChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  typeChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "500" as const },
  coordPreview: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    marginTop: 12,
  },
  modalActions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  modalSaveBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 6,
  },
  modalSaveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" as const },
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  dialogBox: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center" as const,
  },
  dialogTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700" as const,
    textAlign: "center" as const,
    marginBottom: 10,
  },
  dialogSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: "center" as const,
    lineHeight: 20,
    marginBottom: 4,
  },
  dialogActions: {
    flexDirection: "column" as const,
    gap: 12,
    marginTop: 24,
    width: "100%",
  },
  dialogBtnPrimary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  dialogBtnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  dialogBtnSecondary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dialogBtnSecondaryText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  routeStatsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  routeStatText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  routeStatSep: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginHorizontal: 2,
  },
});
