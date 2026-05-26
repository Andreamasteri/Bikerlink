import { useState, useCallback, useEffect, useRef } from "react";
import { buildPlannerMapHtml } from "@/lib/leaflet-route-map-html";
import { useMapConfig } from "@/lib/map-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { LocalWaypoint } from "./useRouteEditor";

export function useRoutePlanning(waypoints: LocalWaypoint[]) {
  const { activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const [curvatureMapHtml, setCurvatureMapHtml] = useState("");
  const [routePolylinePts, setRoutePolylinePts] = useState<Array<{ lat: number; lng: number }>>([]);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeStats, setRouteStats] = useState<{ distanceKm: number; durationMinutes: number } | null>(null);
  const [routeStyle, setRouteStyle] = useState<"curvy" | "balanced" | "fastest">("balanced");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webviewRef = useRef<any>(null);
  const curvatureMapMountedRef = useRef(false);
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;
  const routePolylinePtsRef = useRef(routePolylinePts);
  routePolylinePtsRef.current = routePolylinePts;
  const routeAbortControllerRef = useRef<AbortController | null>(null);
  const routeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const injectWaypoints = useCallback((wps: LocalWaypoint[], polylinePts?: Array<{ lat: number; lng: number }>) => {
    if (!webviewRef.current || wps.length < 2) return;
    const pts = polylinePts && polylinePts.length > 1 ? polylinePts : wps.map((wp) => ({ lat: wp.latitude, lng: wp.longitude }));
    const ptsJson = JSON.stringify(pts);
    const wpsJson = JSON.stringify(wps.map((wp) => ({ lat: wp.latitude, lng: wp.longitude, name: wp.name })));
    const js = `(function(){ if(typeof window.updateWaypoints==='function'){ window.updateWaypoints(${wpsJson}, ${ptsJson}); } })(); true;`;
    webviewRef.current.injectJavaScript(js);
  }, []);

  const calculateRealRoute = useCallback(async (
    wps: LocalWaypoint[], signal: AbortSignal, style: "curvy" | "balanced" | "fastest" = "balanced",
  ) => {
    if (wps.length < 2) { setRoutePolylinePts([]); setRouteStats(null); return; }
    setIsCalculatingRoute(true);
    try {
      const url = new URL("/api/planned-routes/calculate", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", signal,
        body: JSON.stringify({ waypoints: wps.map((wp) => ({ lat: wp.latitude, lng: wp.longitude, name: wp.name })), style }),
      });
      if (signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rawPoints?: Array<{ lat: number; lng: number }>; distanceKm?: number; durationMinutes?: number };
      const pts = data.rawPoints && data.rawPoints.length > 1 ? data.rawPoints : [];
      setRoutePolylinePts(pts);
      setRouteStats(typeof data.distanceKm === "number" && typeof data.durationMinutes === "number"
        ? { distanceKm: data.distanceKm, durationMinutes: data.durationMinutes } : null);
      injectWaypoints(wps, pts.length > 1 ? pts : undefined);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setRoutePolylinePts([]); setRouteStats(null); injectWaypoints(wps);
    } finally { if (!signal.aborted) setIsCalculatingRoute(false); }
  }, [injectWaypoints]);

  const handleMapLoaded = useCallback(() => {
    injectWaypoints(waypointsRef.current, routePolylinePtsRef.current.length > 1 ? routePolylinePtsRef.current : undefined);
  }, [injectWaypoints]);

  useEffect(() => {
    if (waypoints.length < 2) {
      curvatureMapMountedRef.current = false;
      setRoutePolylinePts([]);
      if (routeDebounceTimerRef.current !== null) { clearTimeout(routeDebounceTimerRef.current); routeDebounceTimerRef.current = null; }
      if (routeAbortControllerRef.current) { routeAbortControllerRef.current.abort(); routeAbortControllerRef.current = null; }
      setIsCalculatingRoute(false);
      return;
    }

    if (!curvatureMapMountedRef.current) {
      curvatureMapMountedRef.current = true;
      setCurvatureMapHtml(buildPlannerMapHtml(
        activeTileUrl, activeTileMaxZoom, Colors.accent,
        waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude, name: wp.name })),
        waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude })),
        null,
      ));
    } else {
      injectWaypoints(waypoints, routePolylinePtsRef.current.length > 1 ? routePolylinePtsRef.current : undefined);
    }

    if (routeDebounceTimerRef.current !== null) clearTimeout(routeDebounceTimerRef.current);
    if (routeAbortControllerRef.current) routeAbortControllerRef.current.abort();

    const snapshotWaypoints = waypoints;
    const snapshotStyle = routeStyle;
    routeDebounceTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      routeAbortControllerRef.current = controller;
      routeDebounceTimerRef.current = null;
      calculateRealRoute(snapshotWaypoints, controller.signal, snapshotStyle);
    }, 600);

    return () => {
      if (routeDebounceTimerRef.current !== null) { clearTimeout(routeDebounceTimerRef.current); routeDebounceTimerRef.current = null; }
      if (routeAbortControllerRef.current) { routeAbortControllerRef.current.abort(); routeAbortControllerRef.current = null; }
    };
  }, [waypoints, activeTileUrl, activeTileMaxZoom, injectWaypoints, calculateRealRoute, routeStyle]);

  return { webviewRef, curvatureMapHtml, routePolylinePts, isCalculatingRoute, routeStats, routeStyle, setRouteStyle, handleMapLoaded };
}
