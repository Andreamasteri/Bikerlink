import React, { forwardRef, lazy, Suspense, useState, useCallback } from "react";
import { useRendererSelector } from "@/lib/maps/renderer-selector";
import InteractiveMap from "@/components/InteractiveMap";
import type { InteractiveMapProps, InteractiveMapHandle } from "@/components/map/map-types";

/**
 * Lazy-load MapLibreInteractiveMap only when the renderer selector
 * confirms the user is eligible (isMapLibreMinimal === true).
 * Non-eligible users never trigger this import; the Leaflet module remains
 * the only map code executed for them.
 */
const LazyMapLibreInteractiveMap = lazy(
  () => import("@/components/MapLibreInteractiveMap")
);

/**
 * Sistema Mappe renderer selector wrapper (Task #2312).
 *
 * Reads the effective renderer via useMapsRollout() and delegates to the
 * correct WebView-based implementation:
 *   - "leaflet"           → InteractiveMap   (Leaflet.js, stable default)
 *   - "maplibre_minimal"  → MapLibreInteractiveMap (MapLibre GL via CDN, WebGL vector tiles)
 *
 * Fallback: if MapLibre fails to initialise at runtime (tile provider
 * unreachable, WebGL unavailable, etc.) the component signals via
 * onFallbackNeeded and the selector transparently falls back to Leaflet.
 *
 * Lazy import: the MapLibre module is loaded via dynamic import() and is
 * therefore never included in the JS execution path for Leaflet users.
 */
const RendererInteractiveMap = forwardRef<InteractiveMapHandle, InteractiveMapProps>(
  function RendererInteractiveMap(props, ref) {
    const { isMapLibreMinimal } = useRendererSelector();
    const [maplibreFailed, setMaplibreFailed] = useState(false);

    const handleFallbackNeeded = useCallback(() => {
      setMaplibreFailed(true);
    }, []);

    if (isMapLibreMinimal && !maplibreFailed) {
      return (
        <Suspense fallback={<InteractiveMap {...props} ref={ref} />}>
          <LazyMapLibreInteractiveMap
            {...props}
            ref={ref}
            onFallbackNeeded={handleFallbackNeeded}
          />
        </Suspense>
      );
    }

    return <InteractiveMap {...props} ref={ref} />;
  }
);

export default RendererInteractiveMap;
export type { InteractiveMapHandle };
