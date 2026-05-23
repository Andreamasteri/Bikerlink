import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");
const LANES = 3;
const LANE_W = Math.floor(W / LANES);
const PLAYER_W = 36;
const PLAYER_H = 54;
const CAR_W = 32;
const CAR_H = 50;
const ROAD_SPEED_BASE = 5;
const PLAYER_BOTTOM_OFFSET = 40;

interface Car {
  id: number;
  lane: number;
  y: number;
  emoji: string;
  passed: boolean;
}

interface Props {
  onGameOver: (score: number) => void;
}

const CAR_EMOJIS = ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️"];
let _id = 0;

export default function TrafficRacer({ onGameOver }: Props) {
  const insets = useSafeAreaInsets();
  const [playerLane, setPlayerLane] = useState(1);
  const [cars, setCars] = useState<Car[]>([]);
  const [score, setScore] = useState(0);

  const insetsRef = useRef(insets);
  useEffect(() => { insetsRef.current = insets; }, [insets]);

  const playerLaneRef = useRef(1);
  const carsRef = useRef<Car[]>([]);
  const scoreRef = useRef(0);
  const runningRef = useRef(true);
  const frameRef = useRef<number>(0);
  const elapsedMs = useRef(0);
  const lastTime = useRef(0);
  const lastSpawnMs = useRef(0);

  const moveLane = useCallback((dir: number) => {
    setPlayerLane((prev) => {
      const next = Math.max(0, Math.min(LANES - 1, prev + dir));
      playerLaneRef.current = next;
      return next;
    });
  }, []);

  const laneSwitchedRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        laneSwitchedRef.current = false;
      },
      onPanResponderMove: (_, gs) => {
        if (!laneSwitchedRef.current) {
          if (gs.dx > 30) {
            laneSwitchedRef.current = true;
            moveLane(1);
          } else if (gs.dx < -30) {
            laneSwitchedRef.current = true;
            moveLane(-1);
          }
        }
      },
      onPanResponderRelease: () => {
        laneSwitchedRef.current = false;
      },
      onPanResponderTerminate: () => {
        laneSwitchedRef.current = false;
      },
    })
  ).current;

  useEffect(() => {
    const loop = (ts: number) => {
      if (!runningRef.current) return;
      const dt = ts - lastTime.current;
      lastTime.current = ts;
      if (dt > 200) { frameRef.current = requestAnimationFrame(loop); return; }

      const k = dt / 16.67;
      elapsedMs.current += dt;

      const speed = (ROAD_SPEED_BASE + Math.floor(elapsedMs.current / 5000) * 1.5) * k;
      scoreRef.current += k;

      const spawnInterval = (50 + Math.random() * 40) * 16.67;
      if (elapsedMs.current - lastSpawnMs.current > spawnInterval) {
        const lane = Math.floor(Math.random() * LANES);
        carsRef.current.push({
          id: _id++,
          lane,
          y: -CAR_H,
          emoji: CAR_EMOJIS[Math.floor(Math.random() * CAR_EMOJIS.length)],
          passed: false,
        });
        lastSpawnMs.current = elapsedMs.current;
      }

      carsRef.current = carsRef.current
        .map((c) => ({ ...c, y: c.y + speed }))
        .filter((c) => c.y < H + CAR_H);

      const bottomOffset = PLAYER_BOTTOM_OFFSET + insetsRef.current.bottom;
      const playerLaneNow = playerLaneRef.current;
      const playerTop = H - PLAYER_H - bottomOffset;
      const playerBot = H - bottomOffset;

      for (const car of carsRef.current) {
        if (!car.passed && car.y + CAR_H > playerTop && car.y < playerBot && car.lane === playerLaneNow) {
          runningRef.current = false;
          onGameOver(Math.floor(scoreRef.current));
          return;
        }
        if (!car.passed && car.y > playerBot) {
          car.passed = true;
          scoreRef.current += 50;
        }
      }

      setScore(Math.floor(scoreRef.current));
      setCars([...carsRef.current]);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playerX = playerLane * LANE_W + (LANE_W - PLAYER_W) / 2;
  const playerBottom = PLAYER_BOTTOM_OFFSET + insets.bottom;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Text style={styles.score}>{score} pt</Text>

      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.laneDivider, { left: i * LANE_W }]} />
      ))}

      {cars.map((car) => (
        <View
          key={car.id}
          style={[
            styles.car,
            {
              left: car.lane * LANE_W + (LANE_W - CAR_W) / 2,
              top: car.y,
            },
          ]}
        >
          <Text style={{ fontSize: 28 }}>{car.emoji}</Text>
        </View>
      ))}

      <View style={[styles.player, { left: playerX, bottom: playerBottom }]}>
        <Text style={{ fontSize: 30 }}>🏍️</Text>
      </View>

      <Text style={[styles.hint, { bottom: 6 + insets.bottom }]}>Scorri sinistra/destra per cambiare corsia</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#2d2d2d", overflow: "hidden" },
  laneDivider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  car: { position: "absolute", width: CAR_W, height: CAR_H, alignItems: "center", justifyContent: "center" },
  player: { position: "absolute", width: PLAYER_W, height: PLAYER_H, alignItems: "center", justifyContent: "center" },
  score: { position: "absolute", top: 16, right: 20, fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  hint: { position: "absolute", alignSelf: "center", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "Inter_400Regular" },
});
