import React, { lazy, Suspense, useMemo } from "react";
import LeafletRouteMap from "@/components/LeafletRouteMap";
import { useRendererSelector } from "@/lib/maps/renderer-selector";
import type { RouteWaypoint } from "@/lib/leaflet-route-map-html";
import type { MapLibreRouteWaypoint } from "@/lib/maplibre/map-builder";

const LazyMapLibreRouteMap = lazy(
  () => import("@/components/MapLibreRouteMap")
);

interface RendererRouteMapProps {
  points: Array<{ latitude: number; longitude: number; speedKmh?: number | null }>;
  height?: number;
  showMarkers?: boolean;
}

export default function RendererRouteMap({ points, height = 260, showMarkers = true }: RendererRouteMapProps) {
  const { isMapLibreMinimal } = useRendererSelector();
  const [fallbackActive, setFallbackActive] = React.useState(false);

  const leafletWaypoints: RouteWaypoint[] = useMemo(() => {
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

  const mapLibreWaypoints: MapLibreRouteWaypoint[] = useMemo(() => {
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

  if (isMapLibreMinimal && !fallbackActive) {
    return (
      <Suspense
        fallback={
          <LeafletRouteMap
            waypoints={leafletWaypoints}
            trackPoints={trackPoints}
            height={height}
            showMarkers={showMarkers}
          />
        }
      >
        <LazyMapLibreRouteMap
          waypoints={mapLibreWaypoints}
          trackPoints={trackPoints}
          height={height}
          showMarkers={showMarkers}
          onFallbackNeeded={() => setFallbackActive(true)}
        />
      </Suspense>
    );
  }

  return (
    <LeafletRouteMap
      waypoints={leafletWaypoints}
      trackPoints={trackPoints}
      height={height}
      showMarkers={showMarkers}
    />
  );
}
