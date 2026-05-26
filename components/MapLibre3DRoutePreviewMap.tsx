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

interface LatLng { lat: number; lng: number }

interface Props {
  waypoints?: LatLng[];
  trackPoints?: LatLng[];
  height?: number;
  accentColor?: string;
  onFatalError?: () => void;
}

function buildPreviewHtml(styleExpr: string, demUrl: string, waypoints: LatLng[], trackPoints: LatLng[], accentColor: string): string {
  const webGlScript = get3DWebGLCheckInlineScript();
  const bodyScript = `
    ${get3DInitScript(demUrl)}
    ${get3DBuildingsScript()}
    ${get3DBridgeHandlersScript()}
    var waypoints = ${JSON.stringify(waypoints)};
    var trackPoints = ${JSON.stringify(trackPoints)};
    var color = ${JSON.stringify(accentColor)};
    if (trackPoints.length > 1) {
      map.addSource("route", { type: "geojson", data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: trackPoints.map(function(p) { return [p.lng, p.lat]; }) }
      }});
      map.addLayer({ id: "route-line", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": color, "line-width": 4, "line-opacity": 0.9 }
      });
    }
    waypoints.forEach(function(wp, i) {
      var el = document.createElement("div");
      var isEnd = i === waypoints.length - 1;
      el.style.cssText = "width:14px;height:14px;border-radius:7px;background:" +
        (i === 0 ? "#4CAF50" : isEnd ? "#F44336" : color) + ";border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.5);";
      new maplibregl.Marker({ element: el }).setLngLat([wp.lng, wp.lat]).addTo(map);
    });
    if (waypoints.length > 0) { map.easeTo({ center: [waypoints[0].lng, waypoints[0].lat], zoom: 11 }); }
    ${ZOOM_BEARING_BRIDGE_HANDLERS_SCRIPT}
    ${VIEW_STATE_BRIDGE_SCRIPT}
  `;
  return `${htmlHead()}<body><script>${webGlScript}</script><div id="map"></div>${mapScriptWrap(
    styleExpr, '{ pitch: 45, zoom: 10 }', bodyScript
  )}`;
}

export default function MapLibre3DRoutePreviewMap({ waypoints = [], trackPoints = [], height, accentColor = "#FF6600", onFatalError }: Props) {
  const webViewRef = useRef<WebView>(null);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const [viewState, setViewState] = useState({
    zoom: 10, minZoom: 0, maxZoom: 22, bearing: 0, lat: 45.5, lng: 10.5,
  });

  const styleExpr = getMapLibreStyleExpr();
  const demUrl = getDem3dTileUrl();
  const mapHtml = useMemo(
    () => buildPreviewHtml(styleExpr, demUrl, waypoints, trackPoints, accentColor),
    [styleExpr, demUrl, waypoints, trackPoints, accentColor]
  );

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "viewState" && msg.zoom != null) {
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
  }, []);

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
