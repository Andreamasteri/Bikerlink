import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLS = 10;
const ROWS = 20;
const { width: W } = Dimensions.get("window");
const CELL = Math.floor((W - 80) / COLS);

const TETROMINOES = [
  { shape: [[1,1,1,1]], color: "#00BCD4" },
  { shape: [[1,1],[1,1]], color: "#FFEB3B" },
  { shape: [[0,1,0],[1,1,1]], color: "#9C27B0" },
  { shape: [[1,0],[1,1],[0,1]], color: "#4CAF50" },
  { shape: [[0,1],[1,1],[1,0]], color: "#F44336" },
  { shape: [[1,0],[1,0],[1,1]], color: "#FF9800" },
  { shape: [[0,1],[0,1],[1,1]], color: "#2196F3" },
];

type Grid = (string | null)[][];

function emptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function rotate(shape: number[][]): number[][] {
  const R = shape.length, C = shape[0].length;
  const out: number[][] = Array.from({ length: C }, () => Array(R).fill(0));
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) out[c][R - 1 - r] = shape[r][c];
  return out;
}

function canPlace(grid: Grid, shape: number[][], x: number, y: number): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nr = y + r, nc = x + c;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc]) return false;
    }
  }
  return true;
}

function place(grid: Grid, shape: number[][], x: number, y: number, color: string): Grid {
  const g = grid.map((r) => [...r]);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) g[y + r][x + c] = color;
    }
  }
  return g;
}

function clearLines(grid: Grid): { grid: Grid; lines: number } {
  const kept = grid.filter((row) => row.some((c) => !c));
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  return { grid: [...empty, ...kept], lines: cleared };
}

const LINE_SCORES = [0, 100, 300, 500, 800];

interface Props {
  onGameOver: (score: number) => void;
}

export default function Tetris({ onGameOver }: Props) {
  const insets = useSafeAreaInsets();
  const [grid, setGrid] = useState<Grid>(emptyGrid());
  const [piece, setPiece] = useState<{ shape: number[][]; color: string; x: number; y: number } | null>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);

  const gridRef = useRef<Grid>(emptyGrid());
  const pieceRef = useRef<typeof piece>(null);
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const runningRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const newPiece = useCallback((g: Grid) => {
    const t = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
    const x = Math.floor((COLS - t.shape[0].length) / 2);
    const y = 0;
    if (!canPlace(g, t.shape, x, y)) {
      runningRef.current = false;
      onGameOver(scoreRef.current);
      return null;
    }
    return { shape: t.shape, color: t.color, x, y };
  }, [onGameOver]);

  const lock = useCallback(() => {
    if (!pieceRef.current) return;
    const { shape, color, x, y } = pieceRef.current;
    const g = place(gridRef.current, shape, x, y, color);
    const { grid: cleared, lines } = clearLines(g);
    linesRef.current += lines;
    const pts = LINE_SCORES[lines] * (1 + Math.floor(linesRef.current / 10));
    scoreRef.current += pts;
    setScore(scoreRef.current);
    setLevel(Math.floor(linesRef.current / 10) + 1);
    gridRef.current = cleared;
    setGrid(cleared);
    const next = newPiece(cleared);
    pieceRef.current = next;
    setPiece(next);
  }, [newPiece]);

  const drop = useCallback(() => {
    if (!pieceRef.current || !runningRef.current) return;
    const p = pieceRef.current;
    if (canPlace(gridRef.current, p.shape, p.x, p.y + 1)) {
      pieceRef.current = { ...p, y: p.y + 1 };
      setPiece({ ...p, y: p.y + 1 });
    } else {
      lock();
    }
  }, [lock]);

  useEffect(() => {
    const g = emptyGrid();
    const p = newPiece(g);
    pieceRef.current = p;
    setPiece(p);
    setGrid(g);
    gridRef.current = g;

    const speed = Math.max(200, 800 - (level - 1) * 80);
    timerRef.current = setInterval(drop, speed);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!runningRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const speed = Math.max(200, 800 - (level - 1) * 80);
    timerRef.current = setInterval(drop, speed);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [level, drop]);

  const moveLeft = () => {
    if (!pieceRef.current || !runningRef.current) return;
    const p = pieceRef.current;
    if (canPlace(gridRef.current, p.shape, p.x - 1, p.y)) {
      pieceRef.current = { ...p, x: p.x - 1 };
      setPiece({ ...p, x: p.x - 1 });
    }
  };

  const moveRight = () => {
    if (!pieceRef.current || !runningRef.current) return;
    const p = pieceRef.current;
    if (canPlace(gridRef.current, p.shape, p.x + 1, p.y)) {
      pieceRef.current = { ...p, x: p.x + 1 };
      setPiece({ ...p, x: p.x + 1 });
    }
  };

  const rotatePiece = () => {
    if (!pieceRef.current || !runningRef.current) return;
    const p = pieceRef.current;
    const r = rotate(p.shape);
    const kicks: [number, number][] = [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1], [1, -1], [-1, -1]];
    for (const [dx, dy] of kicks) {
      if (canPlace(gridRef.current, r, p.x + dx, p.y + dy)) {
        pieceRef.current = { ...p, shape: r, x: p.x + dx, y: p.y + dy };
        setPiece({ ...p, shape: r, x: p.x + dx, y: p.y + dy });
        return;
      }
    }
  };

  const hardDrop = () => {
    if (!pieceRef.current || !runningRef.current) return;
    let p = pieceRef.current;
    while (canPlace(gridRef.current, p.shape, p.x, p.y + 1)) {
      p = { ...p, y: p.y + 1 };
    }
    pieceRef.current = p;
    setPiece(p);
    lock();
  };

  const displayGrid = grid.map((row) => [...row]);
  if (piece) {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) {
          const nr = piece.y + r, nc = piece.x + c;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            displayGrid[nr][nc] = piece.color;
          }
        }
      }
    }
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.scoreLabel}>Score</Text>
        <Text style={styles.score}>{score}</Text>
        <Text style={styles.levelLabel}>Livello {level}</Text>
      </View>

      <View style={styles.board}>
        {displayGrid.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((cell, ci) => (
              <View
                key={ci}
                style={[
                  styles.cell,
                  cell ? { backgroundColor: cell, borderColor: "rgba(255,255,255,0.2)" } : styles.emptyCell,
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.controls}>
        <Pressable style={styles.btn} onPress={moveLeft}>
          <Text style={styles.btnText}>◀</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={rotatePiece}>
          <Text style={styles.btnText}>↻</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.dropBtn]} onPress={hardDrop}>
          <Text style={styles.btnText}>▼▼</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={moveRight}>
          <Text style={styles.btnText}>▶</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a1a", alignItems: "center", paddingTop: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 },
  scoreLabel: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" },
  score: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  levelLabel: { fontSize: 12, color: "#4CAF50", fontFamily: "Inter_500Medium" },
  board: { borderWidth: 1, borderColor: "#333" },
  row: { flexDirection: "row" },
  cell: { width: CELL, height: CELL, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.15)" },
  emptyCell: { backgroundColor: "#111" },
  controls: { flexDirection: "row", gap: 16, marginTop: 12 },
  btn: {
    backgroundColor: "#1e2a4a",
    minWidth: 56,
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2d3f6e",
    alignItems: "center",
    justifyContent: "center",
  },
  dropBtn: { minWidth: 64, backgroundColor: "#2962b8" },
  btnText: { fontSize: 20, color: "#fff", fontFamily: "Inter_700Bold" },
});
