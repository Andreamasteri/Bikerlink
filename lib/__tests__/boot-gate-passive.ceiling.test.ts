/**
 * Tests for resolveBootGateActive() ceiling behavior — Task #5159.
 *
 * Il modulo boot-gate-passive usa un ceiling di 3s (COMBINED_TIMEOUT_MS) come
 * guard di ultima istanza: se local+remote sono entrambi lenti (es. cold-boot
 * su device low-end), la promise risolve comunque a false invece di bloccare
 * l'avvio a tempo indeterminato.
 *
 * Scenari coperti:
 * (a) ceiling scatta prima di local+remote → false; activeSnapshot fissato a false
 *     (verifica secondary bug: in assenza della riga `activeSnapshot = false` nel
 *     setTimeout, lo snapshot resterebbe null → passiveCheckpoint continuerebbe a
 *     bufferizzare checkpoint post-boot)
 * (b) local risolve velocemente → ceiling cancellato prima di scattare, risultato
 *     corretto (local=true → active=true)
 * (c) remote risolve velocemente con utente admin → ceiling cancellato, active=true
 * (c2) remote acceso ma utente non-admin → guard admin blocca, active=false
 * (d) ceiling fissa activeSnapshot=false; il ramo inner che completa in ritardo
 *     NON può sovrascriverlo (guard `if (activeSnapshot === null)` nella inner)
 *
 * Strategy:
 * - vi.useFakeTimers() per controllare i setTimeout interni (local 2000ms fallback,
 *   remote AbortController 2500ms, ceiling 3000ms)
 * - Mock di @/lib/boot-gate-ping con flag controllabili per simulare hanging promises
 * - Mock di AsyncStorage per isCachedUserAdmin() e getBootGateRemoteMirror()
 * - vi.resetModules() prima di ogni import: le promise sono memoizzate a livello
 *   di modulo, quindi ogni test parte da uno stato pulito
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted state — accessibile nelle factory di vi.mock
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  let _localHangs = false;
  let _remoteMirrorHangs = false;
  let _manifestEnabled: boolean | null = false;
  let _pingCallCount = 0;

  return {
    store,
    isLocalHanging: () => _localHangs,
    setLocalHangs: (v: boolean) => {
      _localHangs = v;
    },
    isRemoteMirrorHanging: () => _remoteMirrorHangs,
    setRemoteMirrorHangs: (v: boolean) => {
      _remoteMirrorHangs = v;
    },
    getManifest: () => _manifestEnabled,
    setManifest: (v: boolean | null) => {
      _manifestEnabled = v;
    },
    getPingCount: () => _pingCallCount,
    incPingCount: () => {
      _pingCallCount++;
    },
    resetPingCount: () => {
      _pingCallCount = 0;
    },
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

// AsyncStorage: usato direttamente da boot-gate-passive.ts per isCachedUserAdmin()
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (k: string) =>
      Promise.resolve(h.store.has(k) ? (h.store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      h.store.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      h.store.delete(k);
      return Promise.resolve();
    },
  },
}));

vi.mock("@/lib/query-client", () => ({ getApiUrl: () => "http://test.local" }));

// boot-gate-ping: mock con promise controllabili per simulare hanging
vi.mock("@/lib/boot-gate-ping", () => ({
  isBootGateEnabledLocally: (): Promise<boolean> => {
    if (h.isLocalHanging()) return new Promise<boolean>(() => {});
    return Promise.resolve(h.store.get("__BOOT_GATE__") === "1");
  },
  getBootGateRemoteMirror: (): Promise<boolean | null> => {
    if (h.isRemoteMirrorHanging()) return new Promise<boolean | null>(() => {});
    const v = h.store.get("__BOOT_GATE_REMOTE__");
    if (v === undefined) return Promise.resolve(null);
    return Promise.resolve(v === "1" ? true : false);
  },
  setBootGateRemoteMirror: (v: boolean): Promise<void> => {
    h.store.set("__BOOT_GATE_REMOTE__", v ? "1" : "0");
    return Promise.resolve();
  },
  pingBootGate: (): Promise<void> => {
    h.incPingCount();
    return Promise.resolve();
  },
}));

// ---------------------------------------------------------------------------
// Helper: fetch stub che risponde al segnale di abort
// ---------------------------------------------------------------------------
function stubFetch() {
  vi.stubGlobal("fetch", (_url: string, opts?: RequestInit): Promise<Response> => {
    const manifest = h.getManifest();
    if (manifest === null) {
      // Offline: il fetch pende finché il segnale di abort non scatta
      return new Promise<Response>((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }
      });
    }
    return Promise.resolve({
      json: () => Promise.resolve({ bootGateEnabled: manifest }),
    } as Response);
  });
}

const CACHED_USER_KEY = "@bikerlink/cached_user";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("resolveBootGateActive — ceiling di 3s (Task #5159)", () => {
  beforeEach(() => {
    h.store.clear();
    h.setLocalHangs(false);
    h.setRemoteMirrorHangs(false);
    h.setManifest(false);
    h.resetPingCount();
    vi.useFakeTimers();
    stubFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // (a) Scenario principale: ceiling vince
  // -------------------------------------------------------------------------
  it("(a) ceiling fires quando local e remote sono entrambi lenti → risolve false", async () => {
    // Local: isBootGateEnabledLocally pende; il fallback interno 2000ms risolve a false
    h.setLocalHangs(true);
    // Remote: fetch offline → catch block → getBootGateRemoteMirror pende → mai risolve
    h.setManifest(null);
    h.setRemoteMirrorHangs(true);

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    // Avanza oltre il ceiling (3000ms):
    //   2000ms → fallback locale scatta → resolveLocal = false
    //   2500ms → AbortController scatta → fetch rifiuta → catch → getRemoteMirror pende
    //   3000ms → ceiling scatta → risolve false
    await vi.advanceTimersByTimeAsync(3001);
    const result = await promise;

    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (a2) Verifica secondary bug: activeSnapshot fissato a false dal ceiling
  //      → passiveCheckpoint() è no-op (non buferizza, non pinga)
  // -------------------------------------------------------------------------
  it("(a2) ceiling fissa activeSnapshot=false → passiveCheckpoint è no-op dopo il ceiling", async () => {
    h.setLocalHangs(true);
    h.setManifest(null);
    h.setRemoteMirrorHangs(true);

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    await vi.advanceTimersByTimeAsync(3001);
    await promise; // ceiling: false, activeSnapshot = false

    // Se activeSnapshot NON fosse stato fissato (bug), passiveCheckpoint lo
    // troverebbe null e bufferizzerebbe → avvierebbe flushPending → pinga.
    // Con il fix, activeSnapshot = false → return immediato senza ping.
    h.resetPingCount();
    mod.passiveCheckpoint("post-ceiling-step");

    // Flush microtask per catturare eventuali ping asincroni
    await vi.advanceTimersByTimeAsync(10);

    expect(h.getPingCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // (b) Local risolve velocemente → ceiling cancellato, nessun falso negative
  // -------------------------------------------------------------------------
  it("(b) local risolve velocemente → ceiling cancellato, risultato = true", async () => {
    h.store.set("__BOOT_GATE__", "1"); // flag locale attivo
    h.setLocalHangs(false);
    h.setManifest(false); // remote spento

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    // Avanza 100ms: sufficiente per le microtask senza toccare il ceiling (3000ms)
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe(true);
  });

  it("(b2) local risolve velocemente con flag=false → ceiling non necessario, false corretto", async () => {
    h.setLocalHangs(false); // flag locale assente → false immediato
    h.setManifest(false);

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (c) Remote risolve velocemente con utente admin → ceiling cancellato
  // -------------------------------------------------------------------------
  it("(c) remote acceso + utente admin → ceiling cancellato, risultato = true", async () => {
    h.setLocalHangs(false);
    h.setManifest(true); // bootGateEnabled = true dal server
    h.store.set(CACHED_USER_KEY, JSON.stringify({ role: "admin" }));

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe(true);
  });

  // -------------------------------------------------------------------------
  // (c2) Guard admin: remote acceso ma utente non-admin → false
  // -------------------------------------------------------------------------
  it("(c2) remote acceso ma utente non-admin → guard admin blocca, risultato = false", async () => {
    h.setLocalHangs(false);
    h.setManifest(true);
    // Nessun utente in cache → isCachedUserAdmin() → false

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe(false);
  });

  it("(c3) remote acceso ma utente user normale → guard admin blocca, risultato = false", async () => {
    h.setLocalHangs(false);
    h.setManifest(true);
    h.store.set(CACHED_USER_KEY, JSON.stringify({ role: "user" }));

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (d) inner che completa in ritardo NON sovrascrive activeSnapshot già fissato
  // -------------------------------------------------------------------------
  it("(d) activeSnapshot fissato dal ceiling non è sovrascrivibile da inner tardivo", async () => {
    // Stessa setup del test (a): ceiling vince a 3000ms
    h.setLocalHangs(true);
    h.setManifest(null);
    h.setRemoteMirrorHangs(true);

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");
    const promise = mod.resolveBootGateActive();

    await vi.advanceTimersByTimeAsync(3001);
    const result = await promise;
    expect(result).toBe(false); // ceiling ha vinto

    // Sblocca il mirror remoto: la inner (se non già completata) potrebbe avanzare
    h.setRemoteMirrorHangs(false);
    await vi.advanceTimersByTimeAsync(100);

    // Chiama passiveCheckpoint: se activeSnapshot fosse diventato null o true
    // (sovrascrittura anomala), il checkpoint verrebbe bufferizzato e pingato.
    // Se activeSnapshot = false (corretto), è no-op.
    h.resetPingCount();
    mod.passiveCheckpoint("after-inner-completion");
    await vi.advanceTimersByTimeAsync(10);

    expect(h.getPingCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // (e) memoizzazione: chiamate multiple a resolveBootGateActive() restituiscono
  //     la stessa promise (nessun timer extra, nessun fetch extra)
  // -------------------------------------------------------------------------
  it("(e) chiamate multiple a resolveBootGateActive() condividono la stessa promise", async () => {
    h.setLocalHangs(false);
    h.setManifest(false);

    vi.resetModules();
    const mod = await import("@/lib/boot-gate-passive");

    const p1 = mod.resolveBootGateActive();
    const p2 = mod.resolveBootGateActive();
    const p3 = mod.resolveBootGateActive();

    // Devono essere la stessa referenza (memoizzazione)
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);

    await vi.advanceTimersByTimeAsync(100);
    await p1;
  });
});
