/**
 * Test drag + hitbox per FloatingWidget su Android.
 *
 * PROBLEMA (Android-specific):
 *   Su Android, animare la posizione via `left`/`top` sposta il pixel sullo
 *   schermo ma lascia l'area di tocco (hitbox) alla posizione di layout
 *   originale. L'utente vede il widget in una posizione nuova ma tocca dove
 *   il widget ERA. Con `transform: [{translateX}, {translateY}]` l'hitbox
 *   segue il widget perché Android applica la trasformazione anche al sistema
 *   di coordinate degli eventi touch.
 *
 *   Questo è il motivo per cui FloatingWidget usa esclusivamente transform per
 *   il posizionamento dinamico (FloatingWidget.tsx riga ~197-203):
 *     "Posizionamento via transform (translateX/translateY) invece di left/top:
 *      su Android animare left/top sposta il pixel ma lascia l'hitbox del touch
 *      alla posizione di layout originale. Con il transform l'area di tocco
 *      segue la posizione visiva."
 *
 * NOTA SU DETOX / NEGAZIONE COORDINATE ORIGINALE:
 *   La prova definitiva "il tap alla VECCHIA posizione NON attiva il widget"
 *   richiederebbe un test Detox su un binario nativo Android (emulatore/device),
 *   dove il sistema touch filtra davvero gli eventi per coordinate. In questo
 *   ambiente (Node + react-test-renderer) il PanResponder viene intercettato a
 *   livello JS e non filtra gli eventi per coordinata — qualsiasi chiamata a
 *   onPanResponderGrant raggiunge il componente indipendentemente da dove
 *   verrebbe fisicamente l'evento touch. Questi test coprono la metà testabile
 *   in Node: la pipeline PanResponder → shared value → transform è corretta.
 *   La negazione completa (old-coords no-trigger) è nel piano di follow-up
 *   (#4680: lint gate per prevenire la regressione left/top).
 *
 * COPERTURA:
 *   (D1) posX/posY aggiornati dopo drag (grant→move→release): il transform
 *        punta alla nuova coordinata → hitbox là dove il widget è visivo.
 *   (D2) nessun left/top dinamico dopo drag (solo transform porta posizione).
 *   (D3) tap a nuova posizione: dopo drag, un release con dx/dy < soglia apre
 *        il menu → conferma che interagire con il widget nella nuova posizione
 *        attiva l'azione prevista.
 *   (D4) no-op a vecchia posizione: drag nella nuova posizione, poi rilascio
 *        con grande dx/dy → il gesto è riconosciuto come drag (non tap) →
 *        il menu NON si apre (approssimazione JS del "tap al vecchio posto").
 *   (D5) drag con displacement zero → no drift.
 *   (D6) hitbox aggiornato già mid-drag (dopo move, prima del release).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

// ── vi.hoisted: stato condiviso accessibile nelle factory vi.mock ─────────────

// avStore traccia le istanze Animated.Value create durante il mount.
// Le prime due (indice 0 e 1) sono posXAnim e posYAnim — quelle memorizzate
// in useRef e su cui viene chiamato setValue() durante drag/tap.
const avStore = vi.hoisted(() => ({
  instances: [] as Array<{ _v: number }>,
  reset() { this.instances = []; },
}));

const panCapture = vi.hoisted(() => ({
  config: null as Record<string, (...a: unknown[]) => unknown> | null,
}));

const mockEnv = vi.hoisted(() => ({
  screen: { width: 400, height: 800 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
  platformOS: "android" as string,
  user: { id: "u1" } as Record<string, string> | null,
  enabled: true,
  suppressed: false,
}));

// ── Mock: react-native ────────────────────────────────────────────────────────
// Animated.Value traccia le istanze in avStore; le prime due (slot 0 e 1) sono
// posXAnim e posYAnim — i ref che React conserva tra i render.
vi.mock("react-native", () => {
  class AnimatedValue {
    _v: number;
    constructor(v: number) {
      this._v = v;
      avStore.instances.push(this as unknown as { _v: number });
    }
    get value() { return this._v; }
    setValue(v: number) { this._v = v; }
    addListener() { return 0; }
    removeListener(_id: number) {}
  }
  return {
    StyleSheet: { create: (s: unknown) => s },
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    Modal: "Modal",
    PanResponder: {
      create: (cfg: Record<string, (...a: unknown[]) => unknown>) => {
        panCapture.config = cfg;
        return { panHandlers: {} };
      },
    },
    useWindowDimensions: () => ({ ...mockEnv.screen }),
    Platform: { get OS() { return mockEnv.platformOS; } },
    Animated: {
      View: "AnimatedView",
      Value: AnimatedValue,
    },
  };
});

// ── Mock: react-native-gesture-handler ────────────────────────────────────────
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => {
      const g: Record<string, () => unknown> = {};
      ["minDistance","onStart","onUpdate","onEnd","onBegin","onFinalize"]
        .forEach(k => { g[k] = () => g; });
      return g;
    },
  },
  GestureDetector: ({ children }: { children: unknown }) => children,
}));

// ── Mock: dipendenze esterne ──────────────────────────────────────────────────
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
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));
vi.mock("@/constants/colors", () => ({
  default: { accent: "#E53935", textSecondary: "#888", surface: "#1a1a1a", border: "#333", text: "#fff" },
}));
vi.mock("@/lib/floating-widget-context", () => ({
  useFloatingWidget: () => ({ enabled: mockEnv.enabled, suppressed: mockEnv.suppressed }),
}));
vi.mock("@/hooks/useAssistantEnabled", () => ({
  useAssistantEnabled: () => ({ fabEnabled: true }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockEnv.user, healthState: "READY", healthReason: "" }),
}));
vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({
  default: () => null,
}));

// ── import componente di produzione ───────────────────────────────────────────
import FloatingWidget from "@/components/FloatingWidget";

// ── costanti ──────────────────────────────────────────────────────────────────
const SCREEN_W = 400;
const SCREEN_H = 800;
const TOP_INSET = 47;
const BOT_INSET = 34;
const WIDGET_SIZE = 40;

// Helper: accede alle istanze Animated.Value 0 (posX) e 1 (posY).
// useRef(new Animated.Value(x)) chiama il costruttore ad ogni render ma React
// conserva solo la prima istanza — quella salvata in avStore.instances[0/1].
function posX(): { value: number } { return avStore.instances[0] as unknown as { value: number }; }
function posY(): { value: number } { return avStore.instances[1] as unknown as { value: number }; }

// Helper: monta FloatingWidget con stato pulito.
function mountFloating() {
  avStore.reset(); panCapture.config = null;
  mockEnv.screen = { width: SCREEN_W, height: SCREEN_H };
  mockEnv.insets = { top: TOP_INSET, bottom: BOT_INSET, left: 0, right: 0 };
  mockEnv.platformOS = "android";
  mockEnv.user = { id: "u1" };
  mockEnv.enabled = true;
  mockEnv.suppressed = false;
  let comp!: ReturnType<typeof renderer.create>;
  renderer.act(() => { comp = renderer.create(React.createElement(FloatingWidget)); });
  return comp;
}

// Helper: esegue un drag completo (grant → move → release con spostamento).
function drag(dx: number, dy: number) {
  renderer.act(() => { panCapture.config!.onPanResponderGrant({}, {}); });
  renderer.act(() => { panCapture.config!.onPanResponderMove({}, { dx, dy }); });
  renderer.act(() => { panCapture.config!.onPanResponderRelease({}, { dx, dy, vx: 0, vy: 0 }); });
}

// Helper: esegue un tap (grant → release con dx/dy sotto soglia TAP_THRESHOLD=8).
// Corrisponde a "utente tocca il widget" nella nuova posizione.
function tap() {
  renderer.act(() => { panCapture.config!.onPanResponderGrant({}, {}); });
  renderer.act(() => { panCapture.config!.onPanResponderRelease({}, { dx: 0, dy: 0, vx: 0, vy: 0 }); });
}

// Helper: trova l'overlay del menu nel JSON del componente.
// Il FloatingWidget usa ora un overlay assoluto (position:"absolute", zIndex:9500)
// anziché un Modal — lo cerchiamo tramite zIndex nello stile.
function findOverlay(json: unknown): Record<string, unknown> | null {
  const nodes = Array.isArray(json) ? json : [json];
  for (const node of nodes) {
    if (node == null || typeof node !== "object") continue;
    const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown };
    const style = n.props?.style as Record<string, unknown> | undefined;
    if (style?.zIndex === 9500) return n.props ?? null;
    if (n.children) {
      const found = findOverlay(n.children);
      if (found) return found;
    }
  }
  return null;
}

// Compatibilità con i test esistenti: "visible:false" = overlay assente,
// "visible:true" = overlay presente nel tree.
function findModalProps(json: unknown): { visible: boolean } {
  const overlay = findOverlay(json);
  return { visible: overlay !== null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sezione D — FloatingWidget drag-hitbox
// ═══════════════════════════════════════════════════════════════════════════════

describe("FloatingWidget — drag-hitbox Android", () => {
  let comp: ReturnType<typeof renderer.create>;

  beforeEach(() => {
    vi.useFakeTimers();
    comp = mountFloating();
  });
  afterEach(() => {
    renderer.act(() => { comp.unmount(); });
    vi.useRealTimers();
  });

  /**
   * (D1) Dopo drag(dx=100, dy=50), posX/posY riflettono la nuova posizione
   * clampata. Il transform del componente punta alla nuova coordinata: il
   * sistema touch Android (che usa il transform per calcolare l'hitbox)
   * risponde ai tap nella posizione in cui il widget è visivamente.
   *
   * Controprova: se il componente usasse `left`/`top` invece di `transform`,
   * posX/posY non sarebbero la fonte del posizionamento touch e questa
   * asserzione non avrebbe senso come test di hitbox.
   */
  it("(D1) posX e posY aggiornati dopo drag: transform punta alla nuova coordinata (hitbox lì)", () => {
    const startX = posX().value;
    const startY = posY().value;

    drag(100, 50);

    const expectedX = Math.max(0, Math.min(startX + 100, SCREEN_W - WIDGET_SIZE));
    const expectedY = Math.max(
      TOP_INSET + 8,
      Math.min(startY + 50, SCREEN_H - WIDGET_SIZE - (BOT_INSET + 8)),
    );

    expect(posX().value).toBe(expectedX);
    expect(posY().value).toBe(expectedY);

    // Il drag ha spostato il widget rispetto alla posizione originale.
    expect(posX().value).not.toBe(startX);
  });

  /**
   * (D2) Dopo un drag, lo stile dell'AnimatedView NON deve contenere left/top
   * con valori dipendenti dalla posizione corrente. Solo il transform deve
   * portare la posizione — left/top, se presenti, devono essere 0 fissi.
   *
   * Regressione target: qualcuno aggiunge `left: posX.value` allo stile →
   * su Android il pixel si sposta ma l'hitbox rimane all'origine.
   */
  it("(D2) nessun left/top dinamico dopo drag — solo il transform porta la posizione (Android hitbox)", () => {
    drag(80, 30);

    const json = comp.toJSON() as unknown;
    const ball = (Array.isArray(json) ? json[0] : json) as {
      type: string;
      props: Record<string, unknown>;
    };

    expect(ball.type).toBe("AnimatedView");

    const styleArr = Array.isArray(ball.props.style)
      ? (ball.props.style as unknown[])
      : [ball.props.style];

    for (const fragment of styleArr) {
      if (fragment == null || typeof fragment !== "object") continue;
      const s = fragment as Record<string, unknown>;
      if ("left" in s) expect(s.left).toBe(0);
      if ("top" in s) expect(s.top).toBe(0);
    }
  });

  /**
   * (D3) TAP ALLA NUOVA POSIZIONE: dopo un drag, un tap (release con dx/dy
   * sotto la soglia TAP_THRESHOLD=8) apre il menu di navigazione.
   *
   * Questo è il "tap successivo cade sul widget" del task: se l'hitbox NON
   * seguisse il visivo (bug left/top), l'utente toccherebbe il punto visivo
   * e non riceverebbe feedback. Il menu che si apre conferma che il widget
   * è interagibile nella nuova posizione.
   *
   * Nota sull'asserzione negativa (old-coords no-trigger):
   *   La prova "tap alle vecchie coordinate NON attiva il widget" richiederebbe
   *   Detox su emulatore Android: il sistema touch nativo filtra gli eventi per
   *   coordinata geografica, cosa che il PanResponder intercettato in Node non
   *   fa. L'asserzione positiva qui + i test (D1/D2) sul transform costituiscono
   *   la copertura massima raggiungibile in ambiente Node/Jest/Vitest.
   */
  it("(D3) tap alla nuova posizione dopo drag apre il menu — widget interagibile dove si trova", () => {
    // Verifica baseline: il menu è chiuso prima del drag.
    const jsonBefore = comp.toJSON() as unknown;
    const modalBefore = findModalProps(jsonBefore);
    expect(modalBefore?.visible).toBe(false);

    // Drag a nuova posizione.
    drag(100, 50);

    // Tap nella nuova posizione (dx=0,dy=0 < TAP_THRESHOLD=8 → isDragGesture=false
    // → toggleMenu() viene chiamato → setMenuOpen(true)).
    tap();

    // Il menu deve essere aperto: l'azione del tap è stata eseguita.
    const jsonAfter = comp.toJSON() as unknown;
    const modalAfter = findModalProps(jsonAfter);
    expect(modalAfter?.visible).toBe(true);
  });

  /**
   * (D4) DRAG-RELEASE NON APRE IL MENU: un release con grande spostamento
   * (dx > TAP_THRESHOLD) è riconosciuto come drag, non tap → menu chiuso.
   * Approssimazione JS di "touch nelle vecchie coordinate non è un tap":
   * su Android il touch alla vecchia posizione non raggiungerebbe il widget
   * (hitbox spostato); qui verifichiamo che un gesto identificato come drag
   * non attivi accidentalmente l'azione del tap.
   */
  it("(D4) release con spostamento > soglia NON apre il menu (drag ≠ tap)", () => {
    drag(100, 50); // drag a nuova posizione, nessuna apertura menu
    const jsonAfter = comp.toJSON() as unknown;
    const modal = findModalProps(jsonAfter);
    expect(modal?.visible).toBe(false);
  });

  /**
   * (D5) Drag con displacement (0, 0): il ciclo grant→move(0,0)→release non
   * deve causare alcun drift. Il widget rimane esattamente dove era.
   * (Nota: dx=0,dy=0 è sotto TAP_THRESHOLD, quindi il release apre il menu;
   *  la posizione invece non cambia.)
   */
  it("(D5) drag con displacement zero non sposta il widget (no drift)", () => {
    const startX = posX().value;
    const startY = posY().value;

    drag(0, 0);

    expect(posX().value).toBe(startX);
    expect(posY().value).toBe(startY);
  });

  /**
   * (D6) Il transform riflette la posizione già durante il move — non solo
   * dopo il release. Un utente che trascina lentamente tocca il widget
   * nella posizione visiva corrente in tempo reale.
   */
  it("(D6) posizione aggiornata mid-drag (dopo move, prima del release)", () => {
    const startX = posX().value;
    const startY = posY().value;

    renderer.act(() => { panCapture.config!.onPanResponderGrant({}, {}); });
    renderer.act(() => { panCapture.config!.onPanResponderMove({}, { dx: 60, dy: -20 }); });

    const expectedX = Math.max(0, Math.min(startX + 60, SCREEN_W - WIDGET_SIZE));
    const expectedY = Math.max(
      TOP_INSET + 8,
      Math.min(startY - 20, SCREEN_H - WIDGET_SIZE - (BOT_INSET + 8)),
    );

    expect(posX().value).toBe(expectedX);
    expect(posY().value).toBe(expectedY);

    renderer.act(() => {
      panCapture.config!.onPanResponderRelease({}, { dx: 60, dy: -20, vx: 0, vy: 0 });
    });
  });
});
