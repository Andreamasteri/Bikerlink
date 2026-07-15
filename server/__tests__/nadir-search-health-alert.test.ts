/**
 * Task #79 — Verifica del PERCORSO DI FALLIMENTO/ESCALATION della sonda di salute
 * ricerca di Nadir (server/ai/nadir/reindex.ts, step 3).
 *
 * Il job notturno reindicizza (tollerante ai fallimenti) e POI esegue una vera
 * self-search sull'indice. L'happy path (sonda OK) è già coperto altrove; qui
 * esercitiamo esplicitamente il caso "search itself is broken":
 *
 *   1. La sonda FALLISCE (0 hit nonostante frammenti indicizzati, OPPURE la
 *      ricerca lancia) → lo streak `consecutiveFailedNights` incrementa notte
 *      dopo notte e ogni notte alza un VERO allarme admin
 *      (writeWatchdogLog + sendSystemAlertPushToAdmins).
 *   2. Indice VUOTO (nessun frammento) → è uno SKIP, non un guasto: nessun
 *      incremento streak, nessun allarme.
 *   3. Un successo AZZERA lo streak.
 *   4. Una sonda MANUALE che fallisce NON gonfia lo streak né alza l'allarme
 *      di staleness (lo streak è per definizione di *notti*).
 *
 * Strategia di mock: uno store AppSetting in-memory rende lo streak persistente
 * tra notti simulate (esattamente come in produzione); `./search` è mockato per
 * pilotare l'esito della sonda; il plumbing di allarme (watchdog log + push
 * admin) è mockato per contare le emissioni.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// server/db.ts lancia se DATABASE_URL non è settata; la sonda non tocca il DB in
// questi test, ma il modulo reindex importa la catena db a livello di modulo.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
}

const {
  appSettingStore,
  mockLoadFragmentManifest,
  mockSearchNadir,
  mockWriteWatchdogLog,
  mockSendSystemAlertPushToAdmins,
} = vi.hoisted(() => ({
  appSettingStore: new Map<string, unknown>(),
  mockLoadFragmentManifest: vi.fn(),
  mockSearchNadir: vi.fn(),
  mockWriteWatchdogLog: vi.fn(),
  mockSendSystemAlertPushToAdmins: vi.fn(),
}));

// Store AppSetting in-memory: getAppSetting ritorna { valueJson } come il vero
// storage; upsertAppSetting(key, value, valueJson) persiste il 3° argomento.
vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn(async (key: string) =>
      appSettingStore.has(key) ? { valueJson: appSettingStore.get(key) } : undefined,
    ),
    upsertAppSetting: vi.fn(async (key: string, _value: unknown, valueJson: unknown) => {
      appSettingStore.set(key, valueJson);
    }),
  },
}));

vi.mock("../ai/nadir/search", () => ({
  loadFragmentManifest: mockLoadFragmentManifest,
  searchNadir: mockSearchNadir,
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: mockWriteWatchdogLog,
}));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: mockSendSystemAlertPushToAdmins,
}));

import {
  runNadirSearchHealthProbe,
  getNadirSearchHealth,
} from "../ai/nadir/reindex";
import { NADIR_SEARCH_HEALTH_KEY } from "../ai/nadir/constants";

/** Manifest con un frammento manuale realmente indicizzato. */
const MANIFEST_WITH_FRAGMENT = {
  "nadir_manual:chunk-0": {
    origin: "manual" as const,
    text: "Come recuperare le chat passate e cosa fa l'assistente notturno.",
  },
};

beforeEach(() => {
  appSettingStore.clear();
  vi.clearAllMocks();
  // Default: plumbing di allarme risolve pulito (in prod è .catch()-ato comunque).
  mockWriteWatchdogLog.mockResolvedValue("log-id");
  mockSendSystemAlertPushToAdmins.mockResolvedValue(1);
});

describe("Nadir search-health probe — failure/escalation path (Task #79)", () => {
  it("indice VUOTO → skip, non guasto: niente streak, niente allarme", async () => {
    mockLoadFragmentManifest.mockResolvedValue({});

    const health = await runNadirSearchHealthProbe("nightly");

    expect(health.ok).toBe(true);
    expect(health.consecutiveFailedNights).toBe(0);
    expect(health.probeQuery).toBeNull();
    expect(health.hits).toBe(0);
    expect(health.error).toBeNull();
    // searchNadir non viene nemmeno chiamata: non c'è indice da esercitare.
    expect(mockSearchNadir).not.toHaveBeenCalled();
    // Nessun allarme: uno skip non è un fallimento.
    expect(mockWriteWatchdogLog).not.toHaveBeenCalled();
    expect(mockSendSystemAlertPushToAdmins).not.toHaveBeenCalled();
  });

  it("0 hit nonostante frammenti indicizzati → fallimento, streak cresce ogni notte e l'allarme parte", async () => {
    mockLoadFragmentManifest.mockResolvedValue(MANIFEST_WITH_FRAGMENT);
    // Self-search rotta: 0 frammenti benché l'indice non sia vuoto.
    mockSearchNadir.mockResolvedValue({ model: "local:test", fragments: [] });

    // Notte 1
    const n1 = await runNadirSearchHealthProbe("nightly");
    expect(n1.ok).toBe(false);
    expect(n1.consecutiveFailedNights).toBe(1);
    expect(n1.hits).toBe(0);
    expect(n1.error).toMatch(/0 frammenti/i);
    expect(n1.probeQuery).toBeTruthy();

    // Notte 2
    const n2 = await runNadirSearchHealthProbe("nightly");
    expect(n2.ok).toBe(false);
    expect(n2.consecutiveFailedNights).toBe(2);

    // Notte 3
    const n3 = await runNadirSearchHealthProbe("nightly");
    expect(n3.ok).toBe(false);
    expect(n3.consecutiveFailedNights).toBe(3);

    // Un VERO allarme admin ogni notte fallita: log watchdog + push admin.
    expect(mockWriteWatchdogLog).toHaveBeenCalledTimes(3);
    expect(mockSendSystemAlertPushToAdmins).toHaveBeenCalledTimes(3);

    // Il log watchdog usa lo scope/status corretti e riporta lo streak crescente.
    const logCall = mockWriteWatchdogLog.mock.calls[2][0];
    expect(logCall.kind).toBe("alert");
    expect(logCall.scope).toBe("nadir.search_health");
    expect(logCall.status).toBe("error");
    expect(logCall.details.consecutiveFailedNights).toBe(3);

    // La push admin porta il payload di rottura con il conteggio notti.
    const pushCall = mockSendSystemAlertPushToAdmins.mock.calls[2];
    expect(pushCall[2]).toMatchObject({
      type: "nadir_search_broken",
      consecutiveFailedNights: 3,
    });

    // Lo stato persistito riflette l'ultimo streak.
    const persisted = await getNadirSearchHealth();
    expect(persisted?.consecutiveFailedNights).toBe(3);
    expect(persisted?.ok).toBe(false);
  });

  it("la ricerca che LANCIA è trattata come fallimento e alza l'allarme", async () => {
    mockLoadFragmentManifest.mockResolvedValue(MANIFEST_WITH_FRAGMENT);
    mockSearchNadir.mockRejectedValue(new Error("HNSW index invalid"));

    const health = await runNadirSearchHealthProbe("nightly");

    expect(health.ok).toBe(false);
    expect(health.consecutiveFailedNights).toBe(1);
    expect(health.error).toMatch(/HNSW index invalid/);
    expect(mockWriteWatchdogLog).toHaveBeenCalledTimes(1);
    expect(mockSendSystemAlertPushToAdmins).toHaveBeenCalledTimes(1);
  });

  it("un successo AZZERA lo streak dopo notti rotte", async () => {
    mockLoadFragmentManifest.mockResolvedValue(MANIFEST_WITH_FRAGMENT);

    // Due notti rotte.
    mockSearchNadir.mockResolvedValue({ model: "local:test", fragments: [] });
    await runNadirSearchHealthProbe("nightly");
    const broken = await runNadirSearchHealthProbe("nightly");
    expect(broken.consecutiveFailedNights).toBe(2);

    // Terza notte: la ricerca torna a funzionare (self-search ritrova il frammento).
    mockSearchNadir.mockResolvedValue({
      model: "local:test",
      fragments: [{ origin: "manual", text: "x", similarity: 0.99, entityId: "chunk-0" }],
    });
    const recovered = await runNadirSearchHealthProbe("nightly");

    expect(recovered.ok).toBe(true);
    expect(recovered.consecutiveFailedNights).toBe(0);
    expect(recovered.hits).toBe(1);
    // Nessun nuovo allarme sul successo (solo le 2 notti rotte).
    expect(mockSendSystemAlertPushToAdmins).toHaveBeenCalledTimes(2);
  });

  it("una sonda MANUALE fallita NON gonfia lo streak né alza l'allarme di staleness", async () => {
    mockLoadFragmentManifest.mockResolvedValue(MANIFEST_WITH_FRAGMENT);
    mockSearchNadir.mockResolvedValue({ model: "local:test", fragments: [] });

    // Prima una notte rotta → streak 1.
    await runNadirSearchHealthProbe("nightly");

    // Poi un test diurno manuale, anch'esso rotto: registra lo stato ma lascia
    // lo streak invariato e NON alza un nuovo allarme.
    const manual = await runNadirSearchHealthProbe("manual");
    expect(manual.ok).toBe(false);
    expect(manual.consecutiveFailedNights).toBe(1); // invariato, non 2

    // Solo l'allarme della notte è partito, non quello della sonda manuale.
    expect(mockWriteWatchdogLog).toHaveBeenCalledTimes(1);
    expect(mockSendSystemAlertPushToAdmins).toHaveBeenCalledTimes(1);
  });

  it("lo stato di salute è persistito sulla chiave AppSetting corretta", async () => {
    mockLoadFragmentManifest.mockResolvedValue(MANIFEST_WITH_FRAGMENT);
    mockSearchNadir.mockResolvedValue({ model: "local:test", fragments: [] });

    await runNadirSearchHealthProbe("nightly");

    // La sonda deve scrivere sulla chiave dedicata (non su una a caso).
    expect(appSettingStore.has(NADIR_SEARCH_HEALTH_KEY)).toBe(true);
  });
});
