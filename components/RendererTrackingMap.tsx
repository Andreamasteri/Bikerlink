import React, { lazy, Suspense } from "react";
import LeafletTrackingMap from "@/components/LeafletTrackingMap";
import { useRendererSelector } from "@/lib/maps/renderer-selector";

const LazyMapLibreTrackingMap = lazy(
  () => import("@/components/MapLibreTrackingMap")
);

interface RendererTrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function RendererTrackingMap({ points, currentLocation }: RendererTrackingMapProps) {
  const { isMapLibreMinimal } = useRendererSelector();
  const [fallbackActive, setFallbackActive] = React.useState(false);

  if (isMapLibreMinimal && !fallbackActive) {
    return (
      <Suspense fallback={<LeafletTrackingMap points={points} currentLocation={currentLocation} />}>
        <LazyMapLibreTrackingMap
          points={points}
          currentLocation={currentLocation}
          onFallbackNeeded={() => setFallbackActive(true)}
        />
      </Suspense>
    );
  }

  return <LeafletTrackingMap points={points} currentLocation={currentLocation} />;
}
