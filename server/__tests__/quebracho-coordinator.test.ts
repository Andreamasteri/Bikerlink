import { describe, it, expect, vi, beforeEach } from "vitest";

// Task #5 (Quebracho a) — Control-plane del coordinatore: gate unico canRunJob,
// registry dei job, direttive per-job + kill-switch, fallback deterministico
// quando Quebracho è irraggiungibile.

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

const isQuebrachoReachableMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../lib/quebracho-client", () => ({
  isQuebrachoReachable: isQuebrachoReachableMock,
  resetQuebrachoProbeCache: vi.fn(),
}));

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
  isQuebrachoReachableMock.mockReset().mockResolvedValue(true);
  isOllamaReachableMock.mockReset().mockResolvedValue(true);
  isAiPausedMock.mockReset().mockResolvedValue(false);
  evaluateEventMock.mockReset().mockReturnValue({ action: "ALLOW", message: "" });
});

describe("canRunJob — decisione base", () => {
  it("consente un job appena registrato senza direttive", async () => {
    registerJob("demo-job");
    const d = await canRunJob("demo-job");
    expect(d.allowed).toBe(true);
    expect(d.source).toBe("deterministic");
  });

  it("crea lazy un job sconosciuto e lo consente", async () => {
    const d = await canRunJob("mai-visto");
    expect(d.allowed).toBe(true);
    expect(getJob("mai-visto")).toBeDefined();
  });

  it("non lancia mai: fail-open se il gate incontra un errore interno", async () => {
    getAppSettingMock.mockRejectedValue(new Error("db blip"));
    const d = await canRunJob("demo-job");
    // lettura kill-switch fallita → fail-open, il job resta eseguibile
    expect(d.allowed).toBe(true);
  });
});

describe("kill-switch globale del coordinatore", () => {
  it("blocca qualsiasi job quando attivo", async () => {
    getAppSettingMock.mockResolvedValue({ value: "true" } as unknown);
    const d = await canRunJob("demo-job");
    expect(d.allowed).toBe(false);
    expect(d.source).toBe("killswitch");
  });

  it("setCoordinatorKillSwitch persiste il valore", async () => {
    await setCoordinatorKillSwitch(true);
    expect(upsertAppSettingMock).toHaveBeenCalledWith("coordinator_kill_switch", "true");
  });
});

describe("salute runtime (pool DB)", () => {
  it("rimanda un job non critico se il pool è saturo", async () => {
    isPoolHealthyMock.mockReturnValue(false);
    registerJob("bg-job");
    const d = await canRunJob("bg-job");
    expect(d.allowed).toBe(false);
    expect(d.source).toBe("health");
  });

  it("NON ferma un job critico anche con pool saturo", async () => {
    isPoolHealthyMock.mockReturnValue(false);
    registerJob("critico", { critical: true });
    const d = await canRunJob("critico");
    expect(d.allowed).toBe(true);
  });
});

describe("direttive per-job + fallback Quebracho", () => {
  it("una pausa admin_manual è sempre rispettata (anche se Quebracho è offline)", async () => {
    registerJob("job-a");
    await applyJobDirective("job-a", "pause", { reason: "manutenzione" }, "admin_manual");
    isQuebrachoReachableMock.mockResolvedValue(false); // Quebracho offline
    const d = await canRunJob("job-a");
    expect(d.allowed).toBe(false);
    expect(d.source).toBe("admin_manual");
  });

  it("una pausa di Quebracho è rispettata SOLO se Quebracho è raggiungibile", async () => {
    registerJob("job-b");
    await applyJobDirective("job-b", "pause", { reason: "anomalia" }, "quebracho");
    isQuebrachoReachableMock.mockResolvedValue(true);
    const d1 = await canRunJob("job-b");
    expect(d1.allowed).toBe(false);
    expect(d1.source).toBe("quebracho");
  });

  it("fallback: una pausa di Quebracho viene IGNORATA se Quebracho è irraggiungibile", async () => {
    registerJob("job-c");
    await applyJobDirective("job-c", "pause", { reason: "anomalia" }, "quebracho");
    isQuebrachoReachableMock.mockResolvedValue(false);
    const d = await canRunJob("job-c");
    expect(d.allowed).toBe(true); // il job NON resta bloccato per sempre
  });

  it("fallback: TC offline conta come Quebracho irraggiungibile", async () => {
    registerJob("job-d");
    await applyJobDirective("job-d", "pause", {}, "quebracho");
    isThinkCentreOfflineMock.mockResolvedValue(true);
    const d = await canRunJob("job-d");
    expect(d.allowed).toBe(true);
  });

  it("una pausa di Horus è rispettata SOLO se Horus è raggiungibile", async () => {
    registerJob("job-h1");
    await applyJobDirective("job-h1", "pause", { reason: "guard escalation" }, "horus");
    isOllamaReachableMock.mockResolvedValue(true); // Horus online
    const d = await canRunJob("job-h1");
    expect(d.allowed).toBe(false);
    expect(d.source).toBe("horus");
  });

  it("fallback: una pausa di Horus viene IGNORATA se Horus è irraggiungibile", async () => {
    registerJob("job-h2");
    await applyJobDirective("job-h2", "pause", { reason: "guard escalation" }, "horus");
    isOllamaReachableMock.mockResolvedValue(false); // Horus (Ollama self-hosted) offline
    const d = await canRunJob("job-h2");
    // La pausa auto-emessa da Horus non sopravvive all'outage dell'emittente:
    // una volta risolto il problema il job può ripartire (fail-open).
    expect(d.allowed).toBe(true);
  });

  it("fallback: TC offline conta come Horus irraggiungibile", async () => {
    registerJob("job-h3");
    await applyJobDirective("job-h3", "pause", {}, "horus");
    isThinkCentreOfflineMock.mockResolvedValue(true);
    const d = await canRunJob("job-h3");
    expect(d.allowed).toBe(true);
  });

  it("fallback Horus indipendente da Quebracho: Quebracho online non tiene viva la pausa Horus", async () => {
    registerJob("job-h4");
    await applyJobDirective("job-h4", "pause", { reason: "guard escalation" }, "horus");
    isQuebrachoReachableMock.mockResolvedValue(true); // Quebracho raggiungibile
    isOllamaReachableMock.mockResolvedValue(false); // ma Horus no
    const d = await canRunJob("job-h4");
    expect(d.allowed).toBe(true); // conta la reachability di Horus, non di Quebracho
  });

  it("resume rimuove la pausa", async () => {
    registerJob("job-e");
    await applyJobDirective("job-e", "pause", {}, "admin_manual");
    await applyJobDirective("job-e", "resume");
    const d = await canRunJob("job-e");
    expect(d.allowed).toBe(true);
  });

  it("force è un one-shot: scavalca la pausa una volta sola", async () => {
    registerJob("job-f");
    await applyJobDirective("job-f", "pause", {}, "admin_manual");
    await applyJobDirective("job-f", "force");
    const first = await canRunJob("job-f");
    expect(first.allowed).toBe(true);
    expect(first.forced).toBe(true);
    const second = await canRunJob("job-f");
    expect(second.allowed).toBe(false); // il force è stato consumato
  });
});

describe("throttle / schedulazione", () => {
  it("blocca un job il cui nextRun è nel futuro", async () => {
    registerJob("job-sched");
    setNextRun("job-sched", Date.now() + 60_000);
    const d = await canRunJob("job-sched");
    expect(d.allowed).toBe(false);
    expect(d.source).toBe("throttle");
  });

  it("consente un job il cui nextRun è passato", async () => {
    registerJob("job-sched2");
    setNextRun("job-sched2", Date.now() - 1_000);
    const d = await canRunJob("job-sched2");
    expect(d.allowed).toBe(true);
  });
});

describe("layer AI + policy engine", () => {
  it("rispetta isAiPaused quando Quebracho è raggiungibile", async () => {
    registerJob("job-ai");
    isAiPausedMock.mockResolvedValue(true);
    const d = await canRunJob("job-ai");
    expect(d.allowed).toBe(false);
    expect(d.source).toBe("quebracho");
  });

  it("ignora isAiPaused in fallback (Quebracho offline)", async () => {
    registerJob("job-ai2");
    isAiPausedMock.mockResolvedValue(true);
    isQuebrachoReachableMock.mockResolvedValue(false);
    const d = await canRunJob("job-ai2");
    expect(d.allowed).toBe(true);
  });

  it("blocca su regola policy BLOCK", async () => {
    registerJob("job-pol");
    evaluateEventMock.mockReturnValue({ action: "BLOCK", message: "vietato" });
    const d = await canRunJob("job-pol");
    expect(d.allowed).toBe(false);
    expect(d.source).toBe("policy");
  });
});

describe("registry — transizioni di stato e contatori", () => {
  it("markRunStart/Success aggiornano stato e contatori", () => {
    registerJob("job-run");
    markRunStart("job-run");
    expect(getJob("job-run")?.state).toBe("running");
    expect(getJob("job-run")?.runCount).toBe(1);
    markRunSuccess("job-run");
    expect(getJob("job-run")?.state).toBe("idle");
    expect(getJob("job-run")?.successCount).toBe(1);
  });

  it("markRunFailure registra l'errore e incrementa failureCount", () => {
    registerJob("job-fail");
    markRunStart("job-fail");
    markRunFailure("job-fail", new Error("boom"));
    expect(getJob("job-fail")?.failureCount).toBe(1);
    expect(getJob("job-fail")?.lastError).toContain("boom");
  });
});

describe("withJobGate — tracking del ciclo di vita", () => {
  it("un job gated che ha successo aggiorna runCount/successCount e torna idle", async () => {
    const gated = withJobGate("gated-ok", async () => "done");
    const result = await gated();
    expect(result).toBe("done");
    const e = getJob("gated-ok");
    expect(e?.runCount).toBe(1);
    expect(e?.successCount).toBe(1);
    expect(e?.failureCount).toBe(0);
    expect(e?.lastRunAt).not.toBeNull();
    expect(e?.lastSuccessAt).not.toBeNull();
    expect(e?.state).toBe("idle");
  });

  it("un job gated che fallisce incrementa failureCount e registra lastErrorAt, ri-lanciando l'errore", async () => {
    const gated = withJobGate("gated-fail", async () => {
      throw new Error("kaboom");
    });
    await expect(gated()).rejects.toThrow("kaboom");
    const e = getJob("gated-fail");
    expect(e?.runCount).toBe(1);
    expect(e?.successCount).toBe(0);
    expect(e?.failureCount).toBe(1);
    expect(e?.lastErrorAt).not.toBeNull();
    expect(e?.lastError).toContain("kaboom");
  });

  it("un job gated saltato dal gate NON tocca i contatori", async () => {
    registerJob("gated-skip");
    await applyJobDirective("gated-skip", "pause", {}, "admin_manual");
    const gated = withJobGate("gated-skip", async () => "should-not-run");
    const result = await gated();
    expect(result).toBeUndefined();
    const e = getJob("gated-skip");
    expect(e?.runCount).toBe(0);
    expect(e?.successCount).toBe(0);
    expect(e?.failureCount).toBe(0);
  });
});

describe("getCoordinatorHealthSummary — vista sincrona", () => {
  it("riflette i conteggi dei job e lo stato del kill-switch", async () => {
    registerJob("h1");
    registerJob("h2");
    await applyJobDirective("h2", "pause", {}, "admin_manual");
    const s = getCoordinatorHealthSummary();
    expect(s.jobs.total).toBe(2);
    expect(s.jobs.paused).toBe(1);
  });
});
