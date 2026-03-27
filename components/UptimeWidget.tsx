import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface UptimeData {
  backendStartedAt: number;
  metroStartedAt: number;
  metroOnline: boolean;
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
  const [minimized, setMinimized] = useState(false);
  const [visible, setVisible] = useState(true);
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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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

  if (!visible) return null;

  const now = Date.now();
  const fetchAge = now - fetchTimeRef.current;

  const backendElapsed = data
    ? (data.serverNow - data.backendStartedAt) + fetchAge
    : 0;

  const metroElapsed = data && data.metroOnline && data.metroStartedAt > 0
    ? (data.serverNow - data.metroStartedAt) + fetchAge
    : -1;

  const bottomBase = Platform.OS === "web"
    ? 34 + 84
    : 84 + insets.bottom;

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
      <TouchableOpacity
        style={styles.header}
        onPress={() => setMinimized((m) => !m)}
        activeOpacity={0.8}
      >
        <Text style={styles.headerText}>⏱ Uptime</Text>
        <TouchableOpacity
          onPress={() => setVisible(false)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {!minimized && (
        <View style={styles.body}>
          <Row label="Backend" value={formatUptime(backendElapsed)} />
          <Row
            label="Metro"
            value={metroElapsed >= 0 ? formatUptime(metroElapsed) : "OFFLINE"}
            offline={metroElapsed < 0}
          />
          <Row
            label="Frontend"
            value={metroElapsed >= 0 ? formatUptime(metroElapsed) : "OFFLINE"}
            offline={metroElapsed < 0}
          />
        </View>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  offline,
}: {
  label: string;
  value: string;
  offline?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, offline && styles.offline]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 9999,
    backgroundColor: "rgba(10, 10, 10, 0.88)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#00ff8833",
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#00ff8822",
  },
  headerText: {
    color: "#00ff88",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  closeBtn: {
    color: "#666",
    fontSize: 11,
    paddingLeft: 8,
  },
  body: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  label: {
    color: "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    width: 58,
  },
  value: {
    color: "#00ff88",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  offline: {
    color: "#ff4444",
  },
});
