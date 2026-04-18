import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CURRENT_OTA_NUMBER } from "@/lib/ota";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

export default function TrackingScreen() {
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const baseRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const handleStart = useCallback(() => {
    if (running) return;
    startedAtRef.current = Date.now();
    baseRef.current = elapsedMs;
    setRunning(true);
    clearTimer();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      setElapsedMs(baseRef.current + (now - startedAtRef.current));
    }, 100);
  }, [running, elapsedMs, clearTimer]);

  const handleStop = useCallback(() => {
    clearTimer();
    setRunning(false);
    setElapsedMs(0);
  }, [clearTimer]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Cronometro</Text>
        <Text style={styles.subtitle}>OTA {CURRENT_OTA_NUMBER} — test base</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit>
          {formatTime(elapsedMs)}
        </Text>

        {!running ? (
          <Pressable
            onPress={handleStart}
            style={({ pressed }) => [
              styles.button,
              styles.buttonStart,
              pressed && styles.buttonPressed,
            ]}
            testID="start-button"
          >
            <Text style={styles.buttonLabel}>START</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [
              styles.button,
              styles.buttonStop,
              pressed && styles.buttonPressed,
            ]}
            testID="stop-button"
          >
            <Text style={styles.buttonLabel}>STOP</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0d",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#9aa0a6",
    fontSize: 13,
    marginTop: 4,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  display: {
    color: "#ffffff",
    fontSize: 56,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginBottom: 48,
  },
  button: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonStart: {
    backgroundColor: "#22c55e",
  },
  buttonStop: {
    backgroundColor: "#ef4444",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
