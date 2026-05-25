import React, { Suspense } from "react";
import { ActivityIndicator } from "react-native";
import { useMapsRollout } from "@/lib/maps/useMapsRollout";
import { LazyLeafletTrackingMap, LazyMapLibreTrackingMap, useSilentFallback } from "@/lib/maps/renderer-selector";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type TrackingMapProps = React.ComponentProps<typeof LazyLeafletTrackingMap>;

export default function TrackingMap(props: TrackingMapProps) {
  const { renderer } = useMapsRollout();
  const [failed, triggerFallback, SilentFallback] = useSilentFallback();

  if (renderer !== "maplibre" || failed) {
    return (
      <Suspense fallback={<ActivityIndicator />}>
        <LazyLeafletTrackingMap {...props} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<ActivityIndicator />}>
      <ErrorBoundary FallbackComponent={SilentFallback}>
        <LazyMapLibreTrackingMap {...props} onFatalError={triggerFallback} />
      </ErrorBoundary>
    </Suspense>
  );
}
