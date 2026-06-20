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

import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("react-native", () => ({
  StyleSheet: { create: (s: unknown) => s },
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  useWindowDimensions: () => ({ width: 400, height: 800 }),
  Modal: "Modal",
  Platform: { get OS() { return mocks.platformOS; } },
}));

// ── Mock: react-native-reanimated ─────────────────────────────────────────────
// Animated.View è il container esterno del pallino; useAnimatedStyle restituisce
// uno style con il transform translateX/translateY così i test (f1) lo vedono.
vi.mock("react-native-reanimated", () => ({
  default: { View: "AnimatedView" },
  useSharedValue: (v: unknown) => ({ value: v }),
  useAnimatedStyle: () => ({ transform: [{ translateX: 0 }, { translateY: 0 }] }),
  runOnJS: (fn: unknown) => fn,
}));

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
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({
  default: () => null,
}));

import FloatingWidget from "@/components/FloatingWidget";

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

// ── (e) aiOpen=true → pallino nascosto e non interattivo ─────────────────────
describe("FloatingWidget — pallino nascosto quando la chat AI è aperta", () => {
  beforeEach(() => {
    mocks.platformOS = "ios";
    mocks.user = { id: "1" };
    mocks.enabled = true;
    mocks.suppressed = false;
  });

  it("(e1) il pallino (AnimatedView) ha opacity 0 con aiOpen=true", () => {
    ctrl.forceAiOpen = true;
    const comp = mount();

    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      type: string;
      props: Record<string, unknown>;
    };

    expect(ball.type).toBe("AnimatedView");
    expect(flattenStyle(ball.props.style).opacity).toBe(0);
  });

  it("(e2) il pallino ha pointerEvents='none' con aiOpen=true", () => {
    ctrl.forceAiOpen = true;
    const comp = mount();

    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      props: Record<string, unknown>;
    };

    expect(ball.props.pointerEvents).toBe("none");
  });

  it("(e-baseline) con aiOpen=false il pallino è visibile e interattivo", () => {
    ctrl.forceAiOpen = false;
    const comp = mount();

    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      props: Record<string, unknown>;
    };

    expect(flattenStyle(ball.props.style).opacity).not.toBe(0);
    expect(ball.props.pointerEvents).not.toBe("none");
  });
});
