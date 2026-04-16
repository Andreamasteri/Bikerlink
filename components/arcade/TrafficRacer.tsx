import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
} from "react-native";

const { width: W, height: H } = Dimensions.get("window");
const LANES = 3;
const LANE_W = Math.floor(W / LANES);
const PLAYER_W = 36;
const PLAYER_H = 54;
const CAR_W = 32;
const CAR_H = 50;
const ROAD_SPEED_BASE = 5;

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
  const [playerLane, setPlayerLane] = useState(1);
  const [cars, setCars] = useState<Car[]>([]);
  const [score, setScore] = useState(0);

  const playerLaneRef = useRef(1);
  const carsRef = useRef<Car[]>([]);
  const scoreRef = useRef(0);
  const runningRef = useRef(true);
  const frameRef = useRef<number>(0);
  const frameCount = useRef(0);
  const lastTime = useRef(0);

  const moveLane = useCallback((dir: number) => {
    setPlayerLane((prev) => {
      const next = Math.max(0, Math.min(LANES - 1, prev + dir));
      playerLaneRef.current = next;
      return next;
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 30) moveLane(1);
        else if (gs.dx < -30) moveLane(-1);
      },
    })
  ).current;

  useEffect(() => {
    let lastSpawn = 0;

    const loop = (ts: number) => {
      if (!runningRef.current) return;
      const dt = ts - lastTime.current;
      lastTime.current = ts;
      if (dt > 200) { frameRef.current = requestAnimationFrame(loop); return; }

      frameCount.current++;
      const speed = ROAD_SPEED_BASE + Math.floor(frameCount.current / 300) * 1.5;
      scoreRef.current += 1;

      if (frameCount.current - lastSpawn > 50 + Math.random() * 40) {
        const lane = Math.floor(Math.random() * LANES);
        carsRef.current.push({
          id: _id++,
          lane,
          y: -CAR_H,
          emoji: CAR_EMOJIS[Math.floor(Math.random() * CAR_EMOJIS.length)],
          passed: false,
        });
        lastSpawn = frameCount.current;
      }

      carsRef.current = carsRef.current
        .map((c) => ({ ...c, y: c.y + speed }))
        .filter((c) => c.y < H + CAR_H);

      const playerLaneNow = playerLaneRef.current;
      const playerTop = H - PLAYER_H - 40;
      const playerBot = H - 40;

      for (const car of carsRef.current) {
        if (!car.passed && car.y + CAR_H > playerTop && car.y < playerBot && car.lane === playerLaneNow) {
          runningRef.current = false;
          onGameOver(scoreRef.current);
          return;
        }
        if (!car.passed && car.y > playerBot) {
          car.passed = true;
          scoreRef.current += 50;
        }
      }

      setScore(scoreRef.current);
      setCars([...carsRef.current]);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const playerX = playerLane * LANE_W + (LANE_W - PLAYER_W) / 2;

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

      <View style={[styles.player, { left: playerX, bottom: 40 }]}>
        <Text style={{ fontSize: 30 }}>🏍️</Text>
      </View>

      <Text style={styles.hint}>Scorri sinistra/destra per cambiare corsia</Text>
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
  hint: { position: "absolute", bottom: 6, alignSelf: "center", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "Inter_400Regular" },
});
