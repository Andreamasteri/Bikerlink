/**
 * Regressione attivazione BootGate (Task #4979).
 *
 * Modulo sotto test: lib/boot-gate-passive.ts → resolveBootGateActive().
 *
 * Bug target (finding review #5): il flag remoto veniva "latchato" nel flag locale
 * manuale (sticky-ON) e mai ripulito → lo "Disattiva" admin non si propagava: il
 * device restava BootGate-attivo per sempre. Il fix separa due sorgenti:
 *   - override MANUALE (`__BOOT_GATE__`): sticky, mai toccato dal remoto;
 *   - specchio REMOTO (`__BOOT_GATE_REMOTE__`): SIMMETRICO (true/false), solo
 *     fallback offline; riflette anche lo spegnimento remoto.
 * Attivazione = manuale OR remoto-effettivo.
 *
 * Ogni "avvio" = vi.resetModules() + re-import del modulo (le promise sono
 * memoizzate a livello di modulo); lo store AsyncStorage è in vi.hoisted così
 * persiste TRA gli avvii, come la memoria persistente reale del device.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  // null = il fetch del manifest fallisce (offline/timeout).
  let manifestEnabled: boolean | null = false;
  return {
    store,
    getManifest: () => manifestEnabled,
    setManifest: (v: boolean | null) => {
      manifestEnabled = v;
    },
  };
});

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

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

const MANUAL_KEY = "__BOOT_GATE__";
const REMOTE_MIRROR_KEY = "__BOOT_GATE_REMOTE__";
// Chiave usata da isCachedUserAdmin() in boot-gate-passive.ts (guard admin-only
// aggiunto in Task #5065). I test che prevedono attivazione remota richiedono
// un utente admin in cache.
const CACHED_USER_KEY = "@bikerlink/cached_user";

async function boot(): Promise<boolean> {
  vi.resetModules();
  const mod = await import("@/lib/boot-gate-passive");
  return mod.resolveBootGateActive();
}

describe("resolveBootGateActive — precedenza e propagazione toggle remoto", () => {
  beforeEach(() => {
    h.store.clear();
    h.setManifest(false);
    // Guard admin-only (Task #5065): il flag remoto attiva il gate SOLO se
    // l'utente cachato è admin. I test di questa suite verificano la propagazione
    // del toggle remoto, quindi l'utente admin è sempre presente in cache.
    h.store.set(CACHED_USER_KEY, JSON.stringify({ role: "admin" }));
    vi.stubGlobal("fetch", () => {
      const enabled = h.getManifest();
      if (enabled === null) {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve({
        json: () => Promise.resolve({ bootGateEnabled: enabled }),
      } as Response);
    });
  });

  it("override manuale vince anche con remoto spento (sticky locale)", async () => {
    h.store.set(MANUAL_KEY, "1");
    h.setManifest(false);
    expect(await boot()).toBe(true);
  });

  it("remoto acceso attiva e persiste lo specchio a '1'", async () => {
    h.setManifest(true);
    expect(await boot()).toBe(true);
    expect(h.store.get(REMOTE_MIRROR_KEY)).toBe("1");
  });

  it("lo spegnimento remoto si propaga al boot successivo (no latch sticky-ON)", async () => {
    // Boot A: admin accende → attivo, specchio "1".
    h.setManifest(true);
    expect(await boot()).toBe(true);
    expect(h.store.get(REMOTE_MIRROR_KEY)).toBe("1");
    // Boot B: admin "Disattiva" → il device DEVE spegnersi (nessun manuale settato).
    h.setManifest(false);
    expect(await boot()).toBe(false);
    expect(h.store.get(REMOTE_MIRROR_KEY)).toBe("0");
  });

  it("offline ricade sull'ultimo valore remoto noto (specchio '1')", async () => {
    // Boot A online: remoto acceso → specchio "1".
    h.setManifest(true);
    expect(await boot()).toBe(true);
    // Boot B offline: fetch fallisce → fallback allo specchio "1".
    h.setManifest(null);
    expect(await boot()).toBe(true);
  });

  it("offline dopo uno spegnimento remoto resta spento (specchio '0')", async () => {
    // Boot A online: remoto spento → specchio "0".
    h.setManifest(false);
    expect(await boot()).toBe(false);
    expect(h.store.get(REMOTE_MIRROR_KEY)).toBe("0");
    // Boot B offline: fetch fallisce → fallback allo specchio "0" (spento).
    h.setManifest(null);
    expect(await boot()).toBe(false);
  });

  it("offline senza alcuno specchio né manuale → spento (default)", async () => {
    h.setManifest(null);
    expect(await boot()).toBe(false);
  });
});
