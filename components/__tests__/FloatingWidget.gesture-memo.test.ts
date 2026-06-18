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
// useRouter DEVE restituire una referenza STABILE (come il vero expo-router):
// è dep dei useCallback handler (handleChatPress/...), a loro volta dep dei
// useMemo dei gesti del menu. Un `() => ({ push })` nuovo a ogni render
// invaliderebbe quei gesti per costruzione, mascherando la memoizzazione reale.
const stableRouter = { push: vi.fn() };
vi.mock("expo-router", () => ({ useRouter: () => stableRouter, usePathname: () => "/" }));
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

// Snapshot dei gesti del MENU dai captures correnti. Quando il menu è aperto i
// GestureDetector di primo livello vengono spinti in quest'ordine fisso:
//   backdrop(Tap) → menuPan(Pan) → chat(Tap) → notifiche(Tap) → player(Tap) → composed(Exclusive)
// I gesti figli della pallina (panGesture/tapGesture) NON finiscono in captures:
// stanno dentro composed.gestures, non vengono passati a un GestureDetector
// proprio. Quindi gli unici Tap/Pan di primo livello sono quelli del menu.
// IMPORTANTE: chiamare solo dopo aver svuotato h.captures, così i filtri vedono
// esattamente un render (altrimenti i Tap si accumulano e l'ordine si rompe).
function menuSnapshot() {
  const taps = h.captures.filter((c) => c?._type === "Tap");
  const pans = h.captures.filter((c) => c?._type === "Pan");
  return {
    backdrop: taps[0],
    chat: taps[1],
    notifications: taps[2],
    player: taps[3],
    menuPan: pans[0],
    composed: lastExclusive(),
  };
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

  // Apre il menu della pallina simulando il tap reale: il tapGesture della
  // pallina (Exclusive.gestures[1]) chiama onEnd(success=true) → runOnJS(handleTapJS)
  // → openMenu() → setMenuOpen(true). Ritorna il gesto Pan della pallina (per
  // innescare i re-render successivi via setIsTouching senza riaprire/chiudere il menu).
  async function openMenu(): Promise<Builder | undefined> {
    const composed = lastExclusive();
    const ballTap = composed?.gestures?.[1];
    expect(ballTap?._type).toBe("Tap");
    await act(async () => {
      ballTap?._cb.onEnd?.({}, true);
    });
    const ballPan = lastExclusive()?.gestures?.[0];
    expect(ballPan?._type).toBe("Pan");
    return ballPan;
  }

  it("i gesti del menu aperto (chat/notifiche/player/backdrop/menuPan) restano la STESSA referenza dopo setIsTouching", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(FloatingWidget));
    });

    const ballPan = await openMenu();

    // Snapshot dei gesti del menu dopo l'apertura. Svuoto prima i captures e
    // forzo un re-render (setIsTouching false→true) così menuSnapshot vede
    // esattamente un render pulito con tutti i GestureDetector del menu.
    h.captures.length = 0;
    await act(async () => {
      ballPan?._cb.onStart?.();
    });
    const before = menuSnapshot();

    expect(before.backdrop?._type, "il backdrop dovrebbe essere un Tap").toBe("Tap");
    expect(before.menuPan?._type, "il menuPan dovrebbe essere un Pan").toBe("Pan");
    expect(before.chat?._type).toBe("Tap");
    expect(before.notifications?._type).toBe("Tap");
    expect(before.player?._type).toBe("Tap");
    expect(before.composed?._type).toBe("Exclusive");

    // Re-render innescato da setState (setIsTouching true→false), menu ancora aperto.
    h.captures.length = 0;
    await act(async () => {
      ballPan?._cb.onFinalize?.();
    });
    const after = menuSnapshot();

    // Cuore del test: ogni gesto del menu deve restare la STESSA referenza.
    // Se uno torna inline (useMemo rimosso) il re-render lo ricrea ⇒ ref diversa
    // ⇒ RNGH ri-registra l'handler nativo e il pulsante smette di rispondere.
    expect(after.chat, "chatTapGesture de-memoizzato").toBe(before.chat);
    expect(after.notifications, "notificationsTapGesture de-memoizzato").toBe(before.notifications);
    expect(after.player, "playerTapGesture de-memoizzato").toBe(before.player);
    expect(after.backdrop, "backdropTapGesture de-memoizzato").toBe(before.backdrop);
    expect(after.menuPan, "menuPanGesture de-memoizzato").toBe(before.menuPan);
    expect(after.composed, "composedGesture de-memoizzato").toBe(before.composed);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("i gesti del menu restano stabili su più re-render consecutivi", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(FloatingWidget));
    });

    const ballPan = await openMenu();

    h.captures.length = 0;
    await act(async () => {
      ballPan?._cb.onStart?.();
    });
    const first = menuSnapshot();

    // Tre re-render consecutivi da setState: le referenze non devono mai cambiare.
    for (let i = 0; i < 3; i++) {
      h.captures.length = 0;
      await act(async () => {
        ballPan?._cb.onFinalize?.();
      });
      await act(async () => {
        ballPan?._cb.onStart?.();
      });
      const snap = menuSnapshot();
      expect(snap.chat).toBe(first.chat);
      expect(snap.notifications).toBe(first.notifications);
      expect(snap.player).toBe(first.player);
      expect(snap.backdrop).toBe(first.backdrop);
      expect(snap.menuPan).toBe(first.menuPan);
    }

    await act(async () => {
      renderer.unmount();
    });
  });
});
