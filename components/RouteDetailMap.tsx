import React from "react";
import { useMapConfig } from "@/lib/map-context";
import LeafletRouteMap from "@/components/LeafletRouteMap";
import NativeRouteMap from "@/components/NativeRouteMap";
import type { RouteWaypoint } from "@/lib/leaflet-route-map-html";

interface WaypointData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  waypointType: string;
}

interface RouteDetailMapProps {
  waypoints: WaypointData[];
  waypointTypeLabels?: Record<string, string>;
  waypointTypeColors: Record<string, string>;
}

export default function RouteDetailMap({ waypoints, waypointTypeColors }: RouteDetailMapProps) {
  const { useGoogleMaps } = useMapConfig();

  const routeWaypoints: RouteWaypoint[] = waypoints.map((w) => ({
    lat: w.latitude,
    lng: w.longitude,
    name: w.name,
    waypointType: w.waypointType,
  }));

  if (useGoogleMaps) {
    return <NativeRouteMap waypoints={routeWaypoints} typeColors={waypointTypeColors} />;
  }
  return <LeafletRouteMap waypoints={routeWaypoints} typeColors={waypointTypeColors} />;
}
