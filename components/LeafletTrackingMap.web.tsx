import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildLeafletTrackingMapHtml } from "@/lib/leaflet-tracking-map-html";
import Colors from "@/constants/colors";

interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function LeafletTrackingMap({ points, currentLocation }: TrackingMapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const pendingRef = useRef<{ points: typeof points; currentLocation: typeof currentLocation } | null>(null);
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const html = useMemo(
    () => buildLeafletTrackingMapHtml(tileConfig.urlTemplate, tileConfig.maximumZ, Colors.accent),
    [tileConfig.urlTemplate, tileConfig.maximumZ]
  );

  const pushUpdate = useCallback(
    (pts: typeof points, loc: typeof currentLocation) => {
      if (pts.length === 0 && !loc) return;
      const data: { points: Array<{ lat: number; lng: number }>; current?: { lat: number; lng: number } } = {
        points: pts.map((p) => ({ lat: p.latitude, lng: p.longitude })),
      };
      if (loc) {
        data.current = { lat: loc.latitude, lng: loc.longitude };
      }
      const jsonStr = JSON.stringify(data);
      // targetOrigin "*" è necessario per iframe srcDoc (origin opaco non indirizzabile).
      // Controlli compensativi: event.source verificato nel listener, sandbox="allow-scripts"
      // (no same-origin, no network), payload non-sensibile (dati tracciamento rotta).
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: "updateLocation", json: jsonStr }),
        "*"
      );
    },
    []
  );

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.source !== iframeRef.current?.contentWindow) return;
    try {
      const msg = JSON.parse(event.data) as { type: string };
      if (msg.type === "trackingReady") {
        setFrameReady(true);
        if (pendingRef.current) {
          pushUpdate(pendingRef.current.points, pendingRef.current.currentLocation);
          pendingRef.current = null;
        }
      }
    } catch {}
  }, [pushUpdate]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (!frameReady) {
      pendingRef.current = { points, currentLocation };
      return;
    }
    pushUpdate(points, currentLocation);
  }, [frameReady, points, currentLocation, pushUpdate]);

  return (
    <View style={styles.wrapper}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ width: "100%", height: "100%", border: "none" }}
        sandbox="allow-scripts"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
});
