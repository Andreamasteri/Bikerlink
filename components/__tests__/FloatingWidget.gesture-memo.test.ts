/**
 * Regression guard — gesti RNGH del FloatingWidget MEMOIZZATI (stabili tra render).
 *
 * Perché esiste:
 *   La "pallina notifiche non trascinabile" era causata dal pan creato inline:
 *   `onStart` chiama setIsTouching → re-render → il gesto veniva ricreato a metà
 *   trascinamento, RNGH ri-registrava l'handler nativo e il pan si interrompeva.
 *   La correzione avvolge i gesti in useMemo. Questo test MONTA davvero il
 *   FloatingWidget (React reale, NON mockato) e verifica che il gesto composto
 *   passato al <GestureDetector> della pallina resti la STESSA referenza dopo un
 *   re-render innescato proprio da setIsTouching (lo stesso path del bug).
 *
 *   Se i gesti tornano inline (useMemo rimosso), ogni render crea un nuovo
 *   oggetto gesto → la referenza cambia → il test FALLISCE.
 *
 * Differenza da FloatingWidget.gesture.test.ts:
 *   Quel file mocka `react` (useMemo no-op) e testa solo logica JS pura. Qui usiamo
 *   React reale + react-test-renderer per esercitare la memoizzazione reale.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── stato condiviso (hoisted) per catturare i gesti dai GestureDetector ───────
const h = vi.hoisted(() => {
  type Builder = {
    _type: "Tap" | "Pan" | "Exclusive";
    _cb: Record<string, (...args: unknown[]) => unknown>;
    gestures?: Builder[];
    [k: string]: unknown;
  };

  function makeBuilder(type: Builder["_type"]): Builder {
    const b: Builder = { _type: type, _cb: {} };
    const chain = (name: string) => (arg: unknown) => {
      if (typeof arg === "function") b._cb[name] = arg as (...a: unknown[]) => unknown;
      return b;
    };
    for (const m of ["minDistance", "onBegin", "onStart", "onUpdate", "onEnd", "onFinalize", "runOnJS"]) {
      b[m] = chain(m);
    }
    return b;
  }

  const Gesture = {
    Tap: () => makeBuilder("Tap"),
    Pan: () => makeBuilder("Pan"),
    Exclusive: (...gestures: Builder[]) => {
      const b = makeBuilder("Exclusive");
      b.gestures = gestures;
      return b;
    },
  };

  const captures: Builder[] = [];

  return { Gesture, captures };
});

// ── mock dipendenze native (NON mockiamo `react`: serve memoizzazione reale) ──
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
  Dimensions: { addEventListener: () => ({ remove: vi.fn() }) },
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  View: (props: { children?: unknown }) => (props.children ?? null) as never,
  Text: (props: { children?: unknown }) => (props.children ?? null) as never,
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light", Medium: "medium" } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn() },
}));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: h.Gesture,
  GestureDetector: (props: { gesture: unknown; children?: unknown }) => {
    h.captures.push(props.gesture as never);
    return (props.children ?? null) as never;
  },
}));
vi.mock("react-native-reanimated", async () => {
  // useSharedValue DEVE restituire una referenza STABILE tra i render (come la
  // vera Reanimated), altrimenti i shared value cambierebbero a ogni render e i
  // useMemo dei gesti (che li hanno come dep) si invaliderebbero per costruzione,
  // mascherando il vero comportamento di memoizzazione del componente.
  const { useRef } = await import("react");
  return {
    useSharedValue: (v: unknown) => useRef({ value: v }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (v: unknown) => v,
    runOnJS: (fn: (...a: unknown[]) => unknown) => fn,
    Easing: { out: () => undefined, in: () => undefined, ease: undefined },
    default: { View: (props: { children?: unknown }) => (props.children ?? null) as never },
  };
});
vi.mock("@/lib/floating-widget-context", () => ({
  useFloatingWidget: () => ({ isVisible: true, unreadChat: 0, unreadNotifications: 0, refetchBadges: vi.fn() }),
}));
vi.mock("@/lib/theme-context", () => ({
  useTheme: () => ({ colors: { primary: "#000", text: "#FFF", accent: "#0A0", surface: "#FFF", border: "#CCC", accentRed: "#F00" } }),
}));

// ── import del componente sotto test (DOPO i mock) ────────────────────────────
import FloatingWidget from "@/components/FloatingWidget";

type Builder = (typeof h.captures)[number];

function lastExclusive(): Builder | undefined {
  for (let i = h.captures.length - 1; i >= 0; i--) {
    if (h.captures[i]?._type === "Exclusive") return h.captures[i];
  }
  return undefined;
}

describe("FloatingWidget — gesti RNGH memoizzati (stabilità tra re-render)", () => {
  beforeEach(() => {
    h.captures.length = 0;
  });

  it("il gesto composto resta la STESSA referenza dopo setIsTouching (path del bug)", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(FloatingWidget));
    });

    // Dopo mount + effetto async (AsyncStorage.getItem → setPositionLoaded), la
    // pallina è montata e il GestureDetector ha catturato il gesto composto.
    const before = lastExclusive();
    expect(before, "la pallina dovrebbe essere montata e aver registrato un gesto Exclusive").toBeTruthy();
    expect(before?._type).toBe("Exclusive");
    expect(before?.gestures).toHaveLength(2); // [panGesture, tapGesture]

    // Riproduce ESATTAMENTE il path del bug: il pan onStart chiama
    // runOnJS(setIsTouching)(true) → setState → re-render. Se i gesti sono
    // memoizzati (setIsTouching NON è dep dei useMemo) la referenza resta uguale.
    const panGesture = before?.gestures?.[0];
    expect(panGesture?._type).toBe("Pan");

    await act(async () => {
      panGesture?._cb.onStart?.();
    });

    const after = lastExclusive();
    expect(after).toBeTruthy();

    // Cuore del test: stessa referenza ⇒ gesti memoizzati. Inline (no useMemo)
    // ⇒ nuovo oggetto a ogni render ⇒ assert fallisce e il drag si romperebbe.
    expect(after).toBe(before);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("gesto composto e gesti figli (pan/tap) restano stabili su più re-render", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(FloatingWidget));
    });

    const first = lastExclusive();
    const firstPan = first?.gestures?.[0];
    const firstTap = first?.gestures?.[1];
    expect(firstPan?._type).toBe("Pan");
    expect(firstTap?._type).toBe("Tap");

    // onStart (setIsTouching true) poi onFinalize (setIsTouching false): due
    // re-render da setState, come durante un trascinamento reale.
    await act(async () => {
      firstPan?._cb.onStart?.();
    });
    await act(async () => {
      firstPan?._cb.onFinalize?.();
    });

    const last = lastExclusive();
    expect(last).toBe(first);
    expect(last?.gestures?.[0]).toBe(firstPan);
    expect(last?.gestures?.[1]).toBe(firstTap);

    await act(async () => {
      renderer.unmount();
    });
  });
});
