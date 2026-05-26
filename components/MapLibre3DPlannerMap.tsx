import React, { useMemo, useRef, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { htmlHead, mapScriptWrap } from "@/lib/maplibre/map-builder";
import { getMapLibreStyleExpr } from "@/lib/maplibre/tile-config";
import {
  getDem3dTileUrl, get3DInitScript,
  get3DBuildingsScript, get3DWebGLCheckInlineScript,
} from "@/lib/maplibre/style-3d";
import { get3DBridgeHandlersScript } from "@/lib/maplibre/layer-controls";
import { parseMessage } from "@/lib/maplibre/bridge-events";
import {
  VIEW_STATE_BRIDGE_SCRIPT,
  ZOOM_BEARING_BRIDGE_HANDLERS_SCRIPT,
} from "@/lib/maplibre/secondary-builders";
import { MapZoomSlider } from "@/components/map/MapZoomSlider";
import { MapNorthCompass } from "@/components/map/MapNorthCompass";
import MapLibre3DLayerControls from "./MapLibre3DLayerControls";

interface Props {
  height?: number;
  waypoints?: Array<{ lat: number; lng: number }>;
  trackPoints?: Array<{ lat: number; lng: number }>;
  onWaypointAdd?: (lat: number, lng: number) => void;
  onFatalError?: () => void;
}

function buildPlannerHtml(
  styleExpr: string,
  demUrl: string,
  waypoints: Array<{ lat: number; lng: number }>,
  trackPoints: Array<{ lat: number; lng: number }>
): string {
  const webGlScript = get3DWebGLCheckInlineScript();
  const bodyScript = `
    ${get3DInitScript(demUrl)}
    ${get3DBuildingsScript()}
    ${get3DBridgeHandlersScript()}
    var waypoints = ${JSON.stringify(waypoints)};
    var trackPoints = ${JSON.stringify(trackPoints)};
    var waypointMarkers = [];
    function renderWaypoints() {
      waypointMarkers.forEach(function(m) { m.remove(); });
      waypointMarkers = [];
      waypoints.forEach(function(wp) {
        var el = document.createElement("div");
        el.style.cssText = "width:14px;height:14px;border-radius:7px;background:#FF6600;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.5);";
        waypointMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([wp.lng, wp.lat]).addTo(map));
      });
    }
    function renderTrack() {
      if (map.getLayer("plan-route")) map.removeLayer("plan-route");
      if (map.getSource("plan-route")) map.removeSource("plan-route");
      if (trackPoints.length < 2) return;
      map.addSource("plan-route", { type: "geojson", data: {
        type: "Feature", geometry: { type: "LineString",
          coordinates: trackPoints.map(function(p) { return [p.lng, p.lat]; }) }
      }});
      map.addLayer({ id: "plan-route", type: "line", source: "plan-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FF6600", "line-width": 4, "line-opacity": 0.9 }
      });
    }
    map.on("load", function() { renderWaypoints(); renderTrack(); });
    map.on("click", function(e) { postMsg({ type: "tap", lat: e.lngLat.lat, lng: e.lngLat.lng }); });
    window.mlBridge.updateWaypoints = function(payload) {
      var data = typeof payload === "string" ? JSON.parse(payload) : payload;
      waypoints = Array.isArray(data) ? data : [];
      renderWaypoints();
    };
    window.mlBridge.updateTrackPoints = function(payload) {
      var data = typeof payload === "string" ? JSON.parse(payload) : payload;
      trackPoints = Array.isArray(data) ? data : [];
      renderTrack();
    };
    ${ZOOM_BEARING_BRIDGE_HANDLERS_SCRIPT}
    ${VIEW_STATE_BRIDGE_SCRIPT}
  `;
  return `${htmlHead()}<body><script>${webGlScript}</script><div id="map"></div>${mapScriptWrap(
    styleExpr, '{ pitch: 45, zoom: 10 }', bodyScript
  )}`;
}

export default function MapLibre3DPlannerMap({ height, waypoints = [], trackPoints = [], onWaypointAdd, onFatalError }: Props) {
  const webViewRef = useRef<WebView>(null);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const [viewState, setViewState] = useState({
    zoom: 10, minZoom: 0, maxZoom: 22, bearing: 0, lat: 45.5, lng: 10.5,
  });

  const styleExpr = getMapLibreStyleExpr();
  const demUrl = getDem3dTileUrl();
  const mapHtml = useMemo(() => buildPlannerHtml(styleExpr, demUrl, waypoints, trackPoints), [styleExpr, demUrl, waypoints, trackPoints]);

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "tap" && msg.lat != null && msg.lng != null) {
      onWaypointAdd?.(msg.lat, msg.lng);
    } else if (msg.type === "viewState" && msg.zoom != null) {
      setViewState({
        zoom: msg.zoom,
        minZoom: msg.minZoom ?? 0,
        maxZoom: msg.maxZoom ?? 22,
        bearing: msg.bearing ?? 0,
        lat: msg.lat ?? 0,
        lng: msg.lng ?? 0,
      });
    } else if (msg.type === "error") {
      onFatalErrorRef.current?.();
    }
  }, [onWaypointAdd]);

  const handleCommand = useCallback((cmd: string) => {
    webViewRef.current?.injectJavaScript(
      `(function(){try{var m=JSON.parse(${JSON.stringify(cmd)});if(window.mlBridge&&m.cmd&&typeof window.mlBridge[m.cmd]==="function")window.mlBridge[m.cmd](m.payload);}catch(e){}})();true;`
    );
  }, []);

  const handleZoomChange = useCallback((z: number) => {
    setViewState((prev) => ({ ...prev, zoom: z }));
    const payload = JSON.stringify({ zoom: z });
    inject(`window.mlBridge && window.mlBridge.setZoom && window.mlBridge.setZoom(${payload})`);
  }, [inject]);

  const handleResetBearing = useCallback(() => {
    setViewState((prev) => ({ ...prev, bearing: 0 }));
    inject(`window.mlBridge && window.mlBridge.resetBearing && window.mlBridge.resetBearing()`);
  }, [inject]);

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;
  return (
    <View style={containerStyle}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml, baseUrl: getApiUrl() }}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["https://*", "http://*", "about:*"]}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
        onError={() => onFatalErrorRef.current?.()}
      />
      <MapLibre3DLayerControls onCommand={handleCommand} />
      <MapZoomSlider
        zoom={viewState.zoom}
        minZoom={viewState.minZoom}
        maxZoom={viewState.maxZoom}
        latitude={viewState.lat}
        topOffset={12}
        onZoomChange={handleZoomChange}
      />
      <MapNorthCompass
        bearing={viewState.bearing}
        onResetBearing={handleResetBearing}
        topOffset={130}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden" },
  fill: { flex: 1 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
