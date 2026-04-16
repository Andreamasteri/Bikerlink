import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
} from "react-native";
import Colors from "@/constants/colors";

const { width: W } = Dimensions.get("window");
const ZONE_CENTER = 0.5;
const ZONE_HALF_START = 0.15;
const ZONE_HALF_MIN = 0.04;
const OSCILLATOR_FORCE = 0.004;
const GRAVITY_FORCE = 0.002;
const TAP_FORCE = 0.03;

interface Props {
  onGameOver: (score: number) => void;
}

export default function WheelieChallenge({ onGameOver }: Props) {
  const [angle, setAngle] = useState(0.5);
  const [wheelieTime, setWheelieTime] = useState(0);
  const [inZone, setInZone] = useState(false);
  const [zoneHalf, setZoneHalf] = useState(ZONE_HALF_START);

  const angleRef = useRef(0.5);
  const velRef = useRef(0);
  const runningRef = useRef(true);
  const frameRef = useRef<number>(0);
  const inZoneStart = useRef<number | null>(null);
  const accumulatedMs = useRef(0);
  const totalWheelieMs = useRef(0);
  const lastTime = useRef(0);
  const zoneHalfRef = useRef(ZONE_HALF_START);

  const tap = useCallback(() => {
    if (!runningRef.current) return;
    velRef.current -= TAP_FORCE;
  }, []);

  useEffect(() => {
    const loop = (ts: number) => {
      if (!runningRef.current) return;
      const dt = ts - lastTime.current;
      lastTime.current = ts;
      if (dt > 200) { frameRef.current = requestAnimationFrame(loop); return; }

      velRef.current += GRAVITY_FORCE;
      const dir = angleRef.current > 0.5 ? 1 : -1;
      velRef.current += dir * OSCILLATOR_FORCE * (Math.random() * 2 - 1);
      velRef.current *= 0.97;

      angleRef.current = Math.max(0, Math.min(1, angleRef.current + velRef.current));

      const now = Date.now();

      const elapsed = accumulatedMs.current + (inZoneStart.current !== null ? now - inZoneStart.current : 0);
      const shrinkProgress = Math.min(elapsed / 30000, 1);
      const newHalf = ZONE_HALF_START - (ZONE_HALF_START - ZONE_HALF_MIN) * shrinkProgress;
      zoneHalfRef.current = newHalf;
      const zoneMin = ZONE_CENTER - newHalf;
      const zoneMax = ZONE_CENTER + newHalf;

      const isInZone = angleRef.current >= zoneMin && angleRef.current <= zoneMax;

      if (isInZone) {
        if (inZoneStart.current === null) inZoneStart.current = now;
        totalWheelieMs.current = accumulatedMs.current + (now - inZoneStart.current);
      } else {
        if (inZoneStart.current !== null) {
          accumulatedMs.current += now - inZoneStart.current;
          inZoneStart.current = null;
        }
        totalWheelieMs.current = accumulatedMs.current;
        if (angleRef.current <= 0 || angleRef.current >= 1) {
          runningRef.current = false;
          onGameOver(Math.floor(totalWheelieMs.current / 1000));
          return;
        }
      }

      setAngle(angleRef.current);
      setInZone(isInZone);
      setZoneHalf(zoneHalfRef.current);
      setWheelieTime(Math.floor(totalWheelieMs.current / 1000));
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const indicatorX = angleRef.current * (W - 40) + 20;
  const zoneLeft = (ZONE_CENTER - zoneHalf) * (W - 40) + 20;
  const zoneRight = (ZONE_CENTER + zoneHalf) * (W - 40) + 20;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏍️ Wheelie Challenge</Text>
      <Text style={styles.score}>{wheelieTime}s</Text>
      <Text style={styles.label}>Mantieni l'impennata nella zona verde!</Text>

      <View style={styles.barContainer}>
        <View style={[styles.zone, { left: zoneLeft - 20, width: zoneRight - zoneLeft }]} />
        <View style={[styles.indicator, { left: indicatorX - 12, backgroundColor: inZone ? "#4CAF50" : "#F44336" }]} />
        <View style={styles.barLine} />
      </View>

      <Text style={styles.angleLabel}>{Math.round(angle * 100)}°</Text>

      <Pressable style={[styles.tapBtn, inZone && styles.tapBtnActive]} onPress={tap}>
        <Text style={styles.tapBtnText}>TAP 🖐️</Text>
      </Pressable>

      <Text style={styles.hint}>Tappa per alzare la ruota anteriore</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1923",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 8 },
  score: { fontSize: 48, fontFamily: "Inter_700Bold", color: "#4CAF50", marginBottom: 4 },
  label: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", marginBottom: 40, textAlign: "center" },
  barContainer: {
    width: "100%",
    height: 60,
    position: "relative",
    justifyContent: "center",
    marginBottom: 16,
  },
  barLine: {
    position: "absolute",
    left: 20,
    right: 20,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
  },
  zone: {
    position: "absolute",
    height: 24,
    top: 18,
    backgroundColor: "rgba(76,175,80,0.3)",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  indicator: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    top: 18,
    shadowColor: "#fff",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  angleLabel: { fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "Inter_400Regular", marginBottom: 32 },
  tapBtn: {
    backgroundColor: "#1e3a5f",
    paddingVertical: 24,
    paddingHorizontal: 60,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#2962b8",
    marginBottom: 16,
  },
  tapBtnActive: { backgroundColor: "#2962b8", borderColor: "#4CAF50" },
  tapBtnText: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  hint: { fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "Inter_400Regular" },
});
