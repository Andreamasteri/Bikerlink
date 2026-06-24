import { useMemo } from "react";
import { getApiUrl } from "@/lib/query-client";

export function useNavMapUri(polylinePoints: any[], activeStepsRef: any, route: any, activeTileUrl: string, activeTileMaxZoom: number, offline: any) {
  const mapUri = useMemo(() => {
    if (polylinePoints.length < 2) return null;
    const stepsForMap = activeStepsRef.current ?? route?.navigationSteps ?? [];
    const stepPoints = stepsForMap.map((step: any) => {
      const idx = step.interval[0];
      return idx < polylinePoints.length ? polylinePoints[idx] : polylinePoints[0];
    });
    const base = getApiUrl() + "/leaflet-navigation-map.html";
    let uri =
      base +
      "?tileUrl=" + encodeURIComponent(activeTileUrl) +
      "&maxZoom=" + activeTileMaxZoom +
      "&routeCoords=" + encodeURIComponent(JSON.stringify(polylinePoints)) +
      "&stepCoords=" + encodeURIComponent(JSON.stringify(stepPoints));
    if (offline.status === "available" && offline.offlineTileBasePath) {
      uri += "&offlinePath=" + encodeURIComponent(offline.offlineTileBasePath);
    }
    return uri;
  }, [polylinePoints, route?.navigationSteps, offline.status, offline.offlineTileBasePath, activeTileUrl, activeTileMaxZoom]);

  return mapUri;
}
