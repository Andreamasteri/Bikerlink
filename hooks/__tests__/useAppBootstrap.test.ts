/**
 * Test di robustezza dell'avvio a freddo (cold start) per useAppBootstrap.
 *
 * Obiettivo: garantire che l'app passi SEMPRE a uno stato renderizzabile e non
 * resti appesa sullo splash (causa potenziale della chiusura automatica al cold
 * start). Verifica i percorsi protetti da timeout introdotti nel fix di
 * robustezza:
 *
 *   1. initSessionToken che si blocca → tokenReady viene comunque sbloccato dopo
 *      TOKEN_INIT_TIMEOUT_MS (3s).
 *   2. Fonts che non caricano entro SPLASH_SAFETY_TIMEOUT_MS (5s) → lo splash si
 *      apre in stato degradato (ready=true, SplashScreen.hideAsync chiamato,
 *      beacon "splash_safety_timeout").
 *   3. Fonts che caricano (o falliscono) → lo splash si apre subito senza
 *      attendere il timeout di sicurezza.
 *   4. La pulizia dello storage legacy gira SOLO dopo "ready" (fuori dal percorso
 *      critico) e un suo blocco non impedisce all'app di diventare interattiva.
 *
 * Strategia:
 *   - Il hook viene montato con react-test-renderer (reconciler React reale, gira
 *     in Node senza DOM) così useState/useEffect/setTimeout hanno il comportamento
 *     di produzione.
 *   - vi.useFakeTimers() + advanceTimersByTimeAsync() controllano i timeout
 *     deterministicamente e drenano le microtask tra un timer e l'altro.
 *   - Le dipendenze native (fonts, splash, InteractionManager) e i moduli lib
 *     sono mockati e configurabili per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: @expo-google-fonts/inter (stato fonts controllabile per test) ──────
const fontState = vi.hoisted(
  () => ({ value: [false, null] as [boolean, Error | null] })
);
vi.mock("@expo-google-fonts/inter", () => ({
  useFonts: () => fontState.value,
  Inter_400Regular: "Inter_400Regular",
  Inter_500Medium: "Inter_500Medium",
  Inter_600SemiBold: "Inter_600SemiBold",
  Inter_700Bold: "Inter_700Bold",
}));

// ── mock: expo-splash-screen ─────────────────────────────────────────────────
const hideAsync = vi.hoisted(() => vi.fn());
vi.mock("expo-splash-screen", () => ({ hideAsync }));

// ── mock: react-native (InteractionManager) ─────────────────────────────────
// runAfterInteractions pianifica il callback su un setTimeout(0) controllato dai
// fake timers: così il purge differito è osservabile in modo deterministico.
vi.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => {
      const id = setTimeout(cb, 0);
      return { cancel: () => clearTimeout(id) };
    },
  },
}));

// ── mock: @/lib/startup-beacon ───────────────────────────────────────────────
const sendStartupBeacon = vi.hoisted(() => vi.fn());
const recoverLastBeacon = vi.hoisted(() => vi.fn());
vi.mock("@/lib/startup-beacon", () => ({ sendStartupBeacon, recoverLastBeacon }));

// ── mock: @/lib/storage-recovery ─────────────────────────────────────────────
const purgeLegacyGpsBuffer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage-recovery", () => ({ purgeLegacyGpsBuffer }));

// ── mock: @/lib/query-client ─────────────────────────────────────────────────
const initSessionToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query-client", () => ({ initSessionToken }));

// ── import del modulo sotto test (DOPO i mock) ──────────────────────────────
import { useAppBootstrap } from "../useAppBootstrap";

// ── probe: cattura il valore restituito dal hook ────────────────────────────
let last: ReturnType<typeof useAppBootstrap> | null = null;
function Probe() {
  last = useAppBootstrap();
  return null;
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fontState.value = [false, null];
  initSessionToken.mockResolvedValue("token-cached");
  recoverLastBeacon.mockResolvedValue(undefined);
  purgeLegacyGpsBuffer.mockResolvedValue(0);
  hideAsync.mockResolvedValue(undefined);
  last = null;
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
  vi.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════════════
// 1 — Token init bloccato → tokenReady sbloccato via timeout (3s)
// ══════════════════════════════════════════════════════════════════════════
describe("useAppBootstrap — token init protetto da timeout", () => {
  it("sblocca tokenReady dopo 3s anche se initSessionToken non si risolve mai", async () => {
    // initSessionToken resta appeso (storage saturo/lento al cold start)
    initSessionToken.mockReturnValue(new Promise<string | null>(() => {}));
    fontState.value = [true, null]; // isola il percorso token dal gate fonts

    await mount();
    expect(last!.tokenReady).toBe(false);

    await advance(3000);
    expect(last!.tokenReady).toBe(true);
  });

  it("imposta tokenReady appena initSessionToken si risolve normalmente", async () => {
    fontState.value = [true, null];
    await mount();
    // initSessionToken risolve via microtask: già pronto dopo il mount async
    expect(last!.tokenReady).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2 — Fonts lenti → splash apre in stato degradato dopo 5s
// ══════════════════════════════════════════════════════════════════════════
describe("useAppBootstrap — gate fonts con timeout di sicurezza (5s)", () => {
  it("non apre lo splash prima del timeout se i fonts non caricano", async () => {
    fontState.value = [false, null];
    await mount();

    expect(last!.ready).toBe(false);
    expect(hideAsync).not.toHaveBeenCalled();
  });

  it("apre lo splash in stato degradato allo scadere dei 5s", async () => {
    fontState.value = [false, null];
    await mount();
    expect(last!.ready).toBe(false);

    await advance(5000);

    expect(last!.ready).toBe(true);
    expect(sendStartupBeacon).toHaveBeenCalledWith("splash_safety_timeout");
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it("apre lo splash subito quando i fonts caricano, senza timeout", async () => {
    fontState.value = [true, null];
    await mount();

    expect(last!.ready).toBe(true);
    expect(sendStartupBeacon).toHaveBeenCalledWith("fonts_ready");
    expect(sendStartupBeacon).not.toHaveBeenCalledWith("splash_safety_timeout");
  });

  it("apre lo splash anche se il caricamento dei fonts fallisce (fontError)", async () => {
    fontState.value = [false, new Error("font load failed")];
    await mount();

    expect(last!.ready).toBe(true);
    expect(sendStartupBeacon).toHaveBeenCalledWith("fonts_ready");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3 — Pulizia storage legacy: solo DOPO ready, fuori dal percorso critico
// ══════════════════════════════════════════════════════════════════════════
describe("useAppBootstrap — pulizia storage legacy differita", () => {
  it("NON esegue purgeLegacyGpsBuffer finché l'app non è ready", async () => {
    fontState.value = [false, null]; // resta non-ready
    await mount();

    expect(last!.ready).toBe(false);
    expect(purgeLegacyGpsBuffer).not.toHaveBeenCalled();
  });

  it("esegue purgeLegacyGpsBuffer solo dopo che l'app è ready", async () => {
    fontState.value = [false, null];
    await mount();
    expect(purgeLegacyGpsBuffer).not.toHaveBeenCalled();

    // apre il gate via timeout di sicurezza, poi lascia girare runAfterInteractions
    await advance(5000);
    expect(last!.ready).toBe(true);
    await advance(0);

    expect(purgeLegacyGpsBuffer).toHaveBeenCalledTimes(1);
  });

  it("un purge bloccato non impedisce all'app di restare interattiva", async () => {
    // purge appeso: gira fuori dal percorso critico, non deve toccare ready
    purgeLegacyGpsBuffer.mockReturnValue(new Promise<number>(() => {}));
    fontState.value = [true, null];

    await mount();
    expect(last!.ready).toBe(true);

    await advance(0); // avvia il purge (che resta appeso)
    expect(purgeLegacyGpsBuffer).toHaveBeenCalledTimes(1);
    // l'app resta interattiva nonostante il purge non si concluda
    expect(last!.ready).toBe(true);
  });
});
