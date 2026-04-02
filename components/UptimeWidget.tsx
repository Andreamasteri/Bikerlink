import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface UptimeData {
  frontendStartTime: number;
  serverNow: number;
}

function formatUptime(elapsedMs: number): string {
  if (elapsedMs < 0) return "00:00.0";
  const totalDs = Math.floor(elapsedMs / 100);
  const d = totalDs % 10;
  const totalSec = Math.floor(elapsedMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

export default function UptimeWidget() {
  const insets = useSafeAreaInsets();
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const [tick, setTick] = useState(0);
  const fetchTimeRef = useRef<number>(Date.now());

  const { data } = useQuery<UptimeData>({
    queryKey: ["/api/admin/uptime"],
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (data) fetchTimeRef.current = Date.now();
  }, [data]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        startPosRef.current = { ...posRef.current };
      },
      onPanResponderMove: (_, gs) => {
        const newPos = {
          x: startPosRef.current.x + gs.dx,
          y: startPosRef.current.y + gs.dy,
        };
        posRef.current = newPos;
        setPos(newPos);
      },
      onPanResponderRelease: (_, gs) => {
        const newPos = {
          x: startPosRef.current.x + gs.dx,
          y: startPosRef.current.y + gs.dy,
        };
        posRef.current = newPos;
        setPos(newPos);
      },
    })
  ).current;

  const now = Date.now();
  const fetchAge = now - fetchTimeRef.current;

  const frontendElapsed =
    data && data.frontendStartTime > 0
      ? data.serverNow - data.frontendStartTime + fetchAge
      : -1;

  const bottomBase =
    Platform.OS === "web" ? 34 + 84 : 84 + insets.bottom;

  return (
    <View
      style={[
        styles.container,
        {
          bottom: bottomBase - pos.y,
          right: 16 - pos.x,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Text style={styles.label}>
        {"⏱ "}
        {frontendElapsed >= 0 ? formatUptime(frontendElapsed) : "00:00.0"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 9999,
    backgroundColor: "rgba(10, 10, 10, 0.88)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#00ff8833",
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 20,
  },
  label: {
    color: "#00ff88",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
});
