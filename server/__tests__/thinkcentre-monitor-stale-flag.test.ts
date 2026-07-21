/**
 * Test unitari per il branch "stale powered-off flag" di runThinkCentreProbe().
 *
 * Scenario: isThinkCentreOffline()=true (powered_off=true).
 * - Probe leggera OK  → push admin emessa (throttle 30 min).
 * - Probe leggera KO  → nessuna push.
 * - Solo maintenance  → probe leggera non eseguita, nessuna push.
 * - Throttle attivo   → push non ripetuta prima dei 30 min.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock factories — hoisted prima dell'import del modulo ──────────────────────
const fetchMock = vi.hoisted(() => vi.fn());
const sendPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(2));
const writeWatchdogLogMock = vi.hoisted(() => vi.fn().mockResolvedValue("log-id"));
const isThinkCentreOfflineMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const isThinkCentrePoweredOffMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const isIgnoredForTestsMock = vi.hoisted(() => vi.fn().mockResolvedValue(false));

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn(() =>
          Object.assign(Promise.resolve([]), {
            limit: vi.fn().mockResolvedValue([]),
          }),
        ),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "evt-id" }]),
      }),
    }),
  },
  withDbRetry: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
}));

vi.mock("@shared/db", () => ({
  appSettings: { key: {}, value: {} },
  thinkcentreHealthEvents: {},
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), inArray: vi.fn() }));

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: isThinkCentreOfflineMock,
}));

vi.mock("../lib/thinkcentre-powered-off", () => ({
  isThinkCentrePoweredOff: isThinkCentrePoweredOffMock,
}));

vi.mock("../lib/thinkcentre-ignore-tests", () => ({
  isThinkCentreIgnoredForTests: isIgnoredForTestsMock,
}));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: sendPushMock,
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: writeWatchdogLogMock,
}));

vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../cache/redis", () => ({
  reInitRedis: vi.fn().mockResolvedValue(undefined),
  suspendRedis: vi.fn().mockResolvedValue(undefined),
  setTcRedisProbeOk: vi.fn(),
}));

vi.mock("../ai/coordinator/gated-job", () => ({
  withJobGate: vi.fn((_key: string, fn: () => Promise<void>) => fn),
}));

vi.mock("../lib/photon-client", () => ({
  getPhotonHealthSnapshot: vi.fn().mockResolvedValue({ configured: false, ok: false }),
}));

vi.mock("../graphhopper-client", () => ({
  ACTIVE_PROFILE: "motorcycle",
  fetchSelfHostedProfiles: vi.fn().mockResolvedValue({ reachable: false }),
  isSelfHosted: false,
}));

vi.mock("../routing/routing-area-state", () => ({
  getAreaEnabledMap: vi.fn().mockResolvedValue({}),
}));

global.fetch = fetchMock as unknown as typeof fetch;

import { runThinkCentreProbe, stopThinkCentreMonitor } from "../jobs/thinkcentre-monitor";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fetchOk(): Response {
  return { status: 200 } as Response;
}

function fetchKo(): Response {
  return { status: 503 } as Response;
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stopThinkCentreMonitor();
  // Flag "spento" attivo di default
  isThinkCentreOfflineMock.mockResolvedValue(true);
  isThinkCentrePoweredOffMock.mockResolvedValue(true);
  isIgnoredForTestsMock.mockResolvedValue(false);
  // TC agent configurato
  process.env.THINKCENTRE_METRICS_URL = "https://tc.biker-link.net/agent";
  process.env.THINKCENTRE_AGENT_TOKEN = "test-token";
});

afterEach(() => {
  stopThinkCentreMonitor();
  delete process.env.THINKCENTRE_METRICS_URL;
  delete process.env.THINKCENTRE_AGENT_TOKEN;
  vi.useRealTimers();
});

// =============================================================================
// Suite — stale powered-off flag detection
// =============================================================================

describe("runThinkCentreProbe — stale powered_off flag", () => {
  it("emette la push admin quando powered_off=true e la probe HTTP è OK", async () => {
    fetchMock.mockResolvedValue(fetchOk());

    await runThinkCentreProbe();

    // Deve aver chiamato fetch /health del TC agent
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tc.biker-link.net/agent/health",
      expect.objectContaining({ method: "GET" }),
    );

    // Deve aver inviato la push admin
    expect(sendPushMock).toHaveBeenCalledWith(
      expect.stringContaining("raggiungibile"),
      expect.any(String),
      expect.objectContaining({ type: "thinkcentre_stale_powered_off_flag" }),
    );

    // Deve aver scritto il watchdog log con scope corretto
    expect(writeWatchdogLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "tc.flag_stale", kind: "alert" }),
    );
  });

  it("non emette push quando powered_off=true ma la probe HTTP risponde KO", async () => {
    fetchMock.mockResolvedValue(fetchKo());

    await runThinkCentreProbe();

    expect(fetchMock).toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(writeWatchdogLogMock).not.toHaveBeenCalled();
  });

  it("non emette push quando powered_off=true ma fetch lancia (timeout/network error)", async () => {
    fetchMock.mockRejectedValue(new Error("AbortError"));

    await runThinkCentreProbe();

    expect(fetchMock).toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("non esegue la probe leggera quando isThinkCentreOffline=true ma powered_off=false (manutenzione)", async () => {
    // Solo maintenance_mode=true, powered_off=false
    isThinkCentrePoweredOffMock.mockResolvedValue(false);

    await runThinkCentreProbe();

    // Nessuna fetch — la probe leggera non gira per la manutenzione
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("non emette push quando THINKCENTRE_METRICS_URL non è configurato", async () => {
    delete process.env.THINKCENTRE_METRICS_URL;
    fetchMock.mockResolvedValue(fetchOk());

    await runThinkCentreProbe();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("rispetta il throttle: non ripete la push prima dei 30 minuti", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(fetchOk());

    // Prima run → push emessa
    await runThinkCentreProbe();
    expect(sendPushMock).toHaveBeenCalledTimes(1);

    // Seconda run subito (throttle attivo) → nessuna push aggiuntiva
    await runThinkCentreProbe();
    expect(sendPushMock).toHaveBeenCalledTimes(1);

    // Avanza il clock di 30 minuti → throttle scaduto
    vi.advanceTimersByTime(31 * 60 * 1000);

    // Terza run → push emessa di nuovo
    await runThinkCentreProbe();
    expect(sendPushMock).toHaveBeenCalledTimes(2);
  });

  it("non esegue la probe leggera quando ignore_for_tests è attivo", async () => {
    isIgnoredForTestsMock.mockResolvedValue(true);
    fetchMock.mockResolvedValue(fetchOk());

    await runThinkCentreProbe();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
