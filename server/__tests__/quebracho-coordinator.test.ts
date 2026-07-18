import { describe, it, expect, vi, beforeEach } from "vitest";

// Horus Coordinator — gate unico canRunJob, registry dei job, direttive per-job
// + kill-switch, fallback deterministico quando Horus è irraggiungibile.
// (Originally Quebracho coordinator test — unified into Horus with Task #591.)

// ── Mock delle dipendenze runtime (nessun DB/rete reali) ─────────────────────
const getAppSettingMock = vi.hoisted(() => vi.fn(async () => undefined as unknown));
const upsertAppSettingMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../storage", () => ({
  storage: { getAppSetting: getAppSettingMock, upsertAppSetting: upsertAppSettingMock },
}));

const isPoolHealthyMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("../db", () => ({
  isPoolHealthy: isPoolHealthyMock,
  db: {
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
    select: () => ({ from: async () => [] }),
  },
}));

vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: async (fn: () => unknown) => fn(),
  isBgDbLimiterDropError: () => false,
}));

const isThinkCentreOfflineMock = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../lib/thinkcentre-offline", () => ({ isThinkCentreOffline: isThinkCentreOfflineMock }));

// Task #591: Quebracho removed — only Horus reachability matters for job gate.
const isOllamaReachableMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../lib/ollama-client", () => ({
  isOllamaReachable: isOllamaReachableMock,
  resetOllamaProbeCache: vi.fn(),
}));

vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

const isAiPausedMock = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../ai/coordinator/index.part2", () => ({ isAiPaused: isAiPausedMock }));

const evaluateEventMock = vi.hoisted(() => vi.fn(() => ({ action: "ALLOW", message: "" })));
vi.mock("../ai/coordinator/policy-engine", () => ({ evaluateEvent: evaluateEventMock }));

import {
  registerJob,
  getJob,
  markRunStart,
  markRunSuccess,
  markRunFailure,
  setNextRun,
  __resetRegistryForTests,
} from "../ai/coordinator/job-registry";
import {
  canRunJob,
  applyJobDirective,
  setCoordinatorKillSwitch,
  getCoordinatorHealthSummary,
  __resetGateCachesForTests,
} from "../ai/coordinator/job-gate";
import { withJobGate } from "../ai/coordinator/gated-job";

beforeEach(() => {
  __resetRegistryForTests();
  __resetGateCachesForTests();
  getAppSettingMock.mockReset().mockResolvedValue(undefined);
  upsertAppSettingMock.mockReset().mockResolvedValue({});
  isPoolHealthyMock.mockReset().mockReturnValue(true);
  isThinkCentreOfflineMock.mockReset().mockResolvedValue(false);
  isOllamaReachableMock.mockReset().mockResolvedValue(true);
  isAiPausedMock.mockReset().mockResolvedValue(false);
  evaluateEventMock.mockReset().mockReturnValue({ action: "ALLOW", message: "" });
});

// ── Registry dei job ──────────────────────────────────────────────────────────
describe("job-registry", () => {
  it("registra un job e lo recupera per nome", () => {
    // API: registerJob(name: string, reg?: JobRegistration)
    registerJob("test-job", { intervalMs: 60_000 });
    const job = getJob("test-job");
    expect(job).toBeDefined();
    expect(job?.name).toBe("test-job");
  });

  it("markRunStart/Success aggiorna lo stato del job", () => {
    registerJob("job-a", { intervalMs: 30_000 });
    markRunStart("job-a");
    expect(getJob("job-a")?.state).toBe("running");
    markRunSuccess("job-a");
    expect(getJob("job-a")?.state).toBe("idle");
  });

  it("markRunFailure porta il job in stato idle (nessuna direttiva attiva)", () => {
    // markRunFailure without a directive → state = "idle" (see job-registry.ts)
    registerJob("job-b", { intervalMs: 30_000 });
    markRunStart("job-b");
    markRunFailure("job-b", new Error("simulated failure"));
    expect(getJob("job-b")?.state).toBe("idle");
    expect(getJob("job-b")?.lastError).toContain("simulated failure");
  });

  it("setNextRun aggiorna nextRunAt", () => {
    registerJob("job-c", { intervalMs: 10_000 });
    const t = Date.now() + 5_000;
    setNextRun("job-c", t);
    expect(getJob("job-c")?.nextRunAt).toBe(t);
  });
});

// ── Job gate (canRunJob / kill-switch / direttive) ────────────────────────────
describe("canRunJob", () => {
  it("consente l'esecuzione quando tutto è OK", async () => {
    registerJob("gated-ok", { intervalMs: 1_000 });
    const dec = await canRunJob("gated-ok");
    expect(dec.allowed).toBe(true);
  });

  it("blocca se il kill-switch è attivo (mock AppSetting restituisce true)", async () => {
    // setCoordinatorKillSwitch writes to storage; canRunJob reads it back via
    // isCoordinatorKillSwitchActive which calls storage.getAppSetting. We need the
    // mock to return the right value so the cache update inside the function reads "true".
    registerJob("gated-ks", { intervalMs: 1_000 });
    getAppSettingMock.mockResolvedValue({ value: "true" });
    await setCoordinatorKillSwitch(true);
    const dec = await canRunJob("gated-ks");
    expect(dec.allowed).toBe(false);
    expect(dec.reason).toMatch(/kill.switch/i);
  });

  it("blocca se il pool DB non è sano", async () => {
    registerJob("gated-pool", { intervalMs: 1_000 });
    isPoolHealthyMock.mockReturnValue(false);
    const dec = await canRunJob("gated-pool");
    expect(dec.allowed).toBe(false);
  });
});

// ── Direttive admin (pause/resume) ───────────────────────────────────────────
describe("applyJobDirective", () => {
  it("la direttiva 'pause' blocca canRunJob per quel job", async () => {
    registerJob("gated-pause", { intervalMs: 1_000 });
    await applyJobDirective("gated-pause", "pause", { reason: "test-pause" }, "admin_manual");
    const dec = await canRunJob("gated-pause");
    expect(dec.allowed).toBe(false);
  });

  it("la direttiva 'resume' riabilita il job dopo una pause", async () => {
    registerJob("gated-resume", { intervalMs: 1_000 });
    await applyJobDirective("gated-resume", "pause", { reason: "test-pause" }, "admin_manual");
    await applyJobDirective("gated-resume", "resume", { reason: "test-resume" }, "admin_manual");
    const dec = await canRunJob("gated-resume");
    expect(dec.allowed).toBe(true);
  });
});

// ── Health summary ────────────────────────────────────────────────────────────
describe("getCoordinatorHealthSummary", () => {
  it("riporta lo snapshot base dei job registrati", () => {
    registerJob("job-x", { intervalMs: 1_000 });
    const summary = getCoordinatorHealthSummary();
    expect(summary).toBeDefined();
    expect(typeof summary.killSwitch).toBe("boolean");
  });
});

// ── withJobGate ───────────────────────────────────────────────────────────────
describe("withJobGate", () => {
  it("esegue il body se il job è consentito", async () => {
    // withJobGate returns a wrapped function; must be called to produce a value
    const wrapped = withJobGate("gated-exec", async () => "ok");
    const result = await wrapped();
    expect(result).toBe("ok");
  });

  it("non esegue il body se il kill-switch è attivo", async () => {
    registerJob("gated-skip", { intervalMs: 1_000 });
    getAppSettingMock.mockResolvedValue({ value: "true" });
    await setCoordinatorKillSwitch(true);
    const wrapped = withJobGate("gated-skip", async () => "should-not-run");
    const result = await wrapped();
    expect(result).toBeUndefined();
  });
});
