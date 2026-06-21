import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  PanResponder,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
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
// servono limiti distinti per asse.
export function clampUptimePos(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  minY: number,
  maxYPad: number,
): { x: number; y: number } {
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

  // Posizione corrente del widget come shared values Reanimated — il transform
  // usa questi valori per posizionare il widget sullo schermo.
  const posX = useSharedValue(defaultX);
  const posY = useSharedValue(defaultY);

  // Origine del drag corrente (salvata a onPanResponderGrant sul JS thread).
  const dragStartX = useRef(defaultX);
  const dragStartY = useRef(defaultY);

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

  // PanResponder — gira completamente sul thread JS, nessun conflitto con i
  // gesture handler nativi di Expo Router (RNGH). onGrant registra l'origine,
  // onMove aggiorna la posizione in tempo reale (clampata ai bordi), onRelease
  // persiste e discrimina tap da drag tramite isDragGesture. Nessun Pressable
  // interno: la navigazione parte esclusivamente da onRelease, così il click
  // non può essere intercettato da un handler separato.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartX.current = posX.value;
        dragStartY.current = posY.value;
      },
      onPanResponderMove: (_, gs) => {
        const clamped = clampUptimePos(
          dragStartX.current + gs.dx,
          dragStartY.current + gs.dy,
          width, height,
          insets.top + 8, insets.bottom + 8,
        );
        posX.value = clamped.x;
        posY.value = clamped.y;
      },
      onPanResponderRelease: (_, gs) => {
        savePosition(posX.value, posY.value);
        if (!isDragGesture(gs.dx, gs.dy, TAP_THRESHOLD)) {
          openHistory();
        }
      },
      onPanResponderTerminate: () => {
        savePosition(posX.value, posY.value);
      },
    })
  ).current;

  // Posizionamento via transform (translateX/translateY) invece di left/top: su
  // Android animare left/top sposta il pixel ma lascia l'hitbox del touch alla
  // posizione di layout originale. Con il transform l'area di tocco segue la
  // posizione visiva.
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
      <View {...panResponder.panHandlers} style={styles.inner}>
        <Text style={styles.label}>
          {"⏱ "}
          {frontendElapsed >= 0 ? formatUptime(frontendElapsed) : "00:00.0"}
          {crashCount > 0 ? (
            <Text style={styles.crashLabel}>{`  💥 ${crashCount}`}</Text>
          ) : null}
        </Text>
      </View>
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
