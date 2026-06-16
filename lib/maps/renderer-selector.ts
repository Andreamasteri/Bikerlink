import React from "react";
import { useMapsRollout } from "./useMapsRollout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { ErrorFallbackProps } from "@/components/ErrorFallback";
import type { InteractiveMapProps, InteractiveMapHandle } from "@/components/map/map-types";

export const LazyLeafletInteractiveMap = React.lazy(() => import("@/components/InteractiveMap"));
export const LazyMapLibreInteractiveMap = React.lazy(() => import("@/components/MapLibreInteractiveMap"));

export const LazyLeafletRouteMap = React.lazy(() => import("@/components/LeafletRouteMap"));
export const LazyMapLibreRouteMap = React.lazy(() => import("@/components/MapLibreRouteMap"));

export const LazyLeafletMiniMap = React.lazy(() => import("@/components/LeafletMiniMap"));
export const LazyMapLibreMiniMap = React.lazy(() => import("@/components/MapLibreMiniMap"));

export const LazyLeafletPickerMap = React.lazy(() => import("@/components/LeafletPickerMap"));
export const LazyMapLibrePickerMap = React.lazy(() => import("@/components/MapLibrePickerMap"));

export const LazyLeafletTrackingMap = React.lazy(() => import("@/components/LeafletTrackingMap"));
export const LazyMapLibreTrackingMap = React.lazy(() => import("@/components/MapLibreTrackingMap"));

export function useRendererSelector() {
  return {
    shouldUseFull3d: (_context: "planner" | "preview") => false,
  };
}

export function useMapRenderer() {
  const { renderer } = useMapsRollout();
  const isMapLibre = renderer === "maplibre";
  const useMapLibreBase = isMapLibre;

  return {
    isMapLibre,
    InteractiveMapComponent: useMapLibreBase
      ? LazyMapLibreInteractiveMap
      : LazyLeafletInteractiveMap,
    RouteMapComponent: useMapLibreBase
      ? LazyMapLibreRouteMap
      : LazyLeafletRouteMap,
    MiniMapComponent: useMapLibreBase
      ? LazyMapLibreMiniMap
      : LazyLeafletMiniMap,
    PickerMapComponent: useMapLibreBase ? LazyMapLibrePickerMap : LazyLeafletPickerMap,
    TrackingMapComponent: useMapLibreBase ? LazyMapLibreTrackingMap : LazyLeafletTrackingMap,
  };
}

export function useSilentFallback(): [boolean, () => void, React.ComponentType<ErrorFallbackProps>] {
  const [failed, setFailed] = React.useState(false);
  const setterRef = React.useRef(setFailed);
  setterRef.current = setFailed;

  const triggerRef = React.useRef(() => { setterRef.current(true); });

  const fallbackRef = React.useRef<React.ComponentType<ErrorFallbackProps> | undefined>(undefined);
  if (!fallbackRef.current) {
    function SilentFallback() {
      React.useEffect(() => { setterRef.current(true); }, []);
      return null;
    }
    fallbackRef.current = SilentFallback as React.ComponentType<ErrorFallbackProps>;
  }
  return [failed, triggerRef.current, fallbackRef.current];
}

type ForwardRefInteractiveMap = React.ForwardRefExoticComponent<
  InteractiveMapProps & React.RefAttributes<InteractiveMapHandle>
>;

export function withLeafletFallback(
  MapLibreComponent: ForwardRefInteractiveMap,
  LeafletFallback: ForwardRefInteractiveMap
): ForwardRefInteractiveMap {
  const WithFallback = React.forwardRef<InteractiveMapHandle, InteractiveMapProps>(
    (props, ref) => {
      const [useFallback, triggerFallback, SilentFallback] = useSilentFallback();

      if (useFallback) {
        return React.createElement(LeafletFallback, { ...props, ref } as InteractiveMapProps & { ref: typeof ref });
      }

      return React.createElement(
        ErrorBoundary,
        { FallbackComponent: SilentFallback },
        React.createElement(MapLibreComponent, {
          ...props,
          ref,
          onFatalError: triggerFallback,
        } as InteractiveMapProps & { ref: typeof ref })
      );
    }
  );
  WithFallback.displayName = "WithLeafletFallback";
  return WithFallback;
}
