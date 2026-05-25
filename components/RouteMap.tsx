import React, { Suspense } from "react";
import { ActivityIndicator } from "react-native";
import { useMapsRollout } from "@/lib/maps/useMapsRollout";
import {
  LazyLeafletRouteMap,
  LazyMapLibreRouteMap,
  LazyMapLibre3DRoutePreviewMap,
  useSilentFallback,
} from "@/lib/maps/renderer-selector";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type RouteMapProps = React.ComponentProps<typeof LazyLeafletRouteMap>;

export default function RouteMap(props: RouteMapProps) {
  const { renderer } = useMapsRollout();
  const [failed, triggerFallback, SilentFallback] = useSilentFallback();

  if (renderer === "maplibre-full-3d" && !failed) {
    return (
      <Suspense fallback={<ActivityIndicator />}>
        <ErrorBoundary FallbackComponent={SilentFallback}>
          <LazyMapLibre3DRoutePreviewMap
            waypoints={props.waypoints}
            trackPoints={props.trackPoints}
            height={props.height}
            onFatalError={triggerFallback}
          />
        </ErrorBoundary>
      </Suspense>
    );
  }

  if (renderer === "maplibre" && !failed) {
    return (
      <Suspense fallback={<ActivityIndicator />}>
        <ErrorBoundary FallbackComponent={SilentFallback}>
          <LazyMapLibreRouteMap {...props} onFatalError={triggerFallback} />
        </ErrorBoundary>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<ActivityIndicator />}>
      <LazyLeafletRouteMap {...props} />
    </Suspense>
  );
}
