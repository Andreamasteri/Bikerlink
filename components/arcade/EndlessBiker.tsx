import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const { width: W, height: H } = Dimensions.get("window");
const GROUND_Y = H * 0.7;
const BIKER_X = 80;
const BIKER_W = 48;
const BIKER_H = 32;
const OBS_W = 28;
const OBS_H_MIN = 20;
const OBS_H_MAX = 50;
const GRAVITY = 0.6;
const JUMP_VEL = -14;
const DUCK_H = 16;
const SPEED_BASE = 5;

interface Obstacle {
  x: number;
  h: number;
  type: "cone" | "car" | "hole";
}

interface Props {
  onGameOver: (score: number) => void;
}

export default function EndlessBiker({ onGameOver }: Props) {
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState(true);
  const [score, setScore] = useState(0);
  const [isDucking, setIsDucking] = useState(false);

  const bikerY = useRef(GROUND_Y - BIKER_H);
  const velY = useRef(0);
  const onGround = useRef(true);
  const ducking = useRef(false);
  const obstacles = useRef<Obstacle[]>([]);
  const frameRef = useRef<number>(0);
  const elapsedMs = useRef(0);
  const scoreRef = useRef(0);
  const runningRef = useRef(true);
  const lastTime = useRef(0);
  const lastObsMs = useRef(0);

  const bikerAnim = useRef(new Animated.Value(GROUND_Y - BIKER_H)).current;
  const [, forceUpdate] = useState(0);

  const insetsRef = useRef(insets);
  useEffect(() => { insetsRef.current = insets; }, [insets]);

  const spawnObstacle = () => {
    const types: Obstacle["type"][] = ["cone", "car", "hole"];
    const type = types[Math.floor(Math.random() * types.length)];
    const h = type === "hole" ? 8 : OBS_H_MIN + Math.random() * (OBS_H_MAX - OBS_H_MIN);
    obstacles.current.push({ x: W + 20, h, type });
  };

  const jump = useCallback(() => {
    if (onGround.current && runningRef.current) {
      velY.current = JUMP_VEL;
      onGround.current = false;
    }
  }, []);

  const duck = useCallback((active: boolean) => {
    ducking.current = active;
    setIsDucking(active);
  }, []);

  useEffect(() => {
    const loop = (ts: number) => {
      if (!runningRef.current) return;
      const dt = ts - lastTime.current;
      lastTime.current = ts;
      if (dt > 200) { frameRef.current = requestAnimationFrame(loop); return; }

      const k = dt / 16.67;
      elapsedMs.current += dt;
      scoreRef.current = Math.floor(elapsedMs.current / 100);
      const speed = (SPEED_BASE + scoreRef.current * 0.003) * k;

      velY.current += GRAVITY * k;
      bikerY.current += velY.current * k;
      const groundLevel = GROUND_Y - (ducking.current ? DUCK_H : BIKER_H);
      if (bikerY.current >= groundLevel) {
        bikerY.current = groundLevel;
        velY.current = 0;
        onGround.current = true;
      }
      bikerAnim.setValue(bikerY.current);

      const spawnInterval = (80 + Math.random() * 60) * 16.67;
      if (elapsedMs.current - lastObsMs.current > spawnInterval) {
        spawnObstacle();
        lastObsMs.current = elapsedMs.current;
      }

      for (let i = obstacles.current.length - 1; i >= 0; i--) {
        obstacles.current[i].x -= speed;
        if (obstacles.current[i].x < -50) {
          obstacles.current.splice(i, 1);
        }
      }

      const bikerH = ducking.current ? DUCK_H : BIKER_H;
      const bTop = bikerY.current;
      const bBot = bikerY.current + bikerH;
      const bLeft = BIKER_X;
      const bRight = BIKER_X + BIKER_W;

      for (const obs of obstacles.current) {
        const oLeft = obs.x;
        const oRight = obs.x + OBS_W;
        const oTop = GROUND_Y - obs.h;
        const oBot = GROUND_Y;

        if (bRight > oLeft + 4 && bLeft < oRight - 4 && bBot > oTop + 4 && bTop < oBot - 4) {
          runningRef.current = false;
          setRunning(false);
          onGameOver(scoreRef.current);
          return;
        }
      }

      setScore(scoreRef.current);
      forceUpdate((n) => n + 1);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDuckGestureRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDuckGestureRef.current = false;
      },
      onPanResponderMove: (_, gs) => {
        if (!isDuckGestureRef.current && gs.dy > 30) {
          isDuckGestureRef.current = true;
          duck(true);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (!isDuckGestureRef.current && Math.abs(gs.dy) < 30) {
          jump();
        }
        duck(false);
        isDuckGestureRef.current = false;
      },
      onPanResponderTerminate: () => {
        duck(false);
        isDuckGestureRef.current = false;
      },
    })
  ).current;

  const bikerH = isDucking ? DUCK_H : BIKER_H;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Text style={styles.score}>{score} m</Text>

      <View style={[styles.ground, { top: GROUND_Y }]} />

      <Animated.View
        style={[
          styles.biker,
          {
            left: BIKER_X,
            top: bikerAnim,
            width: BIKER_W,
            height: bikerH,
          },
        ]}
      >
        <Text style={{ fontSize: 22 }}>🏍️</Text>
      </Animated.View>

      {obstacles.current.map((obs, i) => (
        <View
          key={i}
          style={[
            styles.obstacle,
            {
              left: obs.x,
              top: GROUND_Y - obs.h,
              width: OBS_W,
              height: obs.h,
              backgroundColor:
                obs.type === "cone" ? "#FF6B00" : obs.type === "car" ? "#4FC3F7" : "#333",
            },
          ]}
        >
          <Text style={{ fontSize: obs.type === "car" ? 14 : obs.type === "cone" ? 14 : 10 }}>
            {obs.type === "cone" ? "🚧" : obs.type === "car" ? "🚗" : "⬛"}
          </Text>
        </View>
      ))}

      <Text style={[styles.hint, { bottom: 20 + insets.bottom }]}>Tap = Salta • Scorri giù = Abbassati</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", overflow: "hidden" },
  ground: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#4a4a6a",
  },
  biker: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  obstacle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "flex-end",
    borderRadius: 4,
  },
  score: {
    position: "absolute",
    top: 16,
    right: 20,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
  },
});
