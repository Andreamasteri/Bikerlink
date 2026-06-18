/**
 * Regression guard — gesti RNGH del FAB AI MEMOIZZATI (stabili tra i render).
 *
 * Perché esiste:
 *   Il bug "stelline AI non trascinabili" nasceva da gesti RNGH creati inline,
 *   ricreati a ogni re-render: GestureDetector ri-registrava l'handler nativo
 *   (update asincrono) e i touch andavano persi. La correzione li avvolge in
 *   useMemo. Questo test MONTA davvero AssistantFab (React reale, NON mockato)
 *   e verifica che l'oggetto gesto composto passato a <GestureDetector> resti
 *   la STESSA referenza attraverso un re-render innescato da setState.
 *
 *   Se qualcuno rimuove gli useMemo e ricrea i gesti inline, ogni render
 *   produce un nuovo oggetto gesto → la referenza cambia → questo test FALLISCE.
 *
 * Differenza dagli altri test in questa cartella:
 *   AssistantFab.bottom.test.ts mocka `react` con useMemo no-op (testa solo
 *   funzioni pure). Qui usiamo React reale + react-test-renderer per esercitare
 *   davvero la memoizzazione degli hook attraverso più render.
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

  // Ogni render di <GestureDetector> spinge il suo prop `gesture` qui.
  const captures: Builder[] = [];

  // Cattura l'onClose passato ad AssistantChatSheet, così il test può forzare
  // setOpen(false) e garantire transizioni di stato reali (true→false→true).
  const chatSheet: { onClose: (() => void) | null } = { onClose: null };

  return { Gesture, captures, chatSheet };
});

// ── mock dipendenze native (NON mockiamo `react`: serve memoizzazione reale) ──
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { create: (s: unknown) => s },
  Dimensions: { addEventListener: () => ({ remove: vi.fn() }) },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light", Medium: "medium" } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) }));
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
    default: { View: (props: { children?: unknown }) => (props.children ?? null) as never },
  };
});
vi.mock("@/hooks/useColors", () => ({ useColors: () => ({ primary: "#000", text: "#FFF" }) }));
vi.mock("@/hooks/useAssistantEnabled", () => ({ useAssistantEnabled: () => ({ fabEnabled: true }) }));
vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({
  default: (props: { onClose?: () => void }) => {
    h.chatSheet.onClose = props.onClose ?? null;
    return null as never;
  },
}));

// ── import del componente sotto test (DOPO i mock) ────────────────────────────
import AssistantFab from "@/components/user/ai-assistant/AssistantFab";

type Builder = (typeof h.captures)[number];

function lastExclusive(): Builder | undefined {
  for (let i = h.captures.length - 1; i >= 0; i--) {
    if (h.captures[i]?._type === "Exclusive") return h.captures[i];
  }
  return undefined;
}

describe("AssistantFab — gesti RNGH memoizzati (stabilità tra re-render)", () => {
  beforeEach(() => {
    h.captures.length = 0;
  });

  it("il gesto composto resta la STESSA referenza dopo un re-render da setState", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(AssistantFab));
    });

    // Dopo il mount + effetti async (AsyncStorage.getItem → setPositionLoaded),
    // il FAB è montato e il GestureDetector ha catturato il gesto composto.
    const before = lastExclusive();
    expect(before, "il FAB dovrebbe essere montato e aver registrato un gesto Exclusive").toBeTruthy();
    expect(before?._type).toBe("Exclusive");
    expect(before?.gestures).toHaveLength(2); // [panGesture, tapGesture]

    // Innesca un re-render via setState reale: il tap onEnd(success=true) chiama
    // handleOpen → setOpen(true). `open` NON è dep dei useMemo dei gesti, quindi
    // se i gesti sono memoizzati la referenza resta identica.
    const tapGesture = before?.gestures?.[1];
    expect(tapGesture?._type).toBe("Tap");

    await act(async () => {
      tapGesture?._cb.onEnd?.({}, true);
    });

    const after = lastExclusive();
    expect(after).toBeTruthy();

    // Cuore del test: stessa referenza ⇒ gesti memoizzati. Se vengono ricreati
    // inline (useMemo rimosso), `after` è un nuovo oggetto ⇒ assert fallisce.
    expect(after).toBe(before);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("gesto composto e gesti figli (pan/tap) restano stabili su più re-render", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(AssistantFab));
    });

    const first = lastExclusive();
    const firstPan = first?.gestures?.[0];
    const firstTap = first?.gestures?.[1];
    expect(firstPan?._type).toBe("Pan");
    expect(firstTap?._type).toBe("Tap");

    // Tre transizioni di stato REALI (open: false→true→false→true), così sono
    // garantiti più re-render effettivi (un secondo setOpen(true) sarebbe un
    // no-op): tap apre, onClose chiude, tap riapre.
    await act(async () => {
      firstTap?._cb.onEnd?.({}, true); // setOpen(true)
    });
    expect(h.chatSheet.onClose, "AssistantChatSheet dovrebbe ricevere onClose").toBeTruthy();
    await act(async () => {
      h.chatSheet.onClose?.(); // setOpen(false)
    });
    await act(async () => {
      firstTap?._cb.onEnd?.({}, true); // setOpen(true)
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
