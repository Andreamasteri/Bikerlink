/**
 * Task #4597 — Regressione del resume/reconnect (lib/online-focus-manager.ts).
 *
 * React Native non ha né `navigator.onLine` né `visibilitychange`, quindi la
 * decisione online/offline e il relancio dei flussi non-React-Query al ritorno
 * della rete sono logica nostra. Qui copriamo:
 *   • `isStateOnline`: lo stato `null`/sconosciuto (emesso brevemente al boot)
 *     deve contare come ONLINE; solo `isConnected === false` ci porta offline.
 *   • il percorso debounced `subscribeReconnect`/`notifyReconnect`: alla
 *     transizione offline→online i listener devono scattare UNA sola volta,
 *     debounced contro il flapping della connettività.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Cattura il listener registrato su NetInfo così possiamo emettere stati a mano.
let netInfoListener: ((state: { isConnected: boolean | null }) => void) | null = null;
const setOnlineSpy = vi.fn();

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: (listener: (state: { isConnected: boolean | null }) => void) => {
      netInfoListener = listener;
      return () => {
        netInfoListener = null;
      };
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  // setEventListener invoca subito la callback con il nostro setOnline finto:
  // questo fa registrare il listener NetInfo dentro initOnlineFocusManager.
  onlineManager: {
    setEventListener: (cb: (setOnline: (v: boolean) => void) => unknown) => {
      cb(setOnlineSpy);
    },
  },
  focusManager: {
    setFocused: vi.fn(),
  },
}));

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn() },
  Platform: { OS: "ios" },
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: {
    setQueryDefaults: vi.fn(),
  },
}));

import { isStateOnline, subscribeReconnect, initOnlineFocusManager } from "@/lib/online-focus-manager";

describe("isStateOnline", () => {
  it("tratta `null` (stato sconosciuto al boot) come ONLINE", () => {
    expect(isStateOnline(null)).toBe(true);
  });

  it("tratta `false` (disconnesso esplicito) come OFFLINE", () => {
    expect(isStateOnline(false)).toBe(false);
  });

  it("tratta `true` (connesso) come ONLINE", () => {
    expect(isStateOnline(true)).toBe(true);
  });
});

describe("subscribeReconnect / notifyReconnect (debounced)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnlineSpy.mockClear();
    // Wira i manager una sola volta (init è idempotente per l'intero processo).
    initOnlineFocusManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function emit(isConnected: boolean | null) {
    netInfoListener?.({ isConnected });
  }

  it("registra il listener NetInfo e propaga lo stato online a setOnline", () => {
    expect(netInfoListener).not.toBeNull();
    emit(false);
    expect(setOnlineSpy).toHaveBeenLastCalledWith(false);
    emit(true);
    expect(setOnlineSpy).toHaveBeenLastCalledWith(true);
  });

  it("scatta i listener UNA sola volta alla transizione offline→online dopo il debounce", () => {
    const cb = vi.fn();
    const unsub = subscribeReconnect(cb);

    emit(false); // offline
    emit(true); // online → arma il debounce
    expect(cb).not.toHaveBeenCalled(); // non ancora: è debounced

    vi.advanceTimersByTime(600);
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("collassa il flapping rapido in un singolo notify (debounce)", () => {
    const cb = vi.fn();
    const unsub = subscribeReconnect(cb);

    emit(false);
    emit(true); // arma
    emit(false);
    emit(true); // ri-arma (resetta il timer)
    vi.advanceTimersByTime(300); // non ancora scaduto
    emit(false);
    emit(true); // ri-arma di nuovo

    vi.advanceTimersByTime(600);
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("NON notifica se non c'è una transizione offline→online (resta online)", () => {
    const cb = vi.fn();
    const unsub = subscribeReconnect(cb);

    emit(true); // già online → nessuna transizione
    emit(true);
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();

    unsub();
  });

  it("dopo unsubscribe il listener non viene più chiamato", () => {
    const cb = vi.fn();
    const unsub = subscribeReconnect(cb);
    unsub();

    emit(false);
    emit(true);
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it("un listener che lancia non blocca gli altri", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const unsubBad = subscribeReconnect(bad);
    const unsubGood = subscribeReconnect(good);

    emit(false);
    emit(true);
    vi.advanceTimersByTime(600);

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);

    unsubBad();
    unsubGood();
  });
});
