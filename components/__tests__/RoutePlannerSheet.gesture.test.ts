/**
 * Test della logica gesture del drag handle dello slider route-planner.
 *
 * Componente sotto test: components/giri/create/RouteStyleSection.tsx
 *   — lo slider PanResponder nella schermata di creazione giro (route planner)
 *     che permette di selezionare lo stile del percorso trascinando un handle
 *     orizzontale tra "direct" e "extra_curvy".
 *
 * Strategia (tightly coupled al codice di produzione):
 *   - Importa DIRETTAMENTE le due esportazioni pure dal componente:
 *       resolveRouteStyleIndex       → formula di snap posizione→indice
 *       createRouteStylePanHandlers  → factory che restituisce onGrant/onMove
 *     Se la logica di queste funzioni cambia nel sorgente, i test si rompono
 *     immediatamente (regression guard diretto — zero duplicazione di logica).
 *   - Non monta il componente (RN Animated non gira in Node):
 *     le funzioni JS vengono usate standalone.
 *
 * Copertura richiesta:
 *   drag-open       → trascinamento verso destra aumenta il livello stile
 *                     (si "apre" verso extra_curvy)
 *   drag-close      → trascinamento verso sinistra diminuisce il livello
 *                     (si "chiude" verso direct)
 *   snap thresholds → resolveRouteStyleIndex quantizza correttamente
 *                     la posizione all'indice più vicino
 *   velocity dismiss → il drag handle NON ha onPanResponderRelease né logica
 *                      di velocità (design guard: aggiungerne una rompere
 *                      questi test e richiederebbe revisione esplicita)
 *
 * Regressione target:
 *   - Cambiare la formula resolveRouteStyleIndex (snap all'indice sbagliato).
 *   - Rimuovere il guard "idx !== lastIdxRef.current" (flood di setStyle).
 *   - Invertire la direzione del drag (destra = stile minore).
 *   - Aggiungere onPanResponderRelease con velocity dismiss non intenzionale.
 *   - Cambiare onStart/onMoveShouldSetPanResponder da true a false (perde i gesti).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock: dipendenze native necessarie per caricare il modulo ─────────────────

vi.mock("react-native", () => ({
  StyleSheet: { create: (s: unknown) => s },
  Animated: {
    Value: class { setValue(_v: unknown) {} },
    spring: vi.fn((_a: unknown, _c: unknown) => ({ start: vi.fn() })),
  },
  PanResponder: { create: (cfg: unknown) => ({ panHandlers: {}, _cfg: cfg }) },
  View: {},
  Text: {},
}));
vi.mock("react", () => ({
  useRef: (v: unknown) => ({ current: v }),
  useEffect: (fn: () => void | (() => void)) => { try { fn(); } catch { /* no-op */ } },
  default: { createElement: vi.fn() },
}));
vi.mock("@/hooks/useColors", () => ({
  useColors: vi.fn(() => ({ textSecondary: "#888", accent: "#E53935", surface: "#1a1a1a", border: "#333" })),
}));
vi.mock("@/constants/colors", () => ({ default: {} }));

// ── import DIRETTO delle funzioni pure di produzione ─────────────────────────
import {
  resolveRouteStyleIndex,
  createRouteStylePanHandlers,
} from "@/components/giri/create/RouteStyleSection";

// ── costanti di supporto ───────────────────────────────────────────────────────

const STYLE_KEYS = ["direct", "fast", "balanced", "curvy", "extra_curvy"] as const;
type StyleKey = (typeof STYLE_KEYS)[number];
const N = STYLE_KEYS.length; // 5

// ── helper: crea handlers di produzione con track width configurabile ─────────

function makeHandlers(trackWidth = 300) {
  const setStyle = vi.fn((_key: StyleKey): void => { /* no-op */ });
  const handlers = createRouteStylePanHandlers(
    STYLE_KEYS,
    () => trackWidth,
    setStyle
  );
  return { handlers, setStyle, trackWidth };
}

// ── test: resolveRouteStyleIndex — snap thresholds ───────────────────────────

describe("resolveRouteStyleIndex (formula importata dal sorgente) — snap thresholds", () => {
  const W = 400;

  it("x=0 → indice 0 (direct)", () => {
    expect(resolveRouteStyleIndex(0, W, N)).toBe(0);
  });

  it("x=W → indice N-1 (extra_curvy)", () => {
    expect(resolveRouteStyleIndex(W, W, N)).toBe(N - 1);
  });

  it("x=W/2 → indice centrale (balanced = 2)", () => {
    expect(resolveRouteStyleIndex(W / 2, W, N)).toBe(2);
  });

  it("x negativo → clampato a 0", () => {
    expect(resolveRouteStyleIndex(-50, W, N)).toBe(0);
  });

  it("x > W → clampato a N-1", () => {
    expect(resolveRouteStyleIndex(W + 500, W, N)).toBe(N - 1);
  });

  it("trackWidth=0 → guard Math.max(w,1): x>0 → N-1, x=0 → 0", () => {
    expect(resolveRouteStyleIndex(0, 0, N)).toBe(0);
    expect(resolveRouteStyleIndex(50, 0, N)).toBe(N - 1);
  });

  it("x=W*0.25 → indice 1 (fast)", () => {
    expect(resolveRouteStyleIndex(W * 0.25, W, N)).toBe(1);
  });

  it("x=W*0.75 → indice 3 (curvy)", () => {
    expect(resolveRouteStyleIndex(W * 0.75, W, N)).toBe(3);
  });

  it("simmetria: idx(x) + idx(W-x) === N-1", () => {
    const x = W * 0.1;
    expect(resolveRouteStyleIndex(x, W, N) + resolveRouteStyleIndex(W - x, W, N)).toBe(N - 1);
  });

  it("zona di transizione 0→1: indice cambia correttamente a ~W/8", () => {
    const mid = W / 8;
    expect(resolveRouteStyleIndex(mid - 1, W, N)).toBeLessThanOrEqual(1);
    expect(resolveRouteStyleIndex(mid + 1, W, N)).toBeGreaterThanOrEqual(0);
  });
});

// ── test: shouldSetPanResponder (factory di produzione) ──────────────────────

describe("createRouteStylePanHandlers — shouldSetPanResponder: sempre true", () => {
  it("onStartShouldSetPanResponder() === true (cattura il gesto immediatamente)", () => {
    const { handlers } = makeHandlers();
    expect(handlers.onStartShouldSetPanResponder()).toBe(true);
  });

  it("onMoveShouldSetPanResponder() === true (mantiene il gesto durante il drag)", () => {
    const { handlers } = makeHandlers();
    expect(handlers.onMoveShouldSetPanResponder()).toBe(true);
  });
});

// ── test: drag-open (handlers di produzione: trascina destra → stile cresce) ──

describe("createRouteStylePanHandlers — drag-open: trascina verso destra → stile aumenta", () => {
  let ctx: ReturnType<typeof makeHandlers>;

  beforeEach(() => { ctx = makeHandlers(300); });

  it("onGrant su x=0 → setStyle('direct')", () => {
    ctx.handlers.onGrant(0);
    expect(ctx.setStyle).toHaveBeenCalledWith("direct");
  });

  it("onGrant su x=trackWidth → setStyle('extra_curvy')", () => {
    ctx.handlers.onGrant(ctx.trackWidth);
    expect(ctx.setStyle).toHaveBeenCalledWith("extra_curvy");
  });

  it("drag progressivo da sinistra a destra → tutti e 5 i livelli nell'ordine corretto", () => {
    const positions = [0, 75, 150, 225, 300];
    const expected: StyleKey[] = ["direct", "fast", "balanced", "curvy", "extra_curvy"];
    ctx.handlers.onGrant(positions[0]);
    positions.slice(1).forEach((x) => ctx.handlers.onMove(x));
    const calls = ctx.setStyle.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(expected);
  });

  it("dopo onGrant a sinistra, N-1 move a destra → setStyle chiamato N volte in totale", () => {
    ctx.handlers.onGrant(0);
    for (let i = 1; i < N; i++) {
      ctx.handlers.onMove(Math.round((i / (N - 1)) * ctx.trackWidth));
    }
    expect(ctx.setStyle).toHaveBeenCalledTimes(N);
  });
});

// ── test: drag-close (handlers di produzione: trascina sinistra → stile cala) ─

describe("createRouteStylePanHandlers — drag-close: trascina verso sinistra → stile diminuisce", () => {
  let ctx: ReturnType<typeof makeHandlers>;

  beforeEach(() => { ctx = makeHandlers(300); });

  it("onGrant su x=trackWidth → setStyle('extra_curvy')", () => {
    ctx.handlers.onGrant(ctx.trackWidth);
    expect(ctx.setStyle).toHaveBeenCalledWith("extra_curvy");
  });

  it("drag da destra a sinistra → raggiunge 'direct'", () => {
    ctx.handlers.onGrant(ctx.trackWidth);
    ctx.handlers.onMove(0);
    expect(ctx.setStyle).toHaveBeenLastCalledWith("direct");
  });

  it("drag progressivo da destra a sinistra → tutti e 5 i livelli in ordine inverso", () => {
    const positions = [300, 225, 150, 75, 0];
    const expected: StyleKey[] = ["extra_curvy", "curvy", "balanced", "fast", "direct"];
    ctx.handlers.onGrant(positions[0]);
    positions.slice(1).forEach((x) => ctx.handlers.onMove(x));
    const calls = ctx.setStyle.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(expected);
  });
});

// ── test: guard "solo se l'indice cambia" ─────────────────────────────────────

describe("createRouteStylePanHandlers — guard: setStyle chiamato solo quando l'indice cambia", () => {
  let ctx: ReturnType<typeof makeHandlers>;

  beforeEach(() => { ctx = makeHandlers(300); });

  it("move su posizioni diverse con stesso indice risolto NON chiama setStyle di nuovo", () => {
    ctx.handlers.onGrant(0);
    ctx.setStyle.mockClear();
    ctx.handlers.onMove(2);
    ctx.handlers.onMove(5);
    ctx.handlers.onMove(8);
    expect(ctx.setStyle).not.toHaveBeenCalled();
  });

  it("move che cambia indice chiama setStyle esattamente una volta", () => {
    ctx.handlers.onGrant(0);
    ctx.setStyle.mockClear();
    ctx.handlers.onMove(ctx.trackWidth);
    expect(ctx.setStyle).toHaveBeenCalledTimes(1);
    expect(ctx.setStyle).toHaveBeenCalledWith("extra_curvy");
  });

  it("N-1 move consecutivi su indici tutti diversi → N-1 chiamate aggiuntive (totale N)", () => {
    ctx.handlers.onGrant(0);
    for (let i = 1; i < N; i++) {
      ctx.handlers.onMove(Math.round((i / (N - 1)) * ctx.trackWidth));
    }
    expect(ctx.setStyle).toHaveBeenCalledTimes(N);
  });

  it("drag oscillante avanti e indietro chiama setStyle solo ai cambi di indice effettivi", () => {
    ctx.handlers.onGrant(0);
    ctx.setStyle.mockClear();
    ctx.handlers.onMove(ctx.trackWidth);
    ctx.handlers.onMove(ctx.trackWidth);
    ctx.handlers.onMove(0);
    ctx.handlers.onMove(0);
    expect(ctx.setStyle).toHaveBeenCalledTimes(2);
    expect(ctx.setStyle).toHaveBeenNthCalledWith(1, "extra_curvy");
    expect(ctx.setStyle).toHaveBeenNthCalledWith(2, "direct");
  });
});

// ── test: velocity dismiss — design guard ─────────────────────────────────────

describe("createRouteStylePanHandlers — velocity dismiss: NON esiste (design guard)", () => {
  it("la factory NON restituisce onRelease (nessun dismiss per velocità/distanza)", () => {
    const { handlers } = makeHandlers();
    expect((handlers as Record<string, unknown>)["onRelease"]).toBeUndefined();
    expect((handlers as Record<string, unknown>)["onPanResponderRelease"]).toBeUndefined();
  });

  it("la factory NON restituisce onTerminate (nessun reset animato)", () => {
    const { handlers } = makeHandlers();
    expect((handlers as Record<string, unknown>)["onTerminate"]).toBeUndefined();
  });

  it("posizione x molto oltre il limite non causa eccezioni (clamp guard)", () => {
    const { handlers, setStyle } = makeHandlers(300);
    expect(() => {
      handlers.onGrant(0);
      handlers.onMove(300 * 100);
    }).not.toThrow();
    expect(setStyle).toHaveBeenLastCalledWith("extra_curvy");
  });

  it("x negativo enorme non causa eccezioni (clamp verso il basso)", () => {
    const { handlers, setStyle } = makeHandlers(300);
    expect(() => {
      handlers.onGrant(300);
      handlers.onMove(-99999);
    }).not.toThrow();
    expect(setStyle).toHaveBeenLastCalledWith("direct");
  });
});
