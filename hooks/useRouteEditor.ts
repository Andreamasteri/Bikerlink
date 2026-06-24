import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { BackHandler, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useT } from "@/lib/language-context";

export interface LocalWaypoint {
  localId: string; name: string; description: string;
  latitude: number; longitude: number; waypointType: string; orderIndex: number;
}
type ExistingRouteWp = { id: string; name: string; description: string | null; latitude: number; longitude: number; waypointType: string; orderIndex: number };
type ExistingRoute = { id: string; title: string; description: string | null; waypoints: ExistingRouteWp[] };

function getWaypointTypes(t: (k: string) => string) {
  return [
    { value: "start", label: t("routes.start"), icon: "flag" as const, color: "#4CAF50" },
    { value: "stop", label: t("routes.stopType"), icon: "pause-circle" as const, color: "#FF9800" },
    { value: "poi", label: t("routes.poiType"), icon: "star" as const, color: "#2196F3" },
    { value: "end", label: t("routes.endType"), icon: "flag-checkered" as const, color: "#E63946" },
  ];
}
export function generateId() { return Date.now().toString() + Math.random().toString(36).substr(2, 9); }

export function useRouteEditor() {
  const t = useT();
  const WAYPOINT_TYPES = useMemo(() => getWaypointTypes(t), [t]);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditMode = !!editId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [waypoints, setWaypoints] = useState<LocalWaypoint[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [pendingCoord, setPendingCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [, setEditingWaypointIndex] = useState<number | null>(null);
  const [waypointName, setWaypointName] = useState("");
  const [waypointDesc, setWaypointDesc] = useState("");
  const [waypointType, setWaypointType] = useState("stop");
  const [showWaypointForm, setShowWaypointForm] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [createdRouteId, setCreatedRouteId] = useState<string | null>(null);
  const [isSettingVisibility, setIsSettingVisibility] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!mapOpen) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => { setMapOpen(false); return true; });
    return () => handler.remove();
  }, [mapOpen]);

  const { data: existingRoute } = useQuery({
    queryKey: ["/api/custom-routes", editId],
    queryFn: async () => {
      if (!editId) return null;
      const url = new URL(`/api/custom-routes/${editId}`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return null;
      return res.json() as Promise<ExistingRoute>;
    },
    enabled: !!editId,
  });

  useEffect(() => {
    if (!existingRoute) return;
    setTitle(existingRoute.title);
    setDescription(existingRoute.description ?? "");
    setWaypoints(
      existingRoute.waypoints.sort((a, b) => a.orderIndex - b.orderIndex).map((wp) => ({
        localId: wp.id, name: wp.name, description: wp.description ?? "",
        latitude: wp.latitude, longitude: wp.longitude,
        waypointType: wp.waypointType, orderIndex: wp.orderIndex,
      }))
    );
  }, [existingRoute]);

  const handleImportGpx = useCallback(async () => {
    try {
      setIsImporting(true);
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/gpx+xml", "application/octet-stream", "*/*"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const gpxContent = await FileSystem.readAsStringAsync(asset.uri);
      const guessedTitle = (asset.name ?? "").replace(/\.gpx$/i, "").replace(/[_-]+/g, " ").trim();
      const res = await apiRequest("POST", "/api/custom-routes/import-gpx", { gpxContent, title: guessedTitle || undefined });
      const route = await res.json() as { id: string };
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routerRef.current.replace(`/routes/${route.id}` as any);
    } catch (err: unknown) {
      Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile leggere il file GPX.");
    } finally { setIsImporting(false); }
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEditMode && editId) {
        await apiRequest("PUT", `/api/custom-routes/${editId}`, { title: title.trim(), description: description.trim() || null });
        await apiRequest("DELETE", `/api/custom-routes/${editId}/waypoints`);
        for (let i = 0; i < waypoints.length; i++) {
          const wp = waypoints[i];
          await apiRequest("POST", `/api/custom-routes/${editId}/waypoints`, {
            name: wp.name, description: wp.description || null,
            latitude: parseFloat(String(wp.latitude)), longitude: parseFloat(String(wp.longitude)),
            waypointType: wp.waypointType, orderIndex: i,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
        return { id: editId };
      }
      const routeRes = await apiRequest("POST", "/api/custom-routes", { title: title.trim(), description: description.trim() || null, isPublic: false });
      const route = await routeRes.json() as { id: string };
      if (!route.id) throw new Error("Risposta inattesa dal server");
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        await apiRequest("POST", `/api/custom-routes/${route.id}/waypoints`, {
          name: wp.name, description: wp.description || null,
          latitude: parseFloat(String(wp.latitude)), longitude: parseFloat(String(wp.longitude)),
          waypointType: wp.waypointType, orderIndex: i,
        });
      }
      return route;
    },
    onSuccess: (route) => {
      if (isEditMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(`/routes/${route.id}` as any);
      } else { setCreatedRouteId(route.id); setShowPublishDialog(true); }
    },
    onError: (err: Error) => { Alert.alert("Errore", err.message); },
  });

  const handlePublishChoice = async (publish: boolean) => {
    if (!createdRouteId) return;
    setIsSettingVisibility(true);
    try {
      await apiRequest("PUT", `/api/custom-routes/${createdRouteId}`, { isPublic: publish });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      setShowPublishDialog(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(`/routes/${createdRouteId}` as any);
    } catch (e: unknown) {
      Alert.alert(t("common.error"), (e as Error).message || t("routes.cannotUpdateVisibilityLater"));
      queryClient.invalidateQueries({ queryKey: ["/api/custom-routes"] });
      setShowPublishDialog(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(`/routes/${createdRouteId}` as any);
    } finally { setIsSettingVisibility(false); }
  };

  const openMapForNewWaypoint = useCallback(() => { setPendingCoord(null); setEditingWaypointIndex(null); setMapOpen(true); }, []);

  const handleMapConfirm = useCallback(() => {
    if (!pendingCoord) return;
    setMapOpen(false);
    setWaypointName(""); setWaypointDesc(""); setWaypointType(waypoints.length === 0 ? "start" : "stop");
    setShowWaypointForm(true);
  }, [pendingCoord, waypoints.length]);

  const handleWaypointFormSave = useCallback(() => {
    if (!pendingCoord || !waypointName.trim()) { Alert.alert("Errore", "Inserisci un nome per il waypoint"); return; }
    setWaypoints((prev) => [...prev, {
      localId: generateId(), name: waypointName.trim(), description: waypointDesc.trim(),
      latitude: pendingCoord.latitude, longitude: pendingCoord.longitude, waypointType, orderIndex: prev.length,
    }]);
    setShowWaypointForm(false); setPendingCoord(null);
  }, [pendingCoord, waypointName, waypointDesc, waypointType]);

  const removeWaypoint = useCallback((index: number) => { setWaypoints((prev) => prev.filter((_, i) => i !== index)); }, []);

  const moveWaypoint = useCallback((index: number, direction: "up" | "down") => {
    setWaypoints((prev) => {
      const arr = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= arr.length) return prev;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  }, []);

  const getWaypointMeta = useCallback((type: string) => WAYPOINT_TYPES.find((w) => w.value === type) || WAYPOINT_TYPES[1], [WAYPOINT_TYPES]);

  return {
    t, WAYPOINT_TYPES, isEditMode, canSave: title.trim().length > 0 && waypoints.length >= 2,
    title, setTitle, description, setDescription,
    waypoints, mapOpen, setMapOpen, pendingCoord, setPendingCoord,
    waypointName, setWaypointName, waypointDesc, setWaypointDesc,
    waypointType, setWaypointType, showWaypointForm, setShowWaypointForm,
    showPublishDialog, isSettingVisibility, isImporting,
    saveMutation, handleImportGpx, handlePublishChoice,
    openMapForNewWaypoint, handleMapConfirm, handleWaypointFormSave,
    removeWaypoint, moveWaypoint, getWaypointMeta,
  };
}
