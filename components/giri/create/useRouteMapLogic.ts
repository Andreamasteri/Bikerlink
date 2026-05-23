import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import WebView from "react-native-webview";
import { decodePolyline } from "@/lib/polyline";

interface RouteMapLogicProps {
  routeResult: any;
  webviewRef: React.RefObject<WebView>;
  waypoints: any[];
  lastFittedWaypointSig: React.MutableRefObject<string>;
  bikerScoreAnim: Animated.Value;
}

export const useRouteMapLogic = ({
  routeResult,
  webviewRef,
  waypoints,
  lastFittedWaypointSig,
  bikerScoreAnim,
}: RouteMapLogicProps) => {
  // ── Animate BikerScore bar when value changes ─────────────────────────────
  useEffect(() => {
    const score = routeResult ? Math.round(routeResult.bikerScore * 100) : 0;
    Animated.spring(bikerScoreAnim, {
      toValue: score,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeResult?.bikerScore]);

  // ── Inject curvature gradient into WebView whenever routeResult updates ───
  useEffect(() => {
    if (!routeResult || !webviewRef.current) return;
    let pts: Array<{ lat: number; lng: number }> = [];
    if (routeResult.encoded) {
      pts = decodePolyline(routeResult.encoded);
    } else if (routeResult.rawPoints) {
      pts = routeResult.rawPoints.map(({ lat, lng }: { lat: number; lng: number }) => ({ lat, lng }));
    }
    if (pts.length < 2) return;

    const resolvedWps = waypoints.filter((w) => w.lat !== 0 || w.lng !== 0);
    const wpSig = resolvedWps.map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`).join("|");
    const shouldFit = wpSig !== lastFittedWaypointSig.current;
    if (shouldFit) {
      lastFittedWaypointSig.current = wpSig;
    }

    const ptsJson = JSON.stringify(pts);
    const js = `(function(){ if(typeof window.updateRouteWithCurvature==='function'){ window.updateRouteWithCurvature(${ptsJson}, ${shouldFit}); } })(); true;`;
    webviewRef.current.injectJavaScript(js);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeResult?.encoded, routeResult?.rawPoints, waypoints]);
};
