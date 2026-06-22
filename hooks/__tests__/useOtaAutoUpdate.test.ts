/**
 * Test E2E del flusso OTA: pending → skip auto-apply, approved → auto-apply,
 * Prova OTA → download diretto, cold start admin con pending → non applicata.
 *
 * Strategia:
 *  - React (useEffect, useRef) è mockato per eseguire l'effect in modo sincrono
 *    nel corpo del test, senza JSDOM o mounting del componente.
 *  - expo-updates, react-native, expo-device, AsyncStorage e fetch sono tutti
 *    sostituiti da mock vitest controllabili per test.
 *  - `__DEV__` è impostato a false dal vitest.config.ts (define block).
 *  - Dopo aver chiamato il hook si attende un tick tramite
 *    `await flushPromises()` per consentire all'IIFE asincrona interna
 *    di completarsi prima degli assert.
 *  - authFetchHeaders è hoistato e configurabile per test: il test di
 *    cold start admin verifica che il token di sessione da AsyncStorage
 *    venga passato come header Authorization al manifest fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── helpers ────────────────────────────────────────────────────────────────
// Il check OTA Step B aspetta che l'app sia interattiva (waitUntilInteractive:
// InteractionManager.runAfterInteractions + OTA_STARTUP_DELAY_MS = 4s) prima di
// toccare EAS o chiamare reloadAsync. Con i fake timers avanziamo oltre quel
// ritardo per far completare il flusso, drenando le microtask tra i timer.
const OTA_STARTUP_DELAY_MS = 4000;
/** Avanza i timer oltre il gate "interactive" e drena le microtask in mezzo. */
const flushPromises = () => vi.advanceTimersByTimeAsync(OTA_STARTUP_DELAY_MS + 1000);

// ── mock: expo-updates ─────────────────────────────────────────────────────
const checkForUpdateAsync = vi.hoisted(() => vi.fn());
const fetchUpdateAsync = vi.hoisted(() => vi.fn());
const reloadAsync = vi.hoisted(() => vi.fn());

vi.mock("expo-updates", () => ({
  checkForUpdateAsync,
  fetchUpdateAsync,
  reloadAsync,
  isEnabled: true,
  updateId: null,
  runtimeVersion: "54.10.27",
}));

// ── mock: react-native ─────────────────────────────────────────────────────
// InteractionManager.runAfterInteractions pianifica il callback su un
// setTimeout(0) controllato dai fake timers: combinato con il successivo
// OTA_STARTUP_DELAY_MS questo rende osservabile il gate "interactive" del
// check OTA Step B (deve attendere prima di toccare EAS / reloadAsync).
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => {
      const id = setTimeout(cb, 0);
      return { cancel: () => clearTimeout(id) };
    },
  },
}));

// ── mock: expo-device ─────────────────────────────────────────────────────
vi.mock("expo-device", () => ({
  modelName: "iPhone 15 Pro",
}));

// ── mock: AsyncStorage ─────────────────────────────────────────────────────
const asyncStorageGetItem = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const asyncStorageSetItem = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const asyncStorageRemoveItem = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: asyncStorageGetItem,
    setItem: asyncStorageSetItem,
    removeItem: asyncStorageRemoveItem,
  },
}));

// ── mock: @/lib/query-client ───────────────────────────────────────────────
// authFetchHeaders è hoistato e vi.fn() per consentire ai singoli test di
// sovrascrivere il valore di ritorno (es. per iniettare un Bearer token admin).
// getSessionToken è hoistato per simulare il token salvato in cache al cold start.
const authFetchHeadersMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({ "Content-Type": "application/json" })
);
const getSessionTokenMock = vi.hoisted(() => vi.fn<() => string | null>().mockReturnValue(null));

vi.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://localhost:5000",
  authFetchHeaders: authFetchHeadersMock,
  getSessionToken: getSessionTokenMock,
}));

// ── mock: react ────────────────────────────────────────────────────────────
// useEffect esegue il callback immediatamente (sincrono); useRef restituisce
// un oggetto mutabile per test con valore iniziale fresco ad ogni chiamata.
vi.mock("react", () => ({
  useEffect: (fn: () => void | (() => void)) => { fn(); },
  useRef: (initial: unknown) => ({ current: initial }),
}));

// ── import del modulo sotto test (DOPO i mock) ────────────────────────────
import { useOtaAutoUpdate, performDirectOtaUpdate } from "../useOtaAutoUpdate";

// ── helpers per costruire risposte fetch ───────────────────────────────────
function makeManifestResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      allowed: true,
      isAdmin: false,
      releaseId: "release-abc",
      allowedEasUpdateId: "eas-upd-001",
      allowedEasGroupId: "grp-001",
      allowedEasUpdateIds: ["eas-upd-001"],
      runtimeVersion: "54.10.27",
      otaVersion: "54.10.1",
      ...overrides,
    }),
  };
}

function makeNotOkFetch() {
  return { ok: false, json: async () => ({}) };
}

// ── setup ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  // Fake timers: il gate "interactive" (runAfterInteractions + delay 4s) e i
  // setTimeout interni (boot_success 8s) sono così controllabili e deterministici.
  vi.useFakeTimers();
  vi.clearAllMocks();

  // Valori di default per i mock di expo-updates
  checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
  fetchUpdateAsync.mockResolvedValue({ isNew: false });
  reloadAsync.mockResolvedValue(undefined);

  // authFetchHeaders: header anonimi di default
  authFetchHeadersMock.mockReturnValue({ "Content-Type": "application/json" });

  // getSessionToken: nessun token di sessione di default (utente non loggato)
  getSessionTokenMock.mockReturnValue(null);

  // AsyncStorage: nessun deviceId né token salvato di default
  asyncStorageGetItem.mockResolvedValue(null);
  asyncStorageSetItem.mockResolvedValue(undefined);
  asyncStorageRemoveItem.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════════════
// Test 0 — Step B aspetta che l'app sia interattiva prima di toccare EAS
//          (anti-crash cold start: niente check/fetch/reload durante lo splash).
// ══════════════════════════════════════════════════════════════════════════
describe("useOtaAutoUpdate — Step B aspetta 'interactive' prima di EAS/reload", () => {
  it("non contatta manifest/EAS prima dello scadere del ritardo interactive", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeManifestResponse({ status: "approved" }));
    checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

    useOtaAutoUpdate(true);

    // Fa girare runAfterInteractions (setTimeout 0) ma NON il ritardo di 4s:
    // a questo punto il check OTA non deve ancora aver toccato la rete o EAS.
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(checkForUpdateAsync).not.toHaveBeenCalled();
    expect(reloadAsync).not.toHaveBeenCalled();

    // Allo scadere del ritardo interactive il flusso riprende e contatta EAS.
    await vi.advanceTimersByTimeAsync(OTA_STARTUP_DELAY_MS + 100);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Test 1 — OTA pending: il hook NON deve chiamare checkForUpdateAsync
// ══════════════════════════════════════════════════════════════════════════
describe("useOtaAutoUpdate — manifest.status === 'pending'", () => {
  it("salta auto-apply e non chiama checkForUpdateAsync", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeManifestResponse({ status: "pending" }));

    useOtaAutoUpdate();
    await flushPromises();

    expect(checkForUpdateAsync).not.toHaveBeenCalled();
    expect(fetchUpdateAsync).not.toHaveBeenCalled();
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it("ritorna { checking: false } senza lanciare eccezioni", () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeManifestResponse({ status: "pending" }));

    const result = useOtaAutoUpdate();

    expect(result).toEqual({ checking: false });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Test 2 — OTA approved: il hook DEVE procedere normalmente
// ══════════════════════════════════════════════════════════════════════════
describe("useOtaAutoUpdate — manifest.status === 'approved'", () => {
  it("chiama checkForUpdateAsync quando la release è approvata", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeManifestResponse({ status: "approved" }));
    checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

    useOtaAutoUpdate(true);
    await flushPromises();

    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it("scarica e applica l'update quando disponibile", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeManifestResponse({
        status: "approved",
        allowedEasUpdateId: "eas-upd-approved",
        allowedEasGroupId: "grp-approved",
      })
    );

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-approved", group: "grp-approved" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });

    useOtaAutoUpdate(true);
    await flushPromises();

    expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("non scarica se il groupId restituito da EAS non è quello autorizzato", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeManifestResponse({
        status: "approved",
        allowedEasGroupId: "grp-001",
      })
    );

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-999", group: "grp-ALTRO" },
    });

    useOtaAutoUpdate();
    await flushPromises();

    expect(fetchUpdateAsync).not.toHaveBeenCalled();
    expect(reloadAsync).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Test 3 — "Prova OTA": download diretto indipendentemente da manifest.status
// ══════════════════════════════════════════════════════════════════════════
describe("performDirectOtaUpdate — contratto 'Prova OTA'", () => {
  it("chiama fetchUpdateAsync direttamente senza contattare il manifest", async () => {
    globalThis.fetch = vi.fn();
    fetchUpdateAsync.mockResolvedValue({ isNew: true });

    const result = await performDirectOtaUpdate();

    // Il manifest NON viene contattato (nessuna chiamata HTTP verso /api/ota/manifest)
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // fetchUpdateAsync viene chiamato subito, indipendentemente dallo status
    expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(result.isNew).toBe(true);
  });

  it("funziona anche con release in stato pending (bypassa il gating del hook)", async () => {
    // Se il manifest fosse pending, useOtaAutoUpdate skipperebbe — ma performDirectOtaUpdate no
    globalThis.fetch = vi.fn().mockResolvedValue(makeManifestResponse({ status: "pending" }));

    // Il hook skippa la pending correttamente
    useOtaAutoUpdate();
    await flushPromises();
    expect(checkForUpdateAsync).not.toHaveBeenCalled();

    // Ora simuliamo il click "Prova OTA": fetchUpdateAsync viene chiamato direttamente
    vi.clearAllMocks();
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    const result = await performDirectOtaUpdate();
    expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(result.isNew).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Test 4 — Cold start admin: token di sessione in AsyncStorage + OTA pending
//          → la pending NON deve essere auto-applicata, ma il token DEVE
//          essere incluso nella chiamata al manifest (path auth admin).
// ══════════════════════════════════════════════════════════════════════════
describe("useOtaAutoUpdate — cold start con sessione admin e OTA pending", () => {
  it("invia il token admin nell'header Authorization e non auto-applica la pending", async () => {
    // Simula: admin con token di sessione già salvato in AsyncStorage (cold start)
    const adminToken = "admin-session-token-cold-start-abc";

    // authFetchHeaders ritorna il Bearer token (come farebbe il modulo reale
    // dopo aver letto il SESSION_TOKEN_KEY da AsyncStorage e cachato in memoria)
    authFetchHeadersMock.mockReturnValue({
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    });

    // Il server vede il token admin → risponde con pending (visibile agli admin)
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeManifestResponse({ status: "pending", isAdmin: true })
    );

    useOtaAutoUpdate(true);
    await flushPromises();

    // Verifica che il manifest fetch sia stato chiamato con il token admin
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, fetchOptions] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      { headers: Record<string, string> }
    ];
    expect(fetchOptions.headers.Authorization).toBe(`Bearer ${adminToken}`);

    // Anche con credenziali admin la pending NON viene auto-applicata
    expect(checkForUpdateAsync).not.toHaveBeenCalled();
    expect(fetchUpdateAsync).not.toHaveBeenCalled();
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it("non applica la pending neanche se AsyncStorage contiene un pending_release_id", async () => {
    asyncStorageGetItem.mockImplementation(async (key: string) => {
      if (key === "@bikerlink/ota_pending_release_id") return "release-pending-123";
      return null;
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      makeManifestResponse({ status: "pending", isAdmin: true })
    );

    useOtaAutoUpdate();
    await flushPromises();

    expect(checkForUpdateAsync).not.toHaveBeenCalled();
    expect(fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("non auto-applica se il manifest restituisce allowed=false (utente non autorizzato)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: false }),
    });

    useOtaAutoUpdate();
    await flushPromises();

    expect(checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it("non auto-applica se il manifest HTTP fallisce (rete assente al cold start)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeNotOkFetch());

    useOtaAutoUpdate();
    await flushPromises();

    expect(checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it("non auto-applica se fetch lancia un'eccezione (timeout, DNS fail)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network request failed"));

    useOtaAutoUpdate();
    await flushPromises();

    expect(checkForUpdateAsync).not.toHaveBeenCalled();
  });
});
