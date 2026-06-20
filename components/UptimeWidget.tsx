import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useState } from "react";
// Riusa la logica di discriminazione tap/drag del pallino flottante: stessa
// soglia, stesso comportamento, zero duplicazione (regression guard condiviso).
import { isDragGesture, TAP_THRESHOLD } from "@/components/FloatingWidget";

interface UptimeData {
  backendStartedAt: number;
  serverNow: number;
  crashCount24h: number;
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

const WIDGET_W = 110;
const WIDGET_H = 32;
const POS_KEY = "uptime_widget_position";

// Clamp dedicato al widget uptime: a differenza di clampPos di FloatingWidget
// (pallino quadrato WIDGET_SIZE), qui larghezza e altezza sono diverse, quindi
// servono limiti distinti per asse. È `"worklet"` così può girare sia sul thread
// JS (load/persist) sia nei callback gesto RNGH sul thread UI.
export function clampUptimePos(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  minY: number,
  maxYPad: number,
): { x: number; y: number } {
  "worklet";
  return {
    x: Math.max(0, Math.min(x, screenW - WIDGET_W)),
    y: Math.max(minY, Math.min(y, screenH - WIDGET_H - maxYPad)),
  };
}

export default function UptimeWidget() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const [, setTick] = useState(0);
  const fetchTimeRef = useRef<number>(Date.now());

  const defaultX = width - WIDGET_W - 16;
  const defaultY = height - WIDGET_H - 84 - insets.bottom;

  const posX = useSharedValue(defaultX);
  const posY = useSharedValue(defaultY);
  const startX = useSharedValue(defaultX);
  const startY = useSharedValue(defaultY);

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

  // Carica la posizione persistita (thread JS), riportandola dentro i limiti
  // visibili correnti così non compare mai fuori schermo.
  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        const clamped = clampUptimePos(
          parsed.x, parsed.y, width, height,
          insets.top + 8, insets.bottom + 8,
        );
        posX.value = clamped.x;
        posY.value = clamped.y;
      } catch {
        // ignora
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ad ogni cambio dimensioni/inset (rotazione, resize) riporta la posizione
  // corrente dentro i nuovi limiti, così il widget non finisce mai fuori schermo.
  useEffect(() => {
    const clamped = clampUptimePos(
      posX.value, posY.value, width, height,
      insets.top + 8, insets.bottom + 8,
    );
    posX.value = clamped.x;
    posY.value = clamped.y;
  }, [width, height, insets.top, insets.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePosition = useCallback((x: number, y: number) => {
    AsyncStorage.setItem(POS_KEY, JSON.stringify({ x, y })).catch(() => {});
  }, []);

  const openHistory = useCallback(() => {
    router.push("/admin/restart-history" as never);
  }, [router]);

  // Gesture.Pan() di RNGH: onStart fissa l'origine, onUpdate trascina (clampato
  // in tempo reale), onEnd persiste la posizione e — se lo spostamento è sotto
  // la soglia di tap — naviga allo storico riavvii. minDistance(0) garantisce
  // che anche un tap puro (zero movimento) porti il gesto in ACTIVE e scateni
  // onEnd. clampUptimePos/isDragGesture girano come worklet sul thread UI;
  // savePosition e la navigazione tornano sul thread JS via runOnJS.
  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      "worklet";
      startX.value = posX.value;
      startY.value = posY.value;
    })
    .onUpdate((e) => {
      "worklet";
      const clamped = clampUptimePos(
        startX.value + e.translationX,
        startY.value + e.translationY,
        width, height,
        insets.top + 8, insets.bottom + 8,
      );
      posX.value = clamped.x;
      posY.value = clamped.y;
    })
    .onEnd((e) => {
      "worklet";
      runOnJS(savePosition)(posX.value, posY.value);
      if (!isDragGesture(e.translationX, e.translationY, TAP_THRESHOLD)) {
        runOnJS(openHistory)();
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

  const now = Date.now();
  const fetchAge = now - fetchTimeRef.current;

  const frontendElapsed =
    data && data.backendStartedAt > 0
      ? data.serverNow - data.backendStartedAt + fetchAge
      : -1;

  const crashCount = data?.crashCount24h ?? 0;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.inner}>
          <Text style={styles.label}>
            {"⏱ "}
            {frontendElapsed >= 0 ? formatUptime(frontendElapsed) : "00:00.0"}
            {crashCount > 0 ? (
              <Text style={styles.crashLabel}>{`  💥 ${crashCount}`}</Text>
            ) : null}
          </Text>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 9999,
    elevation: 20,
  },
  inner: {
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
  },
  label: {
    color: "#00ff88",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  crashLabel: {
    color: "#FF6B35",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
