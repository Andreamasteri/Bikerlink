/**
 * Test drag + hitbox per UptimeWidget su Android.
 *
 * PROBLEMA (Android-specific):
 *   Su Android, animare la posizione via `left`/`top` sposta il pixel sullo
 *   schermo ma lascia l'area di tocco (hitbox) alla posizione di layout
 *   originale. L'utente vede il widget in una posizione nuova ma tocca dove
 *   il widget ERA. Con `transform: [{translateX}, {translateY}]` l'hitbox
 *   segue il widget perché Android applica la trasformazione anche al sistema
 *   di coordinate degli eventi touch.
 *
 *   Questo è il motivo per cui UptimeWidget usa esclusivamente transform per
 *   il posizionamento dinamico — stessa scelta già adottata per FloatingWidget
 *   (vedi floating-widget-android-hitbox.md). Entrambi usano RN Animated.Value
 *   con transform: evita il percorso Reanimated → NativeAnimatedModule →
 *   ReadableNativeMap.getLocalMap che causava HashMap.resize OOM in sessioni
 *   lunghe (Sentry issue 134724851, S26 Ultra, dist 80).
 *
 * NOTA SU DETOX / NEGAZIONE COORDINATE ORIGINALE:
 *   La prova definitiva "il tap alla VECCHIA posizione NON attiva il widget"
 *   richiederebbe un test Detox su un binario nativo Android (emulatore/device),
 *   dove il sistema touch filtra davvero gli eventi per coordinate. In questo
 *   ambiente (Node + react-test-renderer) il PanResponder viene intercettato a
 *   livello JS e non filtra gli eventi per coordinata — qualsiasi chiamata a
 *   onPanResponderGrant raggiunge il componente indipendentemente da dove
 *   verrebbe fisicamente l'evento touch. Questi test coprono la metà testabile
 *   in Node: la pipeline PanResponder → Animated.Value → transform è corretta.
 *
 * COPERTURA:
 *   (D3) posX/posY aggiornati dopo drag: transform punta alla nuova coordinata
 *        → hitbox lì dove il widget è visivo.
 *   (D4) nessun left/top dinamico dopo drag (solo transform porta posizione).
 *   (D5) tap alla nuova posizione: dopo drag, un release con dx/dy < soglia
 *        chiama router.push → conferma che il widget è interagibile dove si trova.
 *   (D6) drag di grande ampiezza: posizione clampata ai bordi (hitbox sempre valido).
 *   (D7) drag-release non naviga (spostamento > soglia = drag, non tap).
 *
 * Vedere anche:
 *   FloatingWidget.drag-hitbox.test.ts: stessa suite per il pallino navigazione
 *   UptimeWidget.logic.test.ts (B-series): PanResponder + re-clamp useEffect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

// ── vi.hoisted: stato condiviso accessibile nelle factory vi.mock ─────────────

// avStore traccia gli Animated.Value creati durante il mount (slot-based per
// indice di chiamata, come faceva il vecchio svStore per useSharedValue).
// Le prime due istanze (slot 0 e 1) sono posXAnim e posYAnim — quelle
// memorizzate in useRef e su cui viene chiamato setValue() durante drag/tap.
const avStore = vi.hoisted(() => ({
  slots: [] as Array<{ value: number }>,
  idx: 0,
  reset() { this.idx = 0; },
  clear() { this.slots = []; this.idx = 0; },
}));

const panCapture = vi.hoisted(() => ({
  config: null as Record<string, (...a: unknown[]) => unknown> | null,
}));

const mockEnv = vi.hoisted(() => ({
  screen: { width: 400, height: 800 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
}));

// Router mock condiviso: catturato in vi.hoisted così possiamo resettarlo e
// ispezionarlo nei test.
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

// ── Mock: react-native ────────────────────────────────────────────────────────
// Animated.Value usa slot stabili per indice di chiamata (come Reanimated
// useSharedValue faceva in precedenza): stessa istanza riutilizzata tra render,
// setValue() scrive nel slot condiviso, il test helper posX()/posY() lo legge.
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
    removeListener(_id: number) {}
  }
  return {
    StyleSheet: { create: (s: unknown) => s },
    View: "View",
    Text: "Text",
    PanResponder: {
      create: (cfg: Record<string, (...a: unknown[]) => unknown>) => {
        panCapture.config = cfg;
        return { panHandlers: {} };
      },
    },
    useWindowDimensions: () => ({ ...mockEnv.screen }),
    Platform: { OS: "android" },
    Animated: {
      View: "AnimatedView",
      Value: AnimatedValue,
    },
  };
});

// ── Mock: react-native-reanimated (stub minimo) ───────────────────────────────
// UptimeWidget non importa più da Reanimated dopo la migrazione a RN
// Animated.Value. Stub minimo per evitare errori da import transitivi.
vi.mock("react-native-reanimated", () => ({
  default: { View: "AnimatedView" },
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
  useRouter: () => routerMock,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
// UptimeWidget importa isDragGesture e TAP_THRESHOLD da FloatingWidget.
// La funzione è pura — la forniamo direttamente senza montare FloatingWidget.
vi.mock("@/components/FloatingWidget", () => ({
  isDragGesture: (dx: number, dy: number, threshold = 8) =>
    Math.abs(dx) > threshold || Math.abs(dy) > threshold,
  TAP_THRESHOLD: 8,
}));

// ── import componente di produzione ───────────────────────────────────────────
import UptimeWidget from "@/components/UptimeWidget";

// ── costanti ──────────────────────────────────────────────────────────────────
const SCREEN_W = 400;
const SCREEN_H = 800;
const TOP_INSET = 47;
const BOT_INSET = 34;
const WIDGET_W = 110;
const WIDGET_H = 32;

// Helper: accede agli Animated.Value 0 (posXAnim) e 1 (posYAnim) via slot store.
function posX() { return avStore.slots[0]; }
function posY() { return avStore.slots[1]; }

// Helper: monta UptimeWidget con stato pulito.
function mountUptime() {
  avStore.clear(); panCapture.config = null;
  routerMock.push.mockClear();
  mockEnv.screen = { width: SCREEN_W, height: SCREEN_H };
  mockEnv.insets = { top: TOP_INSET, bottom: BOT_INSET, left: 0, right: 0 };
  let comp!: ReturnType<typeof renderer.create>;
  avStore.reset();
  renderer.act(() => { comp = renderer.create(React.createElement(UptimeWidget)); });
  return comp;
}

// Helper: drag completo (grant → move → release con spostamento).
function drag(dx: number, dy: number) {
  renderer.act(() => { panCapture.config!.onPanResponderGrant({}, {}); });
  renderer.act(() => { panCapture.config!.onPanResponderMove({}, { dx, dy }); });
  renderer.act(() => { panCapture.config!.onPanResponderRelease({}, { dx, dy, vx: 0, vy: 0 }); });
}

// Helper: tap (grant → release con dx/dy sotto soglia TAP_THRESHOLD=8).
function tap() {
  renderer.act(() => { panCapture.config!.onPanResponderGrant({}, {}); });
  renderer.act(() => { panCapture.config!.onPanResponderRelease({}, { dx: 0, dy: 0, vx: 0, vy: 0 }); });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sezione D — UptimeWidget drag-hitbox
// ═══════════════════════════════════════════════════════════════════════════════

describe("UptimeWidget — drag-hitbox Android", () => {
  let comp: ReturnType<typeof renderer.create>;

  beforeEach(() => {
    vi.useFakeTimers();
    comp = mountUptime();
  });
  afterEach(() => {
    renderer.act(() => { comp.unmount(); });
    vi.useRealTimers();
  });

  /**
   * (D3) Dopo drag(dx=-60, dy=-80), posX/posY riflettono la nuova posizione
   * clampata. Il transform del componente punta alla nuova coordinata: il
   * sistema touch Android risponde ai tap dove il widget è visivamente.
   *
   * Controprova: se UptimeWidget usasse `left`/`top` invece di `transform`,
   * posX/posY non sarebbero la fonte del posizionamento touch.
   */
  it("(D3) posX e posY aggiornati dopo drag: transform punta alla nuova coordinata (hitbox lì)", () => {
    const startX = posX().value;
    const startY = posY().value;

    drag(-60, -80);

    const expectedX = Math.max(0, Math.min(startX - 60, SCREEN_W - WIDGET_W));
    const expectedY = Math.max(
      TOP_INSET + 8,
      Math.min(startY - 80, SCREEN_H - WIDGET_H - (BOT_INSET + 8)),
    );

    expect(posX().value).toBe(expectedX);
    expect(posY().value).toBe(expectedY);
    expect(posX().value).not.toBe(startX);
  });

  /**
   * (D4) Dopo un drag, lo stile dell'AnimatedView NON deve contenere left/top
   * con valori dipendenti dalla posizione corrente. Solo il transform deve
   * portare la posizione (left/top fissi a 0 dallo stylesheet).
   *
   * Regressione target: qualcuno aggiunge `left: posXRef.current` allo stile →
   * su Android il pixel si sposta ma l'hitbox rimane all'origine.
   */
  it("(D4) nessun left/top dinamico dopo drag — solo il transform porta la posizione (Android hitbox)", () => {
    drag(-40, 20);

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
   * (D5) TAP ALLA NUOVA POSIZIONE: dopo un drag, un tap (dx=0,dy=0 < soglia)
   * chiama router.push verso la history screen.
   *
   * Questo è il "tap successivo cade sul widget" del task: il widget risponde
   * alle interazioni nella nuova posizione visiva (non all'origine).
   *
   * Nota sull'asserzione negativa (old-coords no-trigger):
   *   La prova "tap alle vecchie coordinate NON attiva il widget" richiederebbe
   *   Detox su emulatore Android: il sistema touch nativo filtra gli eventi per
   *   coordinata geografica, cosa che il PanResponder intercettato in Node non
   *   fa. L'asserzione positiva qui + (D3/D4) sul transform coprono la
   *   superficie testabile senza native binary.
   */
  it("(D5) tap alla nuova posizione dopo drag chiama router.push — widget interagibile dove si trova", () => {
    // Verifica baseline: nessuna navigazione prima del drag.
    expect(routerMock.push).not.toHaveBeenCalled();

    // Drag a nuova posizione.
    drag(-60, -80);

    // router.push NON deve essere stato chiamato dal drag release (grande spostamento).
    expect(routerMock.push).not.toHaveBeenCalled();

    // Tap nella nuova posizione (dx=0,dy=0 < TAP_THRESHOLD=8 → isDragGesture=false
    // → openHistory() → router.push("/admin/restart-history")).
    tap();

    expect(routerMock.push).toHaveBeenCalledWith("/admin/restart-history");
  });

  /**
   * (D6) Drag di grande ampiezza (dx=9999, dy=9999): la posizione finale deve
   * essere clampata ai bordi dello schermo. L'hitbox è sempre dentro l'area
   * visibile — mai fuori schermo, mai alla posizione di layout originale.
   * Su Android questo garantisce che il widget rimanga sempre toccabile.
   */
  it("(D6) drag di grande ampiezza: posizione finale clampata ai bordi (hitbox sempre valido su Android)", () => {
    drag(9999, 9999);

    const maxX = SCREEN_W - WIDGET_W;
    const maxY = SCREEN_H - WIDGET_H - (BOT_INSET + 8);

    expect(posX().value).toBeLessThanOrEqual(maxX);
    expect(posX().value).toBeGreaterThanOrEqual(0);
    expect(posY().value).toBeLessThanOrEqual(maxY);
    expect(posY().value).toBeGreaterThanOrEqual(TOP_INSET + 8);
  });

  /**
   * (D7) DRAG-RELEASE NON NAVIGA: un release con grande spostamento (> soglia)
   * è riconosciuto come drag, non tap → router.push non viene chiamato.
   * Verifica che il drag non attivi accidentalmente la navigazione.
   */
  it("(D7) release con spostamento > soglia NON chiama router.push (drag ≠ tap)", () => {
    drag(-60, -80); // spostamento grande → isDragGesture=true → no navigation
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
