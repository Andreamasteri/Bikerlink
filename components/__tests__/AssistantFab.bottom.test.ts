/**
 * Unit test — AssistantFab bottom-offset formula.
 *
 * Importa la funzione `computeAssistantFabBottom` e le costanti reali
 * da AssistantFab.tsx: se qualcuno cambia la formula nel componente,
 * questi test si rompono immediatamente (regression guard diretto).
 *
 * Non monta il componente (nessuna dipendenza RN/RNGH richiesta):
 * testa solo la funzione pura esportata dal componente.
 */

import { describe, it, expect } from "vitest";

// ── mock: dipendenze RN non necessarie in questo test ────────────────────────
// AssistantFab.tsx importa react-native e moduli nativi al top-level.
// Li mocchiamo prima dell'import per non bloccare il module resolver Node.

import { vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { create: (s: unknown) => s },
  Dimensions: { addEventListener: () => ({ remove: vi.fn() }) },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light", Medium: "medium" } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: {} }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: vi.fn(() => ({ bottom: 0, top: 0 })) }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn() } }));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Tap: () => ({ onBegin: () => ({ onFinalize: () => ({ onEnd: () => ({}) }) }) }),
    Pan: () => ({ minDistance: () => ({ onStart: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) }) }),
    Exclusive: () => ({}),
  },
  GestureDetector: {},
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (v: unknown) => ({ value: v }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (v: unknown) => v,
  runOnJS: (fn: unknown) => fn,
  default: { View: {} },
}));
vi.mock("react-native-keyboard-controller", () => ({ KeyboardAvoidingView: {}, KeyboardAwareScrollView: {} }));
vi.mock("@/hooks/useColors", () => ({ useColors: vi.fn(() => ({ primary: "#000", text: "#FFF" })) }));
vi.mock("@/hooks/useAssistantEnabled", () => ({ useAssistantEnabled: vi.fn(() => ({ fabEnabled: true })) }));
vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({ default: {} }));
vi.mock("react", () => ({
  useState: (v: unknown) => [v, vi.fn()],
  useCallback: (fn: () => unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useEffect: vi.fn(),
  default: { createElement: vi.fn() },
}));

// ── import del modulo sotto test (DOPO i mock) ────────────────────────────────
import {
  computeAssistantFabBottom,
  clampAssistantFabPosition,
  ASSISTANT_FAB_TAB_BAR_HEIGHT,
  ASSISTANT_FAB_BOTTOM_MARGIN,
  ASSISTANT_FAB_WEB_INSET,
  ASSISTANT_FAB_LEFT_MARGIN,
  ASSISTANT_FAB_TAP_THRESHOLD,
} from "@/components/user/ai-assistant/AssistantFab";

// ── test ──────────────────────────────────────────────────────────────────────

describe("AssistantFab — bottom offset formula (computeAssistantFabBottom)", () => {
  describe("Platform iOS/Android — usa insets.bottom reale", () => {
    it("insets.bottom = 0 (Android senza gesture bar) → TAB_BAR_HEIGHT + BOTTOM_MARGIN = 76", () => {
      const bottom = computeAssistantFabBottom(0, false);
      expect(bottom).toBe(ASSISTANT_FAB_TAB_BAR_HEIGHT + ASSISTANT_FAB_BOTTOM_MARGIN);
      expect(bottom).toBe(76);
    });

    it("insets.bottom = 34 (iPhone con home indicator) → 34 + TAB_BAR_HEIGHT + BOTTOM_MARGIN = 110", () => {
      const bottom = computeAssistantFabBottom(34, false);
      expect(bottom).toBe(34 + ASSISTANT_FAB_TAB_BAR_HEIGHT + ASSISTANT_FAB_BOTTOM_MARGIN);
      expect(bottom).toBe(110);
    });

    it("insets.bottom = 44 (iPhone più grande) → 44 + TAB_BAR_HEIGHT + BOTTOM_MARGIN = 120", () => {
      const bottom = computeAssistantFabBottom(44, false);
      expect(bottom).toBe(44 + ASSISTANT_FAB_TAB_BAR_HEIGHT + ASSISTANT_FAB_BOTTOM_MARGIN);
      expect(bottom).toBe(120);
    });

    it("formula lineare: aumentare insets.bottom di 1 aumenta bottom di 1", () => {
      const b0 = computeAssistantFabBottom(20, false);
      const b1 = computeAssistantFabBottom(21, false);
      expect(b1 - b0).toBe(1);
    });
  });

  describe("Platform web — usa ASSISTANT_FAB_WEB_INSET fisso (34)", () => {
    it("su web ignora insets.bottom e usa WEB_INSET → 34 + TAB_BAR_HEIGHT + BOTTOM_MARGIN = 110", () => {
      const bottom = computeAssistantFabBottom(0, true);
      expect(bottom).toBe(ASSISTANT_FAB_WEB_INSET + ASSISTANT_FAB_TAB_BAR_HEIGHT + ASSISTANT_FAB_BOTTOM_MARGIN);
      expect(bottom).toBe(110);
    });

    it("su web, anche con insets.bottom > 0, usa sempre WEB_INSET (34)", () => {
      const bottomA = computeAssistantFabBottom(0, true);
      const bottomB = computeAssistantFabBottom(50, true);
      expect(bottomA).toBe(bottomB);
    });
  });

  describe("invarianti delle costanti (regressione se cambiate senza aggiornare il test)", () => {
    it("ASSISTANT_FAB_TAB_BAR_HEIGHT è 60", () => {
      expect(ASSISTANT_FAB_TAB_BAR_HEIGHT).toBe(60);
    });

    it("ASSISTANT_FAB_BOTTOM_MARGIN è 16", () => {
      expect(ASSISTANT_FAB_BOTTOM_MARGIN).toBe(16);
    });

    it("ASSISTANT_FAB_WEB_INSET è 34", () => {
      expect(ASSISTANT_FAB_WEB_INSET).toBe(34);
    });

    it("bottom non è mai inferiore a TAB_BAR_HEIGHT + BOTTOM_MARGIN con insets.bottom = 0", () => {
      const bottom = computeAssistantFabBottom(0, false);
      expect(bottom).toBeGreaterThanOrEqual(ASSISTANT_FAB_TAB_BAR_HEIGHT + ASSISTANT_FAB_BOTTOM_MARGIN);
    });
  });
});

// ── test: drag — costanti e clamp di posizione ────────────────────────────────

describe("AssistantFab — drag: costanti", () => {
  it("ASSISTANT_FAB_LEFT_MARGIN è 16 (posizione X di default bottom-left)", () => {
    expect(ASSISTANT_FAB_LEFT_MARGIN).toBe(16);
  });

  it("ASSISTANT_FAB_TAP_THRESHOLD è 5px — il pan attiva con minDistance = soglia + 1 = 6px", () => {
    expect(ASSISTANT_FAB_TAP_THRESHOLD).toBe(5);
  });
});

describe("AssistantFab — clampAssistantFabPosition (drag dentro i bordi schermo)", () => {
  // Schermo di riferimento: 390×844, FAB 56px, inset top 47 / bottom 34 (iPhone tipico)
  const W = 390;
  const H = 844;
  const TOP = 47;
  const BOTTOM = 34;

  it("posizione centrale valida resta invariata", () => {
    const { x, y } = clampAssistantFabPosition(100, 400, W, H, TOP, BOTTOM);
    expect(x).toBe(100);
    expect(y).toBe(400);
  });

  it("X negativa viene clampata a 0 (bordo sinistro)", () => {
    const { x } = clampAssistantFabPosition(-50, 400, W, H, TOP, BOTTOM);
    expect(x).toBe(0);
  });

  it("X oltre il bordo destro viene clampata a screenW - FAB_SIZE", () => {
    const { x } = clampAssistantFabPosition(9999, 400, W, H, TOP, BOTTOM);
    expect(x).toBe(W - 56);
  });

  it("Y sopra l'inset top viene clampata a insetTop + 8", () => {
    const { y } = clampAssistantFabPosition(100, -100, W, H, TOP, BOTTOM);
    expect(y).toBe(TOP + 8);
  });

  it("Y sotto il bordo inferiore viene clampata rispettando l'inset bottom", () => {
    const { y } = clampAssistantFabPosition(100, 9999, W, H, TOP, BOTTOM);
    expect(y).toBe(H - 56 - 8 - BOTTOM);
  });

  it("la posizione clampata è sempre dentro i bordi validi", () => {
    const cases: Array<[number, number]> = [
      [-1000, -1000],
      [10000, 10000],
      [0, 0],
      [195, 422],
    ];
    for (const [ix, iy] of cases) {
      const { x, y } = clampAssistantFabPosition(ix, iy, W, H, TOP, BOTTOM);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(W - 56);
      expect(y).toBeGreaterThanOrEqual(TOP + 8);
      expect(y).toBeLessThanOrEqual(H - 56 - 8 - BOTTOM);
    }
  });

  it("posizione valida in landscape rientra nei bordi dopo restringimento a portrait", () => {
    // FAB salvato in basso a destra in landscape (844×390), poi rotazione a
    // portrait (390×844): la X diventa fuori-bordo e va ri-clampata.
    const landscapeX = 844 - 56; // bordo destro in landscape
    const landscapeY = 390 - 56 - 8 - BOTTOM; // basso in landscape
    const { x, y } = clampAssistantFabPosition(landscapeX, landscapeY, W, H, TOP, BOTTOM);
    expect(x).toBe(W - 56); // ri-clampata al nuovo bordo destro portrait
    expect(x).toBeLessThanOrEqual(W - 56);
    expect(y).toBeGreaterThanOrEqual(TOP + 8);
    expect(y).toBeLessThanOrEqual(H - 56 - 8 - BOTTOM);
  });
});
