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

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── helpers ────────────────────────────────────────────────────────────────
/** Drena la coda delle microtask e i Promise già risolti. */
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

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
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
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

// ══════════════════════════════════════════════════════════════════════════
// Test 5 — postOtaEvent: sessionToken nel body al cold start pre-login.
//
//   Quando authFetchHeaders() NON restituisce Authorization (utente non
//   ancora loggato), postOtaEvent deve includere il token restituito da
//   getSessionToken() nel body JSON della chiamata POST /api/ota/event.
//   Quando Authorization è presente, sessionToken NON deve comparire nel body.
// ══════════════════════════════════════════════════════════════════════════
describe("postOtaEvent — sessionToken fallback nel body al cold start pre-login", () => {
  /** Manifest "approved" che consente il download della OTA */
  function approvedManifest() {
    return {
      ok: true,
      json: async () => ({
        allowed: true,
        isAdmin: false,
        releaseId: "release-xyz",
        allowedEasUpdateId: "eas-upd-001",
        allowedEasGroupId: "grp-001",
        allowedEasUpdateIds: ["eas-upd-001"],
        runtimeVersion: "54.10.27",
        otaVersion: "54.10.1",
        status: "approved",
      }),
    };
  }

  /** Predispone AsyncStorage con un deviceId stabile, evita mock null su DEVICE_ID_KEY */
  function withStableDeviceId() {
    asyncStorageGetItem.mockImplementation(async (key: string) => {
      if (key === "bikerlink:ota:device-id:v1") return "test-device-unit-001";
      return null;
    });
  }

  /** Restituisce il body JSON dell'ultima chiamata fetch che ha colpito /api/ota/event */
  function captureEventBody(
    fetchMock: ReturnType<typeof vi.fn>
  ): Record<string, unknown> | null {
    const eventCall = (
      fetchMock.mock.calls as Array<[string, { body?: string }]>
    ).find(([url]) => url.includes("/api/ota/event"));
    if (!eventCall) return null;
    return JSON.parse(eventCall[1].body ?? "{}") as Record<string, unknown>;
  }

  it("include sessionToken nel body quando Authorization è assente", async () => {
    // Nessun Bearer — cold start assoluto pre-login
    authFetchHeadersMock.mockReturnValue({ "Content-Type": "application/json" });
    getSessionTokenMock.mockReturnValue("s%3Amy-session-id.my-hmac");
    withStableDeviceId();

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-001", group: "grp-001" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/ota/manifest")) return approvedManifest();
      return { ok: true, json: async () => ({ ok: true }) };
    });
    globalThis.fetch = fetchMock;

    useOtaAutoUpdate(true);
    await flushPromises();

    const body = captureEventBody(fetchMock);
    expect(body).not.toBeNull();
    // sessionToken deve essere presente nel body (fallback pre-login)
    expect(body!.sessionToken).toBe("s%3Amy-session-id.my-hmac");
    // eventType corretto per il download appena avvenuto
    expect(body!.eventType).toBe("downloaded");
  });

  it("NON include sessionToken nel body quando Authorization è presente", async () => {
    // Utente loggato: Bearer presente negli header
    authFetchHeadersMock.mockReturnValue({
      "Content-Type": "application/json",
      Authorization: "Bearer my-valid-token",
    });
    // getSessionToken ha un valore ma NON deve finire nel body
    getSessionTokenMock.mockReturnValue("should-not-appear-in-body");
    withStableDeviceId();

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-001", group: "grp-001" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/ota/manifest")) return approvedManifest();
      return { ok: true, json: async () => ({ ok: true }) };
    });
    globalThis.fetch = fetchMock;

    useOtaAutoUpdate(true);
    await flushPromises();

    const body = captureEventBody(fetchMock);
    expect(body).not.toBeNull();
    // sessionToken NON deve comparire nel body quando il Bearer è presente
    expect(body!.sessionToken).toBeUndefined();
    expect(body!.eventType).toBe("downloaded");
  });

  it("NON include sessionToken nel body quando getSessionToken() ritorna null", async () => {
    // Nessun Bearer E nessun token in cache
    authFetchHeadersMock.mockReturnValue({ "Content-Type": "application/json" });
    getSessionTokenMock.mockReturnValue(null);
    withStableDeviceId();

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-001", group: "grp-001" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/ota/manifest")) return approvedManifest();
      return { ok: true, json: async () => ({ ok: true }) };
    });
    globalThis.fetch = fetchMock;

    useOtaAutoUpdate(true);
    await flushPromises();

    const body = captureEventBody(fetchMock);
    expect(body).not.toBeNull();
    // getSessionToken() = null → sessionToken NON incluso nel body
    expect(body!.sessionToken).toBeUndefined();
  });
});
