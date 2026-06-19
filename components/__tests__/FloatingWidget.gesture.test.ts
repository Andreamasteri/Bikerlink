/**
 * Test della logica gesture/posizione del pallino flottante UNICO (Task #4456).
 *
 * Strategia:
 *   - Importa le funzioni/costanti PURE realmente esportate da FloatingWidget.tsx
 *     (TAP_THRESHOLD, BALL_SIZE, EDGE_MARGIN, isDragGesture, clampPosition): se
 *     cambiano nel sorgente, i test si rompono → regression guard diretto.
 *   - Non monta il componente (PanResponder/Animated non girano in Node): i moduli
 *     nativi importati a top-level sono mockati così l'import del modulo non lancia.
 *
 * Regressione target:
 *   - Tornare a RNGH (che rompeva drag/tap su Android reale).
 *   - Cambiare la soglia tap↔drag.
 *   - Rompere il clamping (pallino fuori schermo / sotto la tab bar).
 */

import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze native importate a top-level da FloatingWidget.tsx ───────
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
  Animated: { ValueXY: class {}, View: {}, spring: () => ({ start: vi.fn() }) },
  PanResponder: { create: (c: unknown) => c },
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  Pressable: {},
  Text: {},
  TouchableOpacity: {},
  View: {},
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn(() => ({ top: 47, bottom: 34 })) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: {} }));
vi.mock("expo-router", () => ({ useRouter: vi.fn(() => ({ push: vi.fn() })), usePathname: vi.fn(() => "/") }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn() } }));
vi.mock("@/hooks/useColors", () => ({ useColors: vi.fn(() => ({})) }));
vi.mock("@/lib/floating-widget-context", () => ({ useFloatingWidget: vi.fn(() => ({})) }));
vi.mock("@/hooks/useNewMatchAlert", () => ({ useNewMatchAlert: vi.fn(() => ({ newMatchCount: 0 })) }));
vi.mock("@/hooks/useAssistantEnabled", () => ({ useAssistantEnabled: vi.fn(() => ({ fabEnabled: true })) }));
vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({ default: () => null }));
vi.mock("@/components/admin/ai-console/FabDrawer", () => ({ default: () => null }));
vi.mock("@/hooks/admin/ai-console/useAiActionQueue", () => ({ useAiActionQueue: vi.fn(() => ({ queue: [], clearQueue: vi.fn() })) }));
vi.mock("@/hooks/admin/ai-console/useAiAlerts", () => ({ useAiAlertsState: vi.fn(() => ({ alerts: [], unreadCount: 0 })), useAiAlertsSubscriber: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn(() => ({ user: null })) }));

import {
  TAP_THRESHOLD,
  BALL_SIZE,
  EDGE_MARGIN,
  isDragGesture,
  clampPosition,
} from "@/components/FloatingWidget";

// ── costanti ──────────────────────────────────────────────────────────────────

describe("FloatingWidget — costanti (importate dal sorgente reale)", () => {
  it("TAP_THRESHOLD è 5px", () => {
    expect(TAP_THRESHOLD).toBe(5);
  });
  it("BALL_SIZE è 56px", () => {
    expect(BALL_SIZE).toBe(56);
  });
});

// ── tap vs drag ───────────────────────────────────────────────────────────────

describe("FloatingWidget — isDragGesture (tap vs drag)", () => {
  it("spostamento entro la soglia su entrambi gli assi → NON è drag (tap)", () => {
    expect(isDragGesture(0, 0)).toBe(false);
    expect(isDragGesture(TAP_THRESHOLD, TAP_THRESHOLD)).toBe(false);
    expect(isDragGesture(-TAP_THRESHOLD, -TAP_THRESHOLD)).toBe(false);
  });

  it("spostamento oltre la soglia su X → è drag", () => {
    expect(isDragGesture(TAP_THRESHOLD + 1, 0)).toBe(true);
    expect(isDragGesture(-(TAP_THRESHOLD + 1), 0)).toBe(true);
  });

  it("spostamento oltre la soglia su Y → è drag", () => {
    expect(isDragGesture(0, TAP_THRESHOLD + 1)).toBe(true);
    expect(isDragGesture(0, -(TAP_THRESHOLD + 1))).toBe(true);
  });
});

// ── clamping posizione ────────────────────────────────────────────────────────

describe("FloatingWidget — clampPosition (resta dentro lo schermo)", () => {
  const W = 390;
  const H = 844;
  const TOP = 47;
  const BOTTOM = 34;

  it("una posizione già valida resta invariata", () => {
    const r = clampPosition(100, 400, W, H, TOP, BOTTOM);
    expect(r).toEqual({ x: 100, y: 400 });
  });

  it("X negativo viene clampato al margine sinistro (EDGE_MARGIN)", () => {
    expect(clampPosition(-500, 400, W, H, TOP, BOTTOM).x).toBe(EDGE_MARGIN);
  });

  it("X troppo grande viene clampato al margine destro (W - BALL_SIZE - margine)", () => {
    expect(clampPosition(9999, 400, W, H, TOP, BOTTOM).x).toBe(W - BALL_SIZE - EDGE_MARGIN);
  });

  it("Y sopra l'inset top viene clampato sotto la status bar", () => {
    expect(clampPosition(100, -500, W, H, TOP, BOTTOM).y).toBe(TOP + EDGE_MARGIN);
  });

  it("Y troppo in basso resta sopra la tab bar (margine inferiore 64 + inset)", () => {
    expect(clampPosition(100, 9999, W, H, TOP, BOTTOM).y).toBe(H - BALL_SIZE - BOTTOM - 64);
  });

  it("il risultato è sempre dentro i bordi orizzontali per input casuali", () => {
    for (const x of [-1000, -1, 0, 200, 1000, 5000]) {
      const r = clampPosition(x, 400, W, H, TOP, BOTTOM);
      expect(r.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(r.x).toBeLessThanOrEqual(W - BALL_SIZE - EDGE_MARGIN);
    }
  });
});
