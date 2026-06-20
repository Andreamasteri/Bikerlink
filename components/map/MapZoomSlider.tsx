import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder } from "react-native";
import Colors from "@/constants/colors";

interface Props {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  latitude: number;
  topOffset?: number;
  bottomOffset?: number;
  leftOffset?: number;
  onZoomChange: (zoom: number) => void;
}

const HIT_WIDTH = 44;
const HIT_HEIGHT = 28;
const HANDLE_WIDTH = 22;
const HANDLE_THICKNESS = 3;
const TRACK_WIDTH = 1.5;
const DEFAULT_TRACK_HEIGHT = 200;

function formatScale(zoom: number, lat: number): string {
  const mPerPx =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const meters = mPerPx * 80;
  const candidates = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
    10000, 20000, 50000, 100000, 200000, 500000, 1000000,
  ];
  let chosen = candidates[0];
  for (const c of candidates) {
    if (c <= meters) chosen = c;
  }
  if (chosen >= 1000) return `${chosen / 1000} km`;
  return `${chosen} m`;
}

export function MapZoomSlider({
  zoom,
  minZoom,
  maxZoom,
  latitude,
  topOffset,
  bottomOffset,
  leftOffset,
  onZoomChange,
}: Props) {
  const [trackHeight, setTrackHeight] = useState(DEFAULT_TRACK_HEIGHT);
  const trackHeightRef = useRef(DEFAULT_TRACK_HEIGHT);
  trackHeightRef.current = trackHeight;

  const latestZoomRef = useRef(zoom);
  const minZoomRef = useRef(minZoom);
  const maxZoomRef = useRef(maxZoom);
  const onZoomChangeRef = useRef(onZoomChange);
  const zoomAtGrantRef = useRef(zoom);

  useEffect(() => {
    latestZoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    minZoomRef.current = minZoom;
  }, [minZoom]);
  useEffect(() => {
    maxZoomRef.current = maxZoom;
  }, [maxZoom]);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        zoomAtGrantRef.current = latestZoomRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const range = maxZoomRef.current - minZoomRef.current;
        const h = trackHeightRef.current;
        if (range <= 0 || h <= 0) return;
        const startY =
          ((maxZoomRef.current - zoomAtGrantRef.current) / range) * h;
        const newY = Math.max(0, Math.min(h, startY + gesture.dy));
        const newZoom = maxZoomRef.current - (newY / h) * range;
        onZoomChangeRef.current(newZoom);
      },
    }),
  ).current;

  const range = maxZoom - minZoom;
  const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));
  const handleY =
    range > 0 ? ((maxZoom - clampedZoom) / range) * trackHeight : 0;
  const scaleLabel = formatScale(clampedZoom, latitude);

  return (
    <View
      style={[
        styles.container,
        topOffset != null && { top: topOffset },
        bottomOffset != null && { bottom: bottomOffset },
        leftOffset != null && { left: leftOffset },
      ]}
      pointerEvents="box-none"
      onLayout={(e) => setTrackHeight(e.nativeEvent.layout.height)}
    >
      <View style={styles.trackLine} pointerEvents="none" />
      <View
        style={[styles.hitArea, { top: handleY - HIT_HEIGHT / 2 }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handle} />
      </View>
      <Text
        style={[styles.label, { top: handleY - 7 }]}
        numberOfLines={1}
        pointerEvents="none"
      >
        {scaleLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    width: HIT_WIDTH,
    zIndex: 10,
  },
  trackLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: HIT_WIDTH / 2 - TRACK_WIDTH / 2,
    width: TRACK_WIDTH,
    backgroundColor: "#000",
  },
  hitArea: {
    position: "absolute",
    left: 0,
    width: HIT_WIDTH,
    height: HIT_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: HANDLE_WIDTH,
    height: HANDLE_THICKNESS,
    backgroundColor: Colors.accent,
    borderRadius: HANDLE_THICKNESS / 2,
  },
  label: {
    position: "absolute",
    left: HIT_WIDTH + 2,
    color: Colors.text,
    fontSize: 10,
    fontWeight: "600" as const,
    textShadowColor: "rgba(255,255,255,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
});
