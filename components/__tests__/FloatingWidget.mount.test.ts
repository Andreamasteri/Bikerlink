/**
 * Test di mount-level per FloatingWidget.
 *
 * Componente sotto test: components/FloatingWidget.tsx
 *   — il pallino flottante PanResponder/Animated che si sovrappone a tutti gli
 *     schermi e al tap apre il menu di navigazione / l'assistente AI.
 *
 * Strategia:
 *   Monta il componente tramite react-test-renderer (React reale, dipendenze
 *   native mockate) e verifica le guard di rendering COMPONENT-LEVEL che i test
 *   di logica pura (FloatingWidget.logic.test.ts) non coprono:
 *
 *   (a) Null-render su Platform.OS="web".
 *   (b) Null-render senza utente autenticato (user=null).
 *   (c) Null-render quando suppressed=true (es. giochi arcade).
 *   (d) Null-render quando enabled=false.
 *   (e) Il pallino (AnimatedView) ha opacity 0 + pointerEvents="none" quando
 *       aiOpen=true (chat AI aperta), così non intercetta i tap dell'utente.
 *
 * Per il test (e): flushare lo stato via act() non funziona nell'env node senza
 * jsdom. Si usa vi.mock("react") per controllare il valore iniziale restituito
 * dal secondo useState (aiOpen). La factory chiama sempre actual.useState(init)
 * — il fiber React è correttamente popolato — e sovrascrive solo il valore di
 * ritorno quando ctrl.forceAiOpen=true e lo slot è il 2° (aiOpen).
 * react-test-renderer riceve React via spread di importOriginal: tutte le API
 * originali funzionano, solo useState è wrappata.
 *
 * Regressione target:
 *   - Rimuovere il guard Platform.OS==="web" → pallino visibile su web preview.
 *   - Rimuovere il guard !user → pallino attivo senza login.
 *   - Rimuovere il guard suppressed → pallino attivo sui giochi arcade.
 *   - Cambiare aiOpen && styles.widgetHidden → opacity 1 con chat aperta.
 *   - Rimuovere pointerEvents={aiOpen ? "none" : "auto"} → intercetta tap AI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

// ── Stato condiviso: accessibile nelle factory vi.mock (hoistate) ─────────────
const ctrl = vi.hoisted(() => ({
  // Se true, il 2° useState (aiOpen) ritorna true al primo render
  forceAiOpen: false,
  // Contatore chiamate useState; azzerato prima di ogni mount
  callIdx: 0,
}));

const mocks = vi.hoisted(() => ({
  platformOS: "ios" as string,
  user: { id: "1" } as Record<string, string> | null,
  enabled: true,
  suppressed: false,
  screenW: 400,
  screenH: 800,
}));

// ── Mock: react — wrappa useState per controllare aiOpen senza act() ──────────
//
// La factory chiama sempre actual.useState(init) per registrare correttamente lo
// slot nel fiber React; solo il valore di ritorno è sovrascritto per il 2° hook
// (aiOpen) quando ctrl.forceAiOpen=true.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  function wrappedUseState<S>(
    init: S | (() => S),
  ): [S, import("react").Dispatch<import("react").SetStateAction<S>>] {
    ctrl.callIdx++;
    const [val, setter] = (actual.useState as typeof React.useState)(init);
    if (ctrl.forceAiOpen && ctrl.callIdx === 2) {
      return [true as unknown as S, setter];
    }
    return [val, setter];
  }

  const mod = { ...actual, useState: wrappedUseState };
  return { ...mod, default: mod };
});

// ── Mock: react-native ────────────────────────────────────────────────────────
// Animated.View = "AnimatedView" così i test (f1/e1/e2) trovano il container
// come AnimatedView nel tree. Animated.Value è la classe minima necessaria a
// far girare `new Animated.Value(x)` senza il native driver.
vi.mock("react-native", () => {
  class AnimatedValue {
    _v: number;
    constructor(v: number) { this._v = v; }
    setValue(v: number) { this._v = v; }
    addListener() { return 0; }
    removeListener(_id: number) {}
  }
  return {
    StyleSheet: { create: (s: unknown) => s },
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    useWindowDimensions: () => ({ width: mocks.screenW, height: mocks.screenH }),
    Modal: "Modal",
    Platform: { get OS() { return mocks.platformOS; } },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Animated: {
      View: "AnimatedView",
      Value: AnimatedValue,
    },
  };
});

// ── Mock: react-native-gesture-handler ────────────────────────────────────────
// GestureDetector è un passthrough che rende i suoi figli; Gesture.Pan() è una
// catena fluente no-op (i worklet non vengono eseguiti in fase di mount).
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => {
      const g: Record<string, () => unknown> = {};
      g.minDistance = () => g;
      g.onStart = () => g;
      g.onUpdate = () => g;
      g.onEnd = () => g;
      g.onBegin = () => g;
      g.onFinalize = () => g;
      return g;
    },
  },
  GestureDetector: ({ children }: { children: unknown }) => children,
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
  },
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/constants/colors", () => ({
  default: {
    accent: "#E53935",
    textSecondary: "#888",
    surface: "#1a1a1a",
    border: "#333",
    text: "#fff",
  },
}));

vi.mock("@/lib/floating-widget-context", () => ({
  useFloatingWidget: () => ({
    enabled: mocks.enabled,
    suppressed: mocks.suppressed,
  }),
}));

vi.mock("@/hooks/useAssistantEnabled", () => ({
  useAssistantEnabled: () => ({ fabEnabled: true }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mocks.user, healthState: "READY", healthReason: "" }),
}));

vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({
  default: () => null,
}));

import FloatingWidget, { clampPos, WIDGET_SIZE } from "@/components/FloatingWidget";

// ── Helper: unisce uno style array in un oggetto piatto ───────────────────────
function flattenStyle(style: unknown): Record<string, unknown> {
  const arr = Array.isArray(style) ? style : [style];
  return Object.assign(
    {},
    ...(arr as unknown[]).filter((s) => s && typeof s === "object"),
  ) as Record<string, unknown>;
}

// ── Helper: monta il componente (resetta callIdx prima del render) ────────────
function mount(): ReturnType<typeof renderer.create> {
  ctrl.callIdx = 0;
  let comp!: ReturnType<typeof renderer.create>;
  renderer.act(() => {
    comp = renderer.create(React.createElement(FloatingWidget));
  });
  return comp;
}

// ── (a-d) Null-render guards ──────────────────────────────────────────────────
describe("FloatingWidget — null-render guards", () => {
  beforeEach(() => {
    mocks.platformOS = "ios";
    mocks.user = { id: "1" };
    mocks.enabled = true;
    mocks.suppressed = false;
    ctrl.forceAiOpen = false;
  });

  it("(a) null su Platform.OS='web' — no PanResponder su web preview", () => {
    mocks.platformOS = "web";
    expect(mount().toJSON()).toBeNull();
  });

  it("(b) null se user=null — utente non autenticato", () => {
    mocks.user = null;
    expect(mount().toJSON()).toBeNull();
  });

  it("(c) null se suppressed=true — schermata di esclusione (es. arcade)", () => {
    mocks.suppressed = true;
    expect(mount().toJSON()).toBeNull();
  });

  it("(d) null se enabled=false — widget disabilitato da contesto", () => {
    mocks.enabled = false;
    expect(mount().toJSON()).toBeNull();
  });

  it("(baseline) NON null con tutti i valori validi — smoke test", () => {
    expect(mount().toJSON()).not.toBeNull();
  });
});

// ── (f) Posizionamento via transform — guard regressione Android hitbox ───────
//
// Su Android, animare `left`/`top` sposta il pixel ma lascia l'hitbox del touch
// nella posizione di layout originale ("si vede ma non si tocca"). Il fix usa
// `transform: [{translateX},{translateY}]` + `left:0/top:0` fissi nel foglio di
// stile + `elevation` sul container. Questo test fallisce se qualcuno ripristina
// il posizionamento via `left`/`top` dinamici nel componente.
describe("FloatingWidget — posizionamento Android-safe (transform, no left/top dinamici)", () => {
  beforeEach(() => {
    mocks.platformOS = "android";
    mocks.user = { id: "1" };
    mocks.enabled = true;
    mocks.suppressed = false;
    ctrl.forceAiOpen = false;
  });

  it("(f1) lo stile del pallino contiene transform con translateX e translateY", () => {
    const comp = mount();
    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      type: string;
      props: Record<string, unknown>;
    };

    expect(ball.type).toBe("AnimatedView");

    const style = flattenStyle(ball.props.style);
    const transform = style.transform as Array<Record<string, unknown>> | undefined;

    // Deve esistere un array transform
    expect(Array.isArray(transform)).toBe(true);

    // Deve contenere un oggetto con translateX
    const hasTranslateX = (transform ?? []).some(
      (entry) => "translateX" in entry,
    );
    expect(hasTranslateX).toBe(true);

    // Deve contenere un oggetto con translateY
    const hasTranslateY = (transform ?? []).some(
      (entry) => "translateY" in entry,
    );
    expect(hasTranslateY).toBe(true);
  });

  it("(f2) lo stile del pallino NON usa left/top dinamici — left e top sono 0 fissi nel foglio di stile", () => {
    const comp = mount();
    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      type: string;
      props: Record<string, unknown>;
    };

    expect(ball.type).toBe("AnimatedView");

    // Gli stili inline (secondo elemento dell'array se presente) non devono
    // portare left/top: devono essere assenti o rimanere undefined nell'oggetto
    // inline, così la posizione visiva è controllata solo da transform.
    const styleArray = Array.isArray(ball.props.style)
      ? (ball.props.style as unknown[])
      : [ball.props.style];

    // Il secondo elemento è l'oggetto inline; se non c'è, nessun left/top dinamico.
    const inlineStyle =
      styleArray.length > 1 &&
      styleArray[1] != null &&
      typeof styleArray[1] === "object"
        ? (styleArray[1] as Record<string, unknown>)
        : {};

    // Nell'oggetto inline non devono comparire left né top
    expect("left" in inlineStyle).toBe(false);
    expect("top" in inlineStyle).toBe(false);
  });

  it("(f3) il container esterno ha elevation ≥ 1 — garantisce priorità touch su Android", () => {
    const comp = mount();
    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      type: string;
      props: Record<string, unknown>;
    };

    expect(ball.type).toBe("AnimatedView");

    const style = flattenStyle(ball.props.style);
    const elevation = style.elevation as number | undefined;

    expect(typeof elevation).toBe("number");
    expect((elevation ?? 0) >= 1).toBe(true);
  });
});

// ── (e) pallino sempre visibile e interattivo ────────────────────────────────
// aiOpen è stato rimosso dal componente (task #5213: Bowie spostato nel tab
// Community). Il FloatingWidget non ha più uno stato "nascosto per chat aperta":
// il pallino è sempre visibile e interattivo quando il widget è abilitato.
describe("FloatingWidget — pallino sempre visibile e interattivo", () => {
  beforeEach(() => {
    mocks.platformOS = "ios";
    mocks.user = { id: "1" };
    mocks.enabled = true;
    mocks.suppressed = false;
    ctrl.forceAiOpen = false;
  });

  it("(e1) il pallino (AnimatedView) non ha opacity 0 a stato iniziale", () => {
    const comp = mount();

    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      type: string;
      props: Record<string, unknown>;
    };

    expect(ball.type).toBe("AnimatedView");
    expect(flattenStyle(ball.props.style).opacity).not.toBe(0);
  });

  it("(e2) il pallino non ha pointerEvents='none' a stato iniziale", () => {
    const comp = mount();

    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      props: Record<string, unknown>;
    };

    expect(ball.props.pointerEvents).not.toBe("none");
  });

  it("(e-baseline) il pallino è montato e non null con valori validi", () => {
    const comp = mount();
    expect(comp.toJSON()).not.toBeNull();
  });
});

// ── (g) Schermo stretto 320px — clamping nei bordi ───────────────────────────
//
// Dispositivi narrow (es. iPhone SE 320pt, alcuni Android entry-level) hanno
// una larghezza inferiore ai 400px su cui girano i test baseline. Una regressione
// nella logica di clamp potrebbe posizionare il pallino fuori schermo o causare
// un crash al mount — entrambi i casi invisibili ai test (a-f) esistenti.
//
// Questi test coprono:
//   (g1) Il componente monta correttamente (non null) su schermo 320×568.
//   (g2) clampPos porta in bounds una x che andrebbe fuori dal bordo destro su
//        uno schermo da 320px (p.es. x=350 — valido su 400px, out-of-bounds su 320).
//   (g3) La posizione default calcolata dal componente (width-WIDGET_SIZE-20)
//        su 320px è già in bounds e clampPos la lascia invariata.
describe("FloatingWidget — schermo stretto 320px — clamping nei bordi", () => {
  beforeEach(() => {
    mocks.platformOS = "ios";
    mocks.user = { id: "1" };
    mocks.enabled = true;
    mocks.suppressed = false;
    ctrl.forceAiOpen = false;
    mocks.screenW = 320;
    mocks.screenH = 568;
  });

  afterEach(() => {
    mocks.screenW = 400;
    mocks.screenH = 800;
  });

  it("(g1) il widget monta senza crash su schermo 320×568 — non null", () => {
    expect(mount().toJSON()).not.toBeNull();
  });

  it("(g2) clampPos mantiene x nel range [0, screenW-WIDGET_SIZE] su schermo 320px", () => {
    // x=350 è valido su schermo 400px ma supera il bordo destro su 320px
    const maxX = 320 - WIDGET_SIZE;
    const { x } = clampPos(350, 200, 320, 568, 8, 8);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(maxX);
  });

  it("(g3) la posizione default (width-WIDGET_SIZE-20) è già in bounds su 320px e non viene clamped", () => {
    // Replica il calcolo di defaultX usato dal componente
    const defaultX = 320 - WIDGET_SIZE - 20; // = 260
    const { x } = clampPos(defaultX, 200, 320, 568, 8, 8);
    // Deve uscire invariata: 260 è già dentro [0, 280]
    expect(x).toBe(defaultX);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(320 - WIDGET_SIZE);
  });
});
