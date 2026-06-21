/**
 * Test logica UptimeWidget: clampUptimePos + PanResponder + re-clamp useEffect.
 *
 * Componente sotto test: components/UptimeWidget.tsx
 *
 * Sezione A — test puri su clampUptimePos (zero React):
 *   Importa la funzione direttamente e la testa come pura, senza montare
 *   nulla. Se la logica di clamping cambia nel sorgente, questi test rompono
 *   immediatamente (regression guard diretto).
 *
 * Sezione B — test di mount (react-test-renderer):
 *   Monta il componente per testare i comportamenti che richiedono il ciclo
 *   di vita React:
 *   (b1) isDragging guard: grant → re-render con dimensioni ridotte → il
 *        re-clamp useEffect NON scrive (isDragging=true impedisce il salto).
 *   (b2) Ref aggiornati in onPanResponderMove: re-render con nuova larghezza →
 *        il move usa widthRef.current aggiornato, non la closure stantia.
 *   (b3) Release ripristina isDragging=false e clamp finale corretto.
 *
 * useSharedValue mock stabile via slot indicizzati per posizione di chiamata
 * (simulazione del comportamento interno di Reanimated tra i render):
 *   - svStore.slots[i] viene creato al primo render e riusato ai successivi
 *   - svStore.reset() va chiamato PRIMA di ogni renderer.act() / update()
 *   - Il PanResponder (frozen nel useRef al primo render) e il re-clamp
 *     useEffect leggono/scrivono gli stessi oggetti attraverso i render.
 *
 * Riferimento architetturale: FloatingWidget.mount.test.ts (stesso pattern).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

// ── vi.hoisted: stato condiviso prima di qualsiasi import/mock ────────────────

// Shared values: slot stabili per indice di chiamata (come Reanimated internamente)
const svStore = vi.hoisted(() => ({
  slots: [] as Array<{ value: number }>,
  idx: 0,
  reset() {
    this.idx = 0;
  },
  clear() {
    this.slots = [];
    this.idx = 0;
  },
}));

// PanResponder config catturato da PanResponder.create (frozen al primo render)
const panCapture = vi.hoisted(() => ({
  config: null as Record<string, (...a: unknown[]) => unknown> | null,
}));

// Dimensioni e insets mutabili: cambiarli + svStore.reset() + renderer.update()
// simula rotazione schermo / apertura pannello senza rimontare il componente.
const mockEnv = vi.hoisted(() => ({
  screen: { width: 400, height: 800 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
}));

// ── mock: react-native ────────────────────────────────────────────────────────
vi.mock("react-native", () => ({
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
  Platform: { OS: "ios" },
}));

// ── mock: react-native-reanimated (shared values stabili per slot) ────────────
// svStore.reset() va chiamato prima di ogni render; così ogni i-esima chiamata
// a useSharedValue restituisce SEMPRE lo stesso oggetto, come fa Reanimated.
vi.mock("react-native-reanimated", () => ({
  default: { View: "AnimatedView" },
  useSharedValue: (initialValue: number) => {
    const i = svStore.idx++;
    if (!svStore.slots[i]) {
      svStore.slots[i] = { value: initialValue };
    }
    return svStore.slots[i];
  },
  useAnimatedStyle: () => ({}),
}));

// ── altri mock indispensabili per caricare il modulo ─────────────────────────
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
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("@/components/FloatingWidget", () => ({
  isDragGesture: (dx: number, dy: number, threshold = 8) =>
    Math.abs(dx) > threshold || Math.abs(dy) > threshold,
  TAP_THRESHOLD: 8,
}));

// ── import DIRETTI di produzione ──────────────────────────────────────────────
import { clampUptimePos } from "@/components/UptimeWidget";
import UptimeWidget from "@/components/UptimeWidget";

// ── costanti condivise ────────────────────────────────────────────────────────
const WIDGET_W = 110;
const WIDGET_H = 32;
const SCREEN_W = 400;
const SCREEN_H = 800;
const TOP = 47;
const BOTTOM = 34;
const MIN_Y = TOP + 8;    // 55
const MAX_Y_PAD = BOTTOM + 8; // 42
const MAX_X = SCREEN_W - WIDGET_W; // 290
const MAX_Y = SCREEN_H - WIDGET_H - MAX_Y_PAD; // 726

// Helper: posX/posY dal primo render (stessi oggetti usati dal PanResponder)
function posX() { return svStore.slots[0]; }
function posY() { return svStore.slots[1]; }

// Helper: monta UptimeWidget resettando lo slot index prima del render
function mountWidget() {
  svStore.clear();
  panCapture.config = null;
  mockEnv.screen = { width: SCREEN_W, height: SCREEN_H };
  mockEnv.insets = { top: TOP, bottom: BOTTOM, left: 0, right: 0 };
  let comp!: ReturnType<typeof renderer.create>;
  svStore.reset();
  renderer.act(() => {
    comp = renderer.create(React.createElement(UptimeWidget));
  });
  return comp;
}

// Helper: aggiorna dimensioni/insets e forza un re-render
function rerender(
  comp: ReturnType<typeof renderer.create>,
  patch: Partial<typeof mockEnv.screen & typeof mockEnv.insets>,
) {
  if (patch.width !== undefined) mockEnv.screen.width = patch.width;
  if (patch.height !== undefined) mockEnv.screen.height = patch.height;
  if (patch.top !== undefined) mockEnv.insets.top = patch.top;
  if (patch.bottom !== undefined) mockEnv.insets.bottom = patch.bottom;
  svStore.reset();
  renderer.act(() => {
    comp.update(React.createElement(UptimeWidget));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SEZIONE A — Test puri: clampUptimePos
// ═══════════════════════════════════════════════════════════════════════════

describe("clampUptimePos — (A1) posizione dentro i bordi resta invariata", () => {
  it("posizione centrale valida non viene modificata", () => {
    expect(clampUptimePos(100, 300, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD)).toEqual({ x: 100, y: 300 });
  });

  it("esattamente sui limiti minimi resta invariata", () => {
    expect(clampUptimePos(0, MIN_Y, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD)).toEqual({ x: 0, y: MIN_Y });
  });

  it("esattamente sui limiti massimi resta invariata", () => {
    expect(clampUptimePos(MAX_X, MAX_Y, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD)).toEqual({ x: MAX_X, y: MAX_Y });
  });
});

describe("clampUptimePos — (A2) posizione oltre i bordi viene riportata dentro", () => {
  it("x negativo → clampato a 0", () => {
    expect(clampUptimePos(-50, 300, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).x).toBe(0);
  });

  it("x oltre destra → clampato a screenW - WIDGET_W (110)", () => {
    expect(clampUptimePos(9999, 300, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).x).toBe(MAX_X);
  });

  it("y sopra notch → clampato a minY (insets.top + 8)", () => {
    expect(clampUptimePos(100, 0, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).y).toBe(MIN_Y);
  });

  it("y sotto home indicator → clampato a screenH - WIDGET_H - (insets.bottom + 8)", () => {
    expect(clampUptimePos(100, 9999, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD).y).toBe(MAX_Y);
  });

  it("con insets=0 il limite inferiore usa solo padding di base (8px)", () => {
    const r = clampUptimePos(100, 9999, SCREEN_W, SCREEN_H, 8, 8);
    expect(r.y).toBe(SCREEN_H - WIDGET_H - 8);
  });

  it("clamp simultaneo su entrambi gli assi", () => {
    expect(clampUptimePos(-100, -100, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD)).toEqual({ x: 0, y: MIN_Y });
  });

  it("asse X e Y clampati con limiti diversi (widget rettangolare 110×32, non quadrato)", () => {
    const r = clampUptimePos(9999, 9999, SCREEN_W, SCREEN_H, MIN_Y, MAX_Y_PAD);
    expect(r.x).toBe(SCREEN_W - WIDGET_W); // 290
    expect(r.y).toBe(SCREEN_H - WIDGET_H - MAX_Y_PAD); // 726
    expect(r.x).not.toBe(r.y); // limiti distinti, non quadrato
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEZIONE B — Test di mount: PanResponder + re-clamp useEffect
// ═══════════════════════════════════════════════════════════════════════════

describe("UptimeWidget — (B1) isDragging guard: re-clamp useEffect non scrive mid-drag", () => {
  let comp: ReturnType<typeof renderer.create>;

  beforeEach(() => {
    vi.useFakeTimers();
    comp = mountWidget();
  });

  afterEach(() => {
    renderer.act(() => { comp.unmount(); });
    vi.useRealTimers();
  });

  it("PanResponder.create viene chiamato al mount (config catturata)", () => {
    expect(panCapture.config).not.toBeNull();
    expect(typeof panCapture.config!.onPanResponderGrant).toBe("function");
    expect(typeof panCapture.config!.onPanResponderMove).toBe("function");
    expect(typeof panCapture.config!.onPanResponderRelease).toBe("function");
  });

  it("posX e posY sono shared value osservabili (slot 0 e 1)", () => {
    expect(posX()).toBeDefined();
    expect(posY()).toBeDefined();
    expect(typeof posX().value).toBe("number");
    expect(typeof posY().value).toBe("number");
  });

  it("grant imposta isDragging; re-render con schermo ridotto NON sposta il widget (no salto mid-drag)", () => {
    // Registra la posizione prima del drag
    const beforeX = posX().value;
    const beforeY = posY().value;

    // Grant: isDragging.current = true
    renderer.act(() => {
      panCapture.config!.onPanResponderGrant({}, {});
    });

    // Re-render con schermo molto più piccolo: senza isDragging guard il widget
    // salterebbe all'interno dei nuovi limiti (es. x → 0, y → 55).
    // Con il guard il re-clamp useEffect ritorna immediatamente senza scrivere.
    rerender(comp, { width: 100, height: 100 });

    // La posizione non deve essere cambiata perché isDragging=true
    expect(posX().value).toBe(beforeX);
    expect(posY().value).toBe(beforeY);
  });

  it("dopo release isDragging=false: re-render con schermo ridotto applica il re-clamp", () => {
    // Grant poi release: isDragging torna false
    renderer.act(() => {
      panCapture.config!.onPanResponderGrant({}, {});
    });
    renderer.act(() => {
      panCapture.config!.onPanResponderRelease({}, { dx: 0, dy: 0, vx: 0, vy: 0 });
    });

    // Re-render con schermo ridotto (150px): maxX = 150-110 = 40 → posX deve scendere
    rerender(comp, { width: 150, height: 800 });

    // Con isDragging=false il re-clamp useEffect è libero di correggere la posizione
    const newMaxX = Math.max(0, 150 - WIDGET_W); // 40
    expect(posX().value).toBeLessThanOrEqual(newMaxX);
    expect(posX().value).toBeGreaterThanOrEqual(0);
  });

  // ── Pannello: solo gli inset cambiano, larghezza/altezza restano invariate ──
  // Questi due test coprono il bug "salto all'apertura del pannello": il re-clamp
  // useEffect dipende da [width, height, insets.top, insets.bottom]. Quando si
  // apre un bottom sheet, bottom aumenta ma le dimensioni dello schermo non
  // cambiano. Il widget deve saltare SOLO se la sua posizione corrente esce dai
  // nuovi limiti — mai quando è già dentro.

  it("(pannello) solo insets.bottom aumenta, widget al centro: nessun salto (posizione invariata)", () => {
    // Posizione default: y = 800 - 32 - 84 - 34 = 650, x = 400 - 110 - 16 = 274
    // Con bottom=50: maxY = 800 - 32 - (50+8) = 710 → 650 < 710 → ancora dentro → no write
    // (con bottom=34 originale: maxY = 800-32-42=726 → 650 < 726 → dentro)
    const beforeX = posX().value;
    const beforeY = posY().value;

    // Cambia solo insets.bottom (pannello mini aperto), larghezza/altezza invariate
    rerender(comp, { bottom: 50 });

    // La posizione non deve cambiare: il widget è già dentro i nuovi limiti
    expect(posX().value).toBe(beforeX);
    expect(posY().value).toBe(beforeY);
  });

  it("(pannello) solo insets.bottom aumenta molto, widget vicino al fondo: re-clamp applicato", () => {
    // Posiziona il widget vicino al fondo: subito dentro il limite attuale
    // maxY con bottom=34: 800 - 32 - 42 = 726
    // Impostiamo posY = 700 (dentro 726), poi aumentiamo bottom → nuovo maxY scende
    posY().value = 700;

    // Apri un pannello enorme: bottom=300 → nuovo maxY = 800-32-(300+8) = 460
    // Il widget a y=700 è ora fuori → deve essere riclampato a 460
    rerender(comp, { bottom: 300 });

    const newMaxY = SCREEN_H - WIDGET_H - (300 + 8); // 460
    expect(posY().value).toBeLessThanOrEqual(newMaxY);
    expect(posY().value).toBeGreaterThanOrEqual(MIN_Y);
  });
});

describe("UptimeWidget — (B2) onPanResponderMove usa ref aggiornati (no closure stantia)", () => {
  let comp: ReturnType<typeof renderer.create>;

  beforeEach(() => {
    vi.useFakeTimers();
    comp = mountWidget();
  });

  afterEach(() => {
    renderer.act(() => { comp.unmount(); });
    vi.useRealTimers();
  });

  it("dopo re-render con nuova larghezza, il move clampа a screenW aggiornato (non quello del mount)", () => {
    // Grant: salva dragStart e imposta isDragging=true
    renderer.act(() => {
      panCapture.config!.onPanResponderGrant({}, {});
    });

    const dragStartX = posX().value; // salvato dal grant

    // Cambia la larghezza dello schermo: da 400 a 200
    rerender(comp, { width: 200 });
    // In questo momento widthRef.current = 200 (aggiornato dal corpo del componente)

    // Move con dx enorme: il clamp deve usare il NUOVO screenW (200), non quello
    // originale (400). Il max x diventa 200 - 110 = 90.
    renderer.act(() => {
      panCapture.config!.onPanResponderMove({}, { dx: 9999, dy: 0 });
    });

    const expectedMaxX = 200 - WIDGET_W; // 90

    // Se widthRef fosse stantio (400) il risultato sarebbe 290 (MAX_X vecchio)
    // Con il ref aggiornato il risultato è 90
    expect(posX().value).toBeLessThanOrEqual(expectedMaxX);
    // E il punto di partenza del drag è quello corretto (salvato prima del resize)
    expect(dragStartX + 9999).toBeGreaterThan(expectedMaxX); // sanity: senza clamp sforirebbe
  });

  it("dopo re-render con nuovo insets.bottom, il move usa il minY aggiornato", () => {
    renderer.act(() => {
      panCapture.config!.onPanResponderGrant({}, {});
    });

    // Aumenta drasticamente insets.top (simulazione notifica/pannello)
    rerender(comp, { top: 200 });

    // Move con dy negativo enorme: clamp inferiore superiore usa il nuovo minY
    renderer.act(() => {
      panCapture.config!.onPanResponderMove({}, { dx: 0, dy: -9999 });
    });

    const expectedMinY = 200 + 8; // 208 — nuovo minY con insetsRef aggiornato
    expect(posY().value).toBeGreaterThanOrEqual(expectedMinY);
  });
});

describe("UptimeWidget — (B3) onPanResponderRelease clampа e ripristina isDragging=false", () => {
  let comp: ReturnType<typeof renderer.create>;

  beforeEach(() => {
    vi.useFakeTimers();
    comp = mountWidget();
  });

  afterEach(() => {
    renderer.act(() => { comp.unmount(); });
    vi.useRealTimers();
  });

  it("release clampа la posizione finale dentro i bordi correnti", () => {
    // Grant: isDragging=true, dragStart = posizione iniziale
    renderer.act(() => {
      panCapture.config!.onPanResponderGrant({}, {});
    });

    // Move il widget fuori dallo schermo
    renderer.act(() => {
      panCapture.config!.onPanResponderMove({}, { dx: 9999, dy: 9999 });
    });

    // Release: deve clampare la posizione dentro i bordi
    renderer.act(() => {
      panCapture.config!.onPanResponderRelease({}, { dx: 9999, dy: 9999, vx: 0, vy: 0 });
    });

    expect(posX().value).toBeLessThanOrEqual(MAX_X);
    expect(posX().value).toBeGreaterThanOrEqual(0);
    expect(posY().value).toBeLessThanOrEqual(MAX_Y);
    expect(posY().value).toBeGreaterThanOrEqual(MIN_Y);
  });

  it("dopo release un re-render con schermo ridotto applica correttamente il re-clamp (isDragging=false)", () => {
    renderer.act(() => {
      panCapture.config!.onPanResponderGrant({}, {});
    });
    renderer.act(() => {
      panCapture.config!.onPanResponderRelease({}, { dx: 0, dy: 0, vx: 0, vy: 0 });
    });

    // Re-render con schermo ridotto: con isDragging=false il re-clamp deve agire
    rerender(comp, { width: 150 });

    expect(posX().value).toBeLessThanOrEqual(150 - WIDGET_W);
  });
});
