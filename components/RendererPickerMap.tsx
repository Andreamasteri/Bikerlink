import React, { lazy, Suspense } from "react";
import LeafletPickerMap from "@/components/LeafletPickerMap";
import { useRendererSelector } from "@/lib/maps/renderer-selector";
import type { PickerWaypoint } from "@/lib/leaflet-picker-map-html";

const LazyMapLibrePickerMap = lazy(
  () => import("@/components/MapLibrePickerMap")
);

interface RendererPickerMapProps {
  initialLat: number;
  initialLng: number;
  initialZoom: number;
  selectedCoord: { lat: number; lng: number } | null;
  existingWaypoints: PickerWaypoint[];
  onCoordPicked: (coord: { latitude: number; longitude: number }) => void;
}

export default function RendererPickerMap(props: RendererPickerMapProps) {
  const { isMapLibreMinimal } = useRendererSelector();
  const [fallbackActive, setFallbackActive] = React.useState(false);

  if (isMapLibreMinimal && !fallbackActive) {
    return (
      <Suspense fallback={<LeafletPickerMap {...props} />}>
        <LazyMapLibrePickerMap
          {...props}
          onFallbackNeeded={() => setFallbackActive(true)}
        />
      </Suspense>
    );
  }

  return <LeafletPickerMap {...props} />;
}
