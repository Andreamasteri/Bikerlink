import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Dimensions, PanResponder } from "react-native";

const { width: W, height: H } = Dimensions.get("window");
const SHIP_W = 40;
const SHIP_H = 30;
const ALIEN_COLS = 11;
const ALIEN_ROWS = 5;
const ALIEN_W = 24;
const ALIEN_H = 22;
const ALIEN_GAP_X = 8;
const ALIEN_GAP_Y = 8;
const BULLET_W = 4;
const BULLET_H = 12;
const ALIEN_BULLET_W = 4;
const ALIEN_BULLET_H = 12;
const GRID_W = ALIEN_COLS * (ALIEN_W + ALIEN_GAP_X) - ALIEN_GAP_X;
const GRID_ORIGIN_X = (W - GRID_W) / 2;

interface Bullet { id: number; x: number; y: number }
interface Alien { id: number; row: number; col: number; alive: boolean }

let _bid = 0;

function makeAliens(): Alien[] {
  const aliens: Alien[] = [];
  for (let r = 0; r < ALIEN_ROWS; r++) {
    for (let c = 0; c < ALIEN_COLS; c++) {
      aliens.push({ id: r * ALIEN_COLS + c, row: r, col: c, alive: true });
    }
  }
  return aliens;
}

const ALIEN_EMOJIS = ["👾", "👽", "🛸", "🤖", "☠️"];

interface Props {
  onGameOver: (score: number) => void;
}

export default function SpaceInvaders({ onGameOver }: Props) {
  const [shipX, setShipX] = useState(W / 2 - SHIP_W / 2);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [alienBullets, setAlienBullets] = useState<Bullet[]>([]);
  const [aliens, setAliens] = useState<Alien[]>(makeAliens);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [gridX, setGridX] = useState(GRID_ORIGIN_X);
  const [gridY, setGridY] = useState(50);
  const [, forceUpdate] = useState(0);

  const shipXRef = useRef(W / 2 - SHIP_W / 2);
  const bulletsRef = useRef<Bullet[]>([]);
  const alienBulletsRef = useRef<Bullet[]>([]);
  const aliensRef = useRef<Alien[]>(makeAliens());
  const scoreRef = useRef(0);
  const waveRef = useRef(1);
  const runningRef = useRef(true);
  const frameRef = useRef<number>(0);
  const frameCount = useRef(0);
  const lastShot = useRef(0);
  const lastAlienShot = useRef(0);
  const lastTime = useRef(0);
  const gridXRef = useRef(GRID_ORIGIN_X);
  const gridYRef = useRef(50);
  const sineOffset = useRef(0);

  const shoot = useCallback(() => {
    if (!runningRef.current) return;
    const now = Date.now();
    if (now - lastShot.current < 400) return;
    lastShot.current = now;
    bulletsRef.current.push({
      id: _bid++,
      x: shipXRef.current + SHIP_W / 2 - BULLET_W / 2,
      y: H - SHIP_H - 50,
    });
  }, []);

  const gestureStartX = useRef(W / 2 - SHIP_W / 2);
  const hasMoved = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gestureStartX.current = shipXRef.current;
        hasMoved.current = false;
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > 10) {
          hasMoved.current = true;
        }
        const next = Math.max(0, Math.min(W - SHIP_W, gestureStartX.current + gs.dx));
        shipXRef.current = next;
        setShipX(next);
      },
      onPanResponderRelease: (_, gs) => {
        if (!hasMoved.current && Math.abs(gs.dx) < 10) {
          shoot();
        }
        hasMoved.current = false;
      },
      onPanResponderTerminate: () => {
        hasMoved.current = false;
      },
    })
  ).current;

  useEffect(() => {
    const loop = (ts: number) => {
      if (!runningRef.current) return;
      const dt = ts - lastTime.current;
      lastTime.current = ts;
      if (dt > 200) { frameRef.current = requestAnimationFrame(loop); return; }

      frameCount.current++;

      bulletsRef.current = bulletsRef.current
        .map((b) => ({ ...b, y: b.y - 10 }))
        .filter((b) => b.y > -BULLET_H);

      const alienBulletSpeed = 5 + waveRef.current * 0.5;
      alienBulletsRef.current = alienBulletsRef.current
        .map((b) => ({ ...b, y: b.y + alienBulletSpeed }))
        .filter((b) => b.y < H + ALIEN_BULLET_H);

      if (frameCount.current % 2 === 0) {
        const amplitude = 30 + waveRef.current * 5;
        const frequency = 0.015 + waveRef.current * 0.003;
        sineOffset.current += frequency;
        gridXRef.current = GRID_ORIGIN_X + Math.sin(sineOffset.current) * amplitude;

        const aliveAliens = aliensRef.current.filter((a) => a.alive);
        if (aliveAliens.length === 0) {
          const nextWave = waveRef.current + 1;
          waveRef.current = nextWave;
          sineOffset.current = 0;
          gridXRef.current = GRID_ORIGIN_X;
          gridYRef.current = 50;
          aliensRef.current = makeAliens();
          setWave(nextWave);
          setAliens([...aliensRef.current]);
          frameRef.current = requestAnimationFrame(loop);
          return;
        }

        const maxRow = Math.max(...aliveAliens.map((a) => a.row));
        const gridBottom = gridYRef.current + maxRow * (ALIEN_H + ALIEN_GAP_Y) + ALIEN_H;
        if (gridBottom > H - SHIP_H - 80) {
          runningRef.current = false;
          onGameOver(scoreRef.current);
          return;
        }

        gridYRef.current += 0.2 + waveRef.current * 0.05;
        setGridX(gridXRef.current);
        setGridY(gridYRef.current);
      }

      if (frameCount.current - lastAlienShot.current > Math.max(20, 70 - waveRef.current * 8)) {
        const aliveAliens = aliensRef.current.filter((a) => a.alive);
        if (aliveAliens.length > 0) {
          const shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
          alienBulletsRef.current.push({
            id: _bid++,
            x: gridXRef.current + shooter.col * (ALIEN_W + ALIEN_GAP_X) + ALIEN_W / 2 - ALIEN_BULLET_W / 2,
            y: gridYRef.current + shooter.row * (ALIEN_H + ALIEN_GAP_Y) + ALIEN_H,
          });
          lastAlienShot.current = frameCount.current;
        }
      }

      const sx = shipXRef.current;
      const sy = H - SHIP_H - 40;
      for (const ab of alienBulletsRef.current) {
        if (
          ab.x + ALIEN_BULLET_W > sx + 4 &&
          ab.x < sx + SHIP_W - 4 &&
          ab.y + ALIEN_BULLET_H > sy &&
          ab.y < sy + SHIP_H
        ) {
          runningRef.current = false;
          onGameOver(scoreRef.current);
          return;
        }
      }

      for (let bi = bulletsRef.current.length - 1; bi >= 0; bi--) {
        const b = bulletsRef.current[bi];
        let hit = false;
        for (let ai = 0; ai < aliensRef.current.length; ai++) {
          const alien = aliensRef.current[ai];
          if (!alien.alive) continue;
          const ax = gridXRef.current + alien.col * (ALIEN_W + ALIEN_GAP_X);
          const ay = gridYRef.current + alien.row * (ALIEN_H + ALIEN_GAP_Y);
          if (
            b.x + BULLET_W > ax + 2 &&
            b.x < ax + ALIEN_W - 2 &&
            b.y + BULLET_H > ay + 2 &&
            b.y < ay + ALIEN_H - 2
          ) {
            aliensRef.current[ai] = { ...alien, alive: false };
            bulletsRef.current.splice(bi, 1);
            scoreRef.current += 10 * waveRef.current;
            hit = true;
            break;
          }
        }
        if (hit) break;
      }

      setScore(scoreRef.current);
      setBullets([...bulletsRef.current]);
      setAlienBullets([...alienBulletsRef.current]);
      setAliens([...aliensRef.current]);
      forceUpdate((n) => n + 1);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Text style={styles.score}>{score} pt</Text>
      <Text style={styles.wave}>Ondata {wave}</Text>

      {aliens.filter((a) => a.alive).map((alien) => (
        <View
          key={alien.id}
          style={[
            styles.alien,
            {
              left: gridX + alien.col * (ALIEN_W + ALIEN_GAP_X),
              top: gridY + alien.row * (ALIEN_H + ALIEN_GAP_Y),
            },
          ]}
        >
          <Text style={{ fontSize: 16 }}>{ALIEN_EMOJIS[alien.row % ALIEN_EMOJIS.length]}</Text>
        </View>
      ))}

      {bullets.map((b) => (
        <View key={b.id} style={[styles.bullet, { left: b.x, top: b.y }]} />
      ))}
      {alienBullets.map((b) => (
        <View key={b.id} style={[styles.alienBullet, { left: b.x, top: b.y }]} />
      ))}

      <View style={[styles.ship, { left: shipX, bottom: 40 }]}>
        <Text style={{ fontSize: 26 }}>🚀</Text>
      </View>

      <Text style={styles.hint}>Scorri per muovere • Tap per sparare</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030014", overflow: "hidden" },
  score: { position: "absolute", top: 16, right: 20, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  wave: { position: "absolute", top: 16, left: 20, fontSize: 14, fontFamily: "Inter_500Medium", color: "#4CAF50" },
  alien: { position: "absolute", width: ALIEN_W, height: ALIEN_H, alignItems: "center", justifyContent: "center" },
  bullet: { position: "absolute", width: BULLET_W, height: BULLET_H, backgroundColor: "#FFD700", borderRadius: 2 },
  alienBullet: { position: "absolute", width: ALIEN_BULLET_W, height: ALIEN_BULLET_H, backgroundColor: "#F44336", borderRadius: 2 },
  ship: { position: "absolute", width: SHIP_W, height: SHIP_H, alignItems: "center", justifyContent: "center" },
  hint: { position: "absolute", bottom: 6, alignSelf: "center", fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "Inter_400Regular" },
});
