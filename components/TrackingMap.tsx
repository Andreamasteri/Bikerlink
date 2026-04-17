import React from "react";
import { useMapConfig } from "@/lib/map-context";
import LeafletTrackingMap from "@/components/LeafletTrackingMap";
import NativeTrackingMap from "@/components/NativeTrackingMap";

interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function TrackingMap(props: TrackingMapProps) {
  const { useGoogleMaps } = useMapConfig();
  if (useGoogleMaps) return <NativeTrackingMap {...props} />;
  return <LeafletTrackingMap {...props} />;
}
