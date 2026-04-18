import React from "react";
import LeafletRouteMap from "@/components/LeafletRouteMap";
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
  const routeWaypoints: RouteWaypoint[] = waypoints.map((w) => ({
    lat: w.latitude,
    lng: w.longitude,
    name: w.name,
    waypointType: w.waypointType,
  }));

  return <LeafletRouteMap waypoints={routeWaypoints} typeColors={waypointTypeColors} />;
}
