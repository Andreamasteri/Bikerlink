/**
 * Test della logica pura del pallino flottante.
 *
 * Componente sotto test: components/FloatingWidget.tsx
 *   — il singolo pallino flottante (PanResponder + Animated.ValueXY) che si
 *     trascina liberamente sullo schermo e, al tap, apre il menu di navigazione.
 *
 * Strategia (tightly coupled al codice di produzione):
 *   - Importa DIRETTAMENTE le funzioni pure esportate dal componente:
 *       clampPos      → mantiene il pallino dentro i bordi rispettando gli insets
 *       isDragGesture → discrimina tap da drag tramite la soglia TAP_THRESHOLD
 *     Se la loro logica cambia nel sorgente, questi test si rompono subito
 *     (regression guard diretto — zero duplicazione di logica).
 *   - Le dipendenze native (react-native, AsyncStorage, expo-router, ecc.) sono
 *     mockate solo per permettere il caricamento del modulo: il corpo del
 *     componente non viene mai eseguito.
 *
 * Copertura richiesta (da Task #4482):
 *   (a) clamp dentro i bordi  → posizione valida invariata
 *   (b) clamp oltre i bordi   → riportata dentro, rispettando notch/home indicator
 *   (c) discriminazione drag vs tap → isDragGesture vs TAP_THRESHOLD
 */

import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze necessarie solo per caricare il modulo ──────────────────
vi.mock("react-native", () => ({
  StyleSheet: { create: (s: unknown) => s },
  Animated: { ValueXY: class { setValue() {} stopAnimation() {} } },
  PanResponder: { create: (cfg: unknown) => cfg },
  View: {},
  Text: {},
  Pressable: {},
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
  Modal: {},
  Platform: { OS: "ios" },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: {}, MaterialCommunityIcons: {} }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/constants/colors", () => ({ default: {} }));
vi.mock("@/lib/floating-widget-context", () => ({ useFloatingWidget: () => ({ enabled: true, suppressed: false }) }));
vi.mock("@/hooks/useAssistantEnabled", () => ({ useAssistantEnabled: () => ({ fabEnabled: true }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({ default: {} }));

// ── import DIRETTO delle funzioni pure di produzione ─────────────────────────
import {
  clampPos,
  isDragGesture,
  TAP_THRESHOLD,
  WIDGET_SIZE,
} from "@/components/FloatingWidget";

// ── costanti di supporto ─────────────────────────────────────────────────────
const SCREEN_W = 400;
const SCREEN_H = 800;
const TOP = 47; // notch tipico iPhone
const BOTTOM = 34; // home indicator tipico
const MIN_Y = TOP + 8;
const MAX_Y_PAD = BOTTOM + 8;
const MAX_X = SCREEN_W - WIDGET_SIZE;
const MAX_Y = SCREEN_H - WIDGET_SIZE - MAX_Y_PAD;

// ── (a) clamp dentro i bordi ─────────────────────────────────────────────────
describe("clampPos — (a) posizione dentro i bordi resta invariata", () => {
  it("posizione centrale valida non viene modificata", () => {
    const r = clampPos(100, 300, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD);
    expect(r).toEqual({ x: 100, y: 300 });
  });

  it("posizione esattamente sui limiti minimi resta invariata", () => {
    const r = clampPos(0, MIN_Y, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD);
    expect(r).toEqual({ x: 0, y: MIN_Y });
  });

  it("posizione esattamente sui limiti massimi resta invariata", () => {
    const r = clampPos(MAX_X, MAX_Y, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD);
    expect(r).toEqual({ x: MAX_X, y: MAX_Y });
  });
});

// ── (b) clamp oltre i bordi (rispetta notch / home indicator) ────────────────
describe("clampPos — (b) posizione oltre i bordi viene riportata dentro", () => {
  it("x negativo → clampato a 0", () => {
    expect(clampPos(-50, 300, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).x).toBe(0);
  });

  it("x oltre destra → clampato a screenW - WIDGET_SIZE", () => {
    expect(clampPos(9999, 300, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).x).toBe(MAX_X);
  });

  it("y sopra il notch → clampato a minY (insets.top + 8)", () => {
    expect(clampPos(100, 0, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).y).toBe(MIN_Y);
  });

  it("y sotto l'home indicator → clampato a screenH - WIDGET_SIZE - (insets.bottom + 8)", () => {
    expect(clampPos(100, 9999, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).y).toBe(MAX_Y);
  });

  it("con insets a zero il clamp inferiore usa solo il padding di base", () => {
    const r = clampPos(100, 9999, SCREEN_W, SCREEN_H, 8, 8);
    expect(r.y).toBe(SCREEN_H - WIDGET_SIZE - 8);
  });

  it("clamp simultaneo su entrambi gli assi oltre i bordi", () => {
    const r = clampPos(-100, -100, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD);
    expect(r).toEqual({ x: 0, y: MIN_Y });
  });
});

// ── (c) discriminazione drag vs tap (TAP_THRESHOLD) ──────────────────────────
describe("isDragGesture — (c) discrimina tap da drag via TAP_THRESHOLD", () => {
  it("TAP_THRESHOLD vale 8 (contratto col componente)", () => {
    expect(TAP_THRESHOLD).toBe(8);
  });

  it("movimento nullo → tap (false)", () => {
    expect(isDragGesture(0, 0)).toBe(false);
  });

  it("movimento esattamente alla soglia → ancora tap (strettamente >)", () => {
    expect(isDragGesture(TAP_THRESHOLD, 0)).toBe(false);
    expect(isDragGesture(0, TAP_THRESHOLD)).toBe(false);
  });

  it("movimento appena oltre la soglia su x → drag (true)", () => {
    expect(isDragGesture(TAP_THRESHOLD + 1, 0)).toBe(true);
  });

  it("movimento appena oltre la soglia su y → drag (true)", () => {
    expect(isDragGesture(0, TAP_THRESHOLD + 1)).toBe(true);
  });

  it("movimento negativo oltre soglia → drag (usa valore assoluto)", () => {
    expect(isDragGesture(-(TAP_THRESHOLD + 1), 0)).toBe(true);
    expect(isDragGesture(0, -(TAP_THRESHOLD + 1))).toBe(true);
  });

  it("piccolo jitter sotto soglia su entrambi gli assi → tap (false)", () => {
    expect(isDragGesture(3, -4)).toBe(false);
  });

  it("soglia custom rispettata", () => {
    expect(isDragGesture(5, 0, 10)).toBe(false);
    expect(isDragGesture(11, 0, 10)).toBe(true);
  });
});
