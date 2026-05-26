import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, PanResponder, Animated } from "react-native";
import Colors from "@/constants/colors";

interface Props {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  latitude: number;
  topOffset?: number;
  onZoomChange: (zoom: number) => void;
}

const TRACK_HEIGHT = 180;
const HANDLE_SIZE = 28;
const HIT_SIZE = 44;

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
  onZoomChange,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        zoomAtGrantRef.current = latestZoomRef.current;
        Animated.spring(scaleAnim, {
          toValue: 1.35,
          useNativeDriver: true,
          friction: 5,
        }).start();
      },
      onPanResponderMove: (_, gesture) => {
        const range = maxZoomRef.current - minZoomRef.current;
        if (range <= 0) return;
        const startY =
          ((maxZoomRef.current - zoomAtGrantRef.current) / range) * TRACK_HEIGHT;
        const newY = Math.max(0, Math.min(TRACK_HEIGHT, startY + gesture.dy));
        const newZoom = maxZoomRef.current - (newY / TRACK_HEIGHT) * range;
        onZoomChangeRef.current(newZoom);
      },
      onPanResponderRelease: () => {
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 5,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 5,
        }).start();
      },
    }),
  ).current;

  const range = maxZoom - minZoom;
  const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));
  const handleY =
    range > 0 ? ((maxZoom - clampedZoom) / range) * TRACK_HEIGHT : 0;
  const scaleLabel = formatScale(clampedZoom, latitude);

  return (
    <View
      style={[styles.container, topOffset != null && { top: topOffset }]}
      pointerEvents="box-none"
    >
      <View style={styles.trackWrap}>
        <View style={styles.trackLine} />
        <Animated.View
          style={[
            styles.hitArea,
            {
              top: handleY - HIT_SIZE / 2,
              transform: [{ scale: scaleAnim }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />
        </Animated.View>
      </View>
      <View style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={1}>
          {scaleLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    top: 80,
    alignItems: "center",
    zIndex: 10,
  },
  trackWrap: {
    width: HIT_SIZE,
    height: TRACK_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: HIT_SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 6,
  },
  trackLine: {
    position: "absolute",
    top: 8,
    bottom: 8,
    width: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  hitArea: {
    position: "absolute",
    width: HIT_SIZE,
    height: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  labelWrap: {
    marginTop: 6,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: HIT_SIZE,
    alignItems: "center",
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "700" as const,
  },
});
