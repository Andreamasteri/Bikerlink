// Task #58 — verifica end-to-end che un guard di guards.ts, ripetuto oltre la
// soglia, produca davvero una direttiva "horus" nel job registry (non solo
// nel canale di escalation isolato, come già coperto da
// quebracho-escalation.test.ts).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../ai/watchdog/log", () => ({ writeWatchdogLog: vi.fn(async () => "log-id") }));
vi.mock("../lib/ollama-client", () => ({
  callOllamaChat: vi.fn(async () => null),
  isOllamaReachable: vi.fn(async () => true),
}));
vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));
vi.mock("../lib/thinkcentre-offline", () => ({ isThinkCentreOffline: vi.fn(async () => false) }));
vi.mock("../lib/quebracho-client", () => ({ isQuebrachoReachable: vi.fn(async () => true) }));
vi.mock("../db", () => ({
  db: { insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }) },
  withDbRetry: async <T>(fn: () => Promise<T>) => fn(),
  isPoolHealthy: () => true,
}));
vi.mock("../storage", () => ({
  storage: { countOnlineUsers: vi.fn(async () => 100) },
}));
vi.mock("../online-tracker", () => ({
  onlineTracker: { countOnlineUsers: vi.fn(() => 0) },
}));

import { __testables } from "../ai/coordinator/guards";
import { __resetEscalationRepeatCountersForTests } from "../ai/coordinator/escalation";
import { getJob } from "../ai/coordinator/job-registry";

const JOB_NAME = "guard-online-counter-congruence";

beforeEach(() => {
  __resetEscalationRepeatCountersForTests();
});

describe("guard → escalation → job-registry auto-pause (integrazione)", () => {
  it("un finding severo e ripetuto sul guard online-counter appare come pausa 'horus' nella snapshot del job registry", async () => {
    // dbCount=100, memoryCount=0 → drift=100% > ONLINE_DRIFT_SEVERE_RATIO (0.6): severo.
    expect(getJob(JOB_NAME)?.directive).toBeFalsy();

    await __testables.checkOnlineCounterCongruence();
    await __testables.checkOnlineCounterCongruence();
    expect(getJob(JOB_NAME)?.directive).toBeFalsy(); // ancora sotto la soglia di ripetizione (3)

    await __testables.checkOnlineCounterCongruence();

    const job = getJob(JOB_NAME);
    expect(job?.directive?.kind).toBe("pause");
    expect(job?.directive?.issuedBy).toBe("horus");
    expect(job?.pauseSource).toBe("horus");
  });
});
