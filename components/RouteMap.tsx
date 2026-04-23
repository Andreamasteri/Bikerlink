import React, { useMemo } from "react";
import LeafletRouteMap from "@/components/LeafletRouteMap";
import type { RouteWaypoint } from "@/lib/leaflet-route-map-html";

interface RouteMapProps {
  points: Array<{ latitude: number; longitude: number; speedKmh?: number | null }>;
  height?: number;
  showMarkers?: boolean;
}

export default function RouteMap({ points, height = 260, showMarkers = true }: RouteMapProps) {
  const markerWaypoints: RouteWaypoint[] = useMemo(() => {
    if (points.length === 0) return [];
    const first = points[0];
    const last = points[points.length - 1];
    if (points.length === 1) {
      return [{ lat: first.latitude, lng: first.longitude, name: "Partenza", waypointType: "start" }];
    }
    return [
      { lat: first.latitude, lng: first.longitude, name: "Partenza", waypointType: "start" },
      { lat: last.latitude, lng: last.longitude, name: "Arrivo", waypointType: "end" },
    ];
  }, [points]);

  const trackPoints = useMemo(
    () => points.map((p) => ({ lat: p.latitude, lng: p.longitude, speedKmh: p.speedKmh ?? null })),
    [points]
  );

  return (
    <LeafletRouteMap
      waypoints={markerWaypoints}
      trackPoints={trackPoints}
      height={height}
      showMarkers={showMarkers}
    />
  );
}
