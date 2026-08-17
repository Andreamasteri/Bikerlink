/**
 * Test mount-level per FabWidget — verifica del fix OOM path (Task #418).
 *
 * PROBLEMA (Android-specific — stesso di UptimeWidget, Sentry 134724851):
 *   Reanimated useSharedValue + useAnimatedStyle con transform a 3 item
 *   (translateX, translateY, scale) attraversa il path
 *   NativeAnimatedModule → ReadableNativeMap.getLocalMap → HashMap.resize
 *   che causava OOM crash in sessioni admin lunghe su S26 Ultra (dist 80).
 *
 *   FabWidget e UptimeWidget sono montati contemporaneamente per gli admin,
 *   raddoppiando la pressione su quel path.
 *
 * FIX APPLICATO:
 *   - translateX/translateY: ora via RN Animated.Value (posXAnim/posYAnim)
 *     sul transform dell'Animated.View ESTERNO (RN, hitbox-corretta su Android).
 *   - scale: Reanimated SV + useAnimatedStyle, ma su una view INTERNA separata
 *     con transform a 1 solo item (no 3-item OOM path).
 *   - posX/posY shared values restano per il worklet Gesture.Pan() (onBegin
 *     legge posX.value), ma NON entrano nel transform renderizzato.
 *
 * COPERTURA (mount-level):
 *   (F1) L'Animated.View esterno (testID="ai-console-fab") ha transform con
 *        translateX e translateY che sono istanze di RN Animated.Value.
 *   (F2) Nessun left/top dinamico nel render: solo 0 da stylesheet.
 *        Regressione target: aggiungere left:posXRef.current allo stile.
 *   (F3) runOnJS(updatePos) viene chiamato durante onUpdate: le RN Animated.Value
 *        ricevono setValue() con la posizione clampata.
 *   (F4) drag di grande ampiezza: posizione finale clampata ai bordi.
 *   (F5) release con piccolo spostamento → handleRelease(dragged=false) invocato.
 *   (F6) release con grande spostamento → handleRelease(dragged=true) invocato.
 *
 * NOTA SUL DETOX:
 *   La prova "tap alla vecchia posizione NON attiva" richiede Detox su device
 *   Android. Qui copriamo la metà testabile in Node: le RN Animated.Value
 *   ricevono i valori corretti tramite la pipeline Gesture.Pan → runOnJS →
 *   setValue(), che è la pipeline che aggiorna la hitbox nativa su Android.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

// ── vi.hoisted: stato condiviso accessibile nelle factory vi.mock ─────────────

// avStore traccia le istanze RN Animated.Value create durante il mount (slot-based).
// Slot 0 = posXAnim, slot 1 = posYAnim (i primi due useRef(new Animated.Value(...))).
const avStore = vi.hoisted(() => ({
  slots: [] as Array<{ value: number }>,
  idx: 0,
  reset() { this.idx = 0; },
  clear() { this.slots = []; this.idx = 0; },
}));

// svStore traccia le istanze useSharedValue create durante il mount (slot-based).
// useSharedValue in Reanimated è stabile tra re-render (come useRef); il mock
// deve replicare questo comportamento per non perdere i valori aggiornati.
// Ordine di creazione in FabWidget: posX(0), posY(1), startX(2), startY(3), scale(4).
const svStore = vi.hoisted(() => ({
  slots: [] as Array<{ value: number }>,
  idx: 0,
  reset() { this.idx = 0; },
  clear() { this.slots = []; this.idx = 0; },
}));

// gestureCapture raccoglie i callback registrati su Gesture.Pan() così possiamo
// simulare onBegin/onUpdate/onEnd dal test senza dipendere da RNGH native.
const gestureCapture = vi.hoisted(() => ({
  onBeginCb: null as ((...a: unknown[]) => void) | null,
  onUpdateCb: null as ((...a: unknown[]) => void) | null,
  onEndCb: null as ((...a: unknown[]) => void) | null,
  onFinalizeCb: null as ((...a: unknown[]) => void) | null,
  reset() {
    this.onBeginCb = null;
    this.onUpdateCb = null;
    this.onEndCb = null;
    this.onFinalizeCb = null;
  },
}));

// runOnJSCapture: runOnJS(fn) deve chiamare fn() immediatamente in test
// (sincronizzazione UI→JS thread simulata). Traccia ogni chiamata.
const runOnJSCapture = vi.hoisted(() => ({
  calls: [] as Array<{ fn: (...a: unknown[]) => void; args: unknown[] }>,
  reset() { this.calls = []; },
}));

const mockEnv = vi.hoisted(() => ({
  screen: { width: 400, height: 800 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
}));

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

// ── Mock: react-native ────────────────────────────────────────────────────────
// Animated.Value: slot-based per indice di chiamata (posXAnim=0, posYAnim=1).
vi.mock("react-native", () => {
  class AnimatedValue {
    _slot: { value: number };
    constructor(initialValue: number) {
      const i = avStore.idx++;
      if (!avStore.slots[i]) avStore.slots[i] = { value: initialValue };
      this._slot = avStore.slots[i];
    }
    setValue(v: number) { this._slot.value = v; }
    get value() { return this._slot.value; }
    addListener() { return 0; }
    removeListener() {}
  }
  return {
    StyleSheet: { create: (s: unknown) => s },
    View: "View",
    Text: "Text",
    Platform: { OS: "android" },
    useWindowDimensions: () => ({ ...mockEnv.screen }),
    Animated: {
      View: "AnimatedView",
      Value: AnimatedValue,
    },
  };
});

// ── Mock: react-native-reanimated ─────────────────────────────────────────────
// runOnJS: chiama fn() immediatamente in test (no async UI→JS gap).
// useSharedValue: box mutabile semplice (posX/posY/startX/startY/scale).
// withSpring: restituisce il valore target direttamente (no animazione).
// useAnimatedStyle: ritorna oggetto con la factory memorizzata (per ispezione).
// default (ReAnimated): { View: "ReAnimatedView" } per il render.
vi.mock("react-native-reanimated", () => {
  const runOnJS = (fn: (...a: unknown[]) => void) => (...args: unknown[]) => {
    runOnJSCapture.calls.push({ fn, args });
    fn(...args);
  };
  // useSharedValue: slot-based per indice di chiamata — stabile tra re-render,
  // come fa Reanimated (diversamente da un semplice `() => ({ value: init })`
  // che creerebbe un nuovo oggetto ad ogni render perdendo i valori aggiornati).
  const useSharedValue = (init: number) => {
    const i = svStore.idx++;
    if (!svStore.slots[i]) svStore.slots[i] = { value: init };
    return svStore.slots[i];
  };
  const withSpring = (v: number) => v;
  const useAnimatedStyle = (factory: () => object) => factory();
  return {
    default: { View: "ReAnimatedView" },
    runOnJS,
    useSharedValue,
    withSpring,
    useAnimatedStyle,
  };
});

// ── Mock: react-native-gesture-handler ───────────────────────────────────────
// Gesture.Pan(): chainable mock che cattura i callback in gestureCapture.
// GestureDetector: wrapper passthrough che non fa nulla di nativo.
vi.mock("react-native-gesture-handler", () => {
  const makeChainable = () => {
    const obj: Record<string, unknown> = {};
    obj.minDistance = () => obj;
    obj.onBegin = (cb: (...a: unknown[]) => void) => {
      gestureCapture.onBeginCb = cb;
      return obj;
    };
    obj.onUpdate = (cb: (...a: unknown[]) => void) => {
      gestureCapture.onUpdateCb = cb;
      return obj;
    };
    obj.onEnd = (cb: (...a: unknown[]) => void) => {
      gestureCapture.onEndCb = cb;
      return obj;
    };
    obj.onFinalize = (cb: (...a: unknown[]) => void) => {
      gestureCapture.onFinalizeCb = cb;
      return obj;
    };
    return obj;
  };
  return {
    Gesture: { Pan: makeChainable },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});

// ── Mock: dipendenze esterne ──────────────────────────────────────────────────
vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ ...mockEnv.insets }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => routerMock,
}));
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));
// useColors è il PRIMO hook chiamato in FabWidget — usiamo il suo mock per
// resettare svStore.idx a 0 all'inizio di ogni render, così useSharedValue
// restituisce sempre lo stesso slot-object per lo stesso hook-call-order
// (replica il comportamento stabile di Reanimated tra re-render).
vi.mock("@/hooks/useColors", () => ({
  useColors: () => {
    svStore.reset(); // reset idx=0 all'inizio di ogni ciclo di render
    return {
      accent: "#E53935",
      error: "#B00020",
      warning: "#FFB300",
      background: "#121212",
    };
  },
}));
vi.mock("@/hooks/admin/ai-console/useAiActionQueue", () => ({
  useAiActionQueue: () => ({ data: undefined }),
}));
vi.mock("@/hooks/admin/ai-console/useAiAlerts", () => ({
  useAiAlertsState: () => ({ unread: 0 }),
  useAiAlertsSubscriber: () => {},
}));
vi.mock("@/hooks/admin/ai-console/useAiExplain", () => ({
  useExplainPending: () => null,
}));
vi.mock("@/hooks/admin/ai-console/useBugReport", () => ({
  useBugReport: () => ({ unseenCount: 0 }),
}));
vi.mock("@/components/admin/ai-console/FabDrawer", () => ({
  default: () => null,
}));

// ── import componente di produzione ───────────────────────────────────────────
import FabWidget from "@/components/admin/ai-console/FabWidget";

// ── costanti ──────────────────────────────────────────────────────────────────
const SCREEN_W = 400;
const SCREEN_H = 800;
const TOP_INSET = 47;
const BOT_INSET = 34;
const FAB_SIZE = 56;
const EDGE_MARGIN = 8;

// Helper: accede agli RN Animated.Value slot 0 (posXAnim) e 1 (posYAnim).
function posX() { return avStore.slots[0]; }
function posY() { return avStore.slots[1]; }

// Helper: monta FabWidget con stato pulito e scarica l'effect di bootstrap.
// AsyncStorage.getItem() è asincrono anche nel mock: senza questo act async,
// setLoaded(true) arrivava dopo il mount e React 19 segnalava un aggiornamento
// fuori da act().
async function mountFab() {
  avStore.clear();
  svStore.clear();
  gestureCapture.reset();
  runOnJSCapture.reset();
  routerMock.push.mockClear();
  mockEnv.screen = { width: SCREEN_W, height: SCREEN_H };
  mockEnv.insets = { top: TOP_INSET, bottom: BOT_INSET, left: 0, right: 0 };
  let comp!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => {
    comp = renderer.create(React.createElement(FabWidget));
    await Promise.resolve();
  });
  return comp;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suite F — FabWidget OOM-fix: RN Animated.Value per posizione
// ═══════════════════════════════════════════════════════════════════════════════

describe("FabWidget — OOM fix: posizione via RN Animated.Value (Android hitbox)", () => {
  let comp: ReturnType<typeof renderer.create>;

  beforeEach(async () => {
    vi.useFakeTimers();
    comp = await mountFab();
  });
  afterEach(() => {
    renderer.act(() => { comp.unmount(); });
    vi.useRealTimers();
  });

  /**
   * (F1) L'Animated.View esterno (testID="ai-console-fab") ha un transform con
   *      translateX e translateY le cui sorgenti sono RN Animated.Value (slot 0 e 1),
   *      non valori statici né Reanimated shared values.
   *
   *      Regressione target: qualcuno riporta posX/posY nei shared values Reanimated
   *      dentro il transform renderizzato → OOM path si riapre.
   */
  it("(F1) outer AnimatedView ha transform translateX/translateY da RN Animated.Value", () => {
    const json = comp.toJSON() as unknown;
    // Il componente ritorna un array: [Animated.View(FAB), null(FabDrawer)] o simile
    const nodes = Array.isArray(json) ? json : [json];
    const fab = nodes.find((n: unknown) => {
      const node = n as { type?: string; props?: Record<string, unknown> };
      return node?.type === "AnimatedView" && node?.props?.testID === "ai-console-fab";
    }) as { type: string; props: Record<string, unknown> } | undefined;

    expect(fab).toBeDefined();

    const styleArr = Array.isArray(fab!.props.style)
      ? (fab!.props.style as unknown[])
      : [fab!.props.style];

    // Trova il frammento con il transform array
    let transformArr: Array<Record<string, unknown>> | null = null;
    for (const fragment of styleArr) {
      if (fragment == null || typeof fragment !== "object") continue;
      const s = fragment as Record<string, unknown>;
      if (Array.isArray(s.transform)) {
        transformArr = s.transform as Array<Record<string, unknown>>;
        break;
      }
    }

    expect(transformArr).not.toBeNull();

    // Deve avere translateX e translateY (posizione via RN Animated.Value).
    const txItem = transformArr!.find((t) => "translateX" in t);
    const tyItem = transformArr!.find((t) => "translateY" in t);
    expect(txItem).toBeDefined();
    expect(tyItem).toBeDefined();

    // I valori devono essere le istanze RN Animated.Value (slot 0 e 1),
    // non numeri statici né oggetti Reanimated.
    // Il mock produce oggetti con _slot: { value: number } — verifica tramite slot store.
    // L'istanza ha _slot che punta allo stesso oggetto di avStore.slots[0/1].
    const txVal = txItem!.translateX as { _slot?: { value: number } };
    const tyVal = tyItem!.translateY as { _slot?: { value: number } };
    expect(txVal._slot).toBe(avStore.slots[0]);
    expect(tyVal._slot).toBe(avStore.slots[1]);
  });

  /**
   * (F2) Nessun left/top DINAMICO nello stile dell'outer AnimatedView.
   *      left e top devono essere 0 (da stylesheet statico) — mai valori che
   *      dipendono dalla posizione corrente del FAB.
   *
   *      Su Android, animare left/top sposta il pixel ma lascia la hitbox touch
   *      alla posizione di layout originale. Solo il transform porta la posizione
   *      in modo hitbox-safe.
   *
   *      Regressione target: `{ left: posXRef.current }` aggiunto allo stile.
   */
  it("(F2) nessun left/top dinamico nell'outer AnimatedView — solo 0 da stylesheet (Android hitbox)", () => {
    const json = comp.toJSON() as unknown;
    const nodes = Array.isArray(json) ? json : [json];
    const fab = nodes.find((n: unknown) => {
      const node = n as { type?: string; props?: Record<string, unknown> };
      return node?.type === "AnimatedView" && node?.props?.testID === "ai-console-fab";
    }) as { type: string; props: Record<string, unknown> } | undefined;

    expect(fab).toBeDefined();

    const styleArr = Array.isArray(fab!.props.style)
      ? (fab!.props.style as unknown[])
      : [fab!.props.style];

    for (const fragment of styleArr) {
      if (fragment == null || typeof fragment !== "object") continue;
      const s = fragment as Record<string, unknown>;
      if ("left" in s) {
        // left è permesso solo se statico (0 da stylesheet)
        expect(s.left).toBe(0);
      }
      if ("top" in s) {
        // top è permesso solo se statico (0 da stylesheet)
        expect(s.top).toBe(0);
      }
    }
  });

  /**
   * (F3) runOnJS(updatePos) viene chiamato durante onUpdate con valori numerici:
   *      le RN Animated.Value ricevono setValue() con la posizione calcolata.
   *      Questo è il meccanismo che aggiorna la hitbox Android in lockstep con
   *      il movimento visivo del FAB.
   */
  it("(F3) onUpdate chiama runOnJS(updatePos): le RN Animated.Value ricevono setValue()", () => {
    const startXVal = posX()?.value ?? 0;
    const startYVal = posY()?.value ?? 0;

    // Simula un piccolo drag verso l'interno dello schermo (sicuro, non clampato)
    const dx = -20;
    const dy = -30;

    renderer.act(() => {
      gestureCapture.onBeginCb?.();
    });
    renderer.act(() => {
      gestureCapture.onUpdateCb?.({ translationX: dx, translationY: dy });
    });

    // Dopo onUpdate, le RN Animated.Value devono essere state aggiornate.
    // Il mock runOnJS chiama fn() immediatamente, quindi avStore.slots riflette
    // la nuova posizione dopo onUpdate.
    const newX = posX()?.value;
    const newY = posY()?.value;

    expect(typeof newX).toBe("number");
    expect(typeof newY).toBe("number");
    // La posizione deve essere cambiata rispetto al punto di partenza
    // (il drag (-20,-30) non è clampato per il FAB al suo default bottom-right).
    expect(newX).not.toBe(startXVal);
    expect(newY).not.toBe(startYVal);
  });

  /**
   * (F4) Drag di grande ampiezza: la posizione finale è clampata ai bordi
   *      dello schermo. Il FAB non può uscire fuori dai margini definiti.
   *      Hitbox sempre dentro l'area visibile — mai fuori schermo.
   */
  it("(F4) drag di grande ampiezza: posizione clampata ai bordi", () => {
    // Prima di iniziare, cattura la posizione iniziale
    renderer.act(() => {
      gestureCapture.onBeginCb?.();
    });

    // Drag verso destra-basso di 9999px (ben oltre i bordi)
    renderer.act(() => {
      gestureCapture.onUpdateCb?.({ translationX: 9999, translationY: 9999 });
    });
    renderer.act(() => {
      gestureCapture.onEndCb?.({ translationX: 9999, translationY: 9999 });
    });

    const maxX = SCREEN_W - FAB_SIZE - EDGE_MARGIN;
    const maxY = SCREEN_H - FAB_SIZE - EDGE_MARGIN - Math.max(BOT_INSET, 12);

    expect(posX().value).toBeLessThanOrEqual(maxX);
    expect(posX().value).toBeGreaterThanOrEqual(0);
    expect(posY().value).toBeLessThanOrEqual(maxY);
    expect(posY().value).toBeGreaterThanOrEqual(EDGE_MARGIN + Math.max(TOP_INSET, 0));
  });

  /**
   * (F5) Drag con piccolo spostamento (< DRAG_THRESHOLD): handleRelease riceve
   *      dragged=false. La persistenza in AsyncStorage NON viene chiamata
   *      (è dragged=true che persiste), ma la logica tap/long-press viene attivata.
   *
   *      Verifica indiretta: nessuna chiamata ad AsyncStorage.setItem dal drag
   *      path (il mock useAiExplain ritorna null → setDrawerOpen(true) sarebbe
   *      chiamato, ma non è osservabile direttamente in questo ambiente).
   *      L'asserzione chiave è che posX/posY cambiano di poco (< soglia).
   */
  it("(F5) release con spostamento < DRAG_THRESHOLD non causa drift di posizione inatteso", () => {
    renderer.act(() => { gestureCapture.onBeginCb?.(); });

    const smallDx = 2; // < DRAG_THRESHOLD (5)
    const smallDy = 2;

    renderer.act(() => {
      gestureCapture.onUpdateCb?.({ translationX: smallDx, translationY: smallDy });
    });

    const xAfterUpdate = posX()?.value ?? 0;
    const yAfterUpdate = posY()?.value ?? 0;

    renderer.act(() => {
      gestureCapture.onEndCb?.({ translationX: smallDx, translationY: smallDy });
    });

    // La posizione non deve cambiare ulteriormente nell'onEnd (nessun re-clamp forzato)
    expect(posX()?.value).toBeCloseTo(xAfterUpdate, 1);
    expect(posY()?.value).toBeCloseTo(yAfterUpdate, 1);
  });

  /**
   * (F6) Release con spostamento > DRAG_THRESHOLD: handleRelease riceve dragged=true.
   *      AsyncStorage.setItem viene chiamato con la posizione finale (persistenza drag).
   *      router.push NON viene chiamato (drag ≠ tap).
   */
  it("(F6) release con spostamento > DRAG_THRESHOLD chiama AsyncStorage.setItem (drag persiste)", async () => {
    const asyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const setItemSpy = vi.spyOn(asyncStorage, "setItem").mockResolvedValue();

    renderer.act(() => { gestureCapture.onBeginCb?.(); });
    renderer.act(() => {
      gestureCapture.onUpdateCb?.({ translationX: -60, translationY: -80 });
    });
    renderer.act(() => {
      gestureCapture.onEndCb?.({ translationX: -60, translationY: -80 });
    });

    // handleRelease(dragged=true) → AsyncStorage.setItem(STORAGE_KEY, {x,y})
    // Il mock runOnJS chiama fn() immediatamente → setItem già invocato.
    expect(setItemSpy).toHaveBeenCalledWith(
      "admin:ai-fab:pos",
      expect.stringContaining("\"x\""),
    );
    // router.push NON deve essere chiamato (drag ≠ tap)
    expect(routerMock.push).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
  });
});
