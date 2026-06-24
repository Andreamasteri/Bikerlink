import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Task #4893 — l'indice HNSW mancante/invalido emette un segnale "high"
// (db.embeddings.hnsw_index). Verifichiamo che dispatchAlerts() invii una push
// agli admin per quel problema, nonostante la severity sia "high" e NON "critical"
// (il loop generico di alerts.ts spinge solo i critical → serve il blocco dedicato).
//
// Mock delle dipendenze esterne di alerts.ts per isolare la logica:
//  - ../../push-notifications  → cattura le push senza inviarle davvero
//  - ./log                     → no-op writeWatchdogLog
//  - ../coordinator/integrations/watchdog → no-op emit*
//  - ./maps-kill-switch        → flag mappe sempre attivo
// ---------------------------------------------------------------------------

const sendPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(2));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: sendPushMock,
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: vi.fn().mockResolvedValue("log-id"),
}));

vi.mock("../ai/coordinator/integrations/watchdog", () => ({
  emitWatchdogAlert: vi.fn().mockResolvedValue(undefined),
  emitWatchdogStatusChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/watchdog/maps-kill-switch", () => ({
  isMapsFlagEnabled: vi.fn().mockResolvedValue(true),
}));

import { dispatchAlerts, _resetThrottleForTests } from "../ai/watchdog/alerts";
import type { HealthSnapshot, Problem } from "../ai/watchdog/types";

function makeSnapshot(problems: Problem[]): HealthSnapshot {
  return {
    status: "yellow",
    score: 82,
    problems,
    metrics: {},
    generatedAt: new Date().toISOString(),
  };
}

const hnswMissingProblem: Problem = {
  id: "db.embeddings.hnsw_index",
  severity: "high",
  source: "db",
  title: "Indice HNSW mancante — findSimilar usa sequential scan",
  suggestion: "HNSW index missing/invalid — findSimilar falling back to sequential scan.",
  detail: JSON.stringify({ exists: false, valid: false, indexName: "embeddings_vec_hnsw_cosine_idx" }),
};

describe("watchdog HNSW index alert (Task #4893)", () => {
  beforeEach(() => {
    sendPushMock.mockClear();
    _resetThrottleForTests();
  });

  it("invia una push agli admin quando il segnale HNSW è high (indice mancante)", async () => {
    const result = await dispatchAlerts(makeSnapshot([hnswMissingProblem]));

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [title, body, payload] = sendPushMock.mock.calls[0];
    expect(title).toContain("HNSW");
    expect(title).toContain("mancante");
    expect(body).toContain("findSimilar");
    expect(payload).toMatchObject({ type: "watchdog_hnsw_index", exists: false, valid: false });
    expect(result.sent).toBe(2);
  });

  it("usa 'invalido' quando l'indice esiste ma non è valido", async () => {
    const invalid: Problem = {
      ...hnswMissingProblem,
      title: "Indice HNSW invalido — findSimilar usa sequential scan",
      detail: JSON.stringify({ exists: true, valid: false, indexName: "embeddings_vec_hnsw_cosine_idx" }),
    };

    await dispatchAlerts(makeSnapshot([invalid]));

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [title, , payload] = sendPushMock.mock.calls[0];
    expect(title).toContain("invalido");
    expect(payload).toMatchObject({ type: "watchdog_hnsw_index", exists: true, valid: false });
  });

  it("throttle: non reinvia la stessa push entro la finestra TTL", async () => {
    await dispatchAlerts(makeSnapshot([hnswMissingProblem]));
    await dispatchAlerts(makeSnapshot([hnswMissingProblem]));

    // La prima chiamata invia la push HNSW; la seconda è throttlata.
    const hnswCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_hnsw_index",
    );
    expect(hnswCalls).toHaveLength(1);
  });

  it("NON invia push HNSW quando la severity è declassata a warn", async () => {
    const warned: Problem = { ...hnswMissingProblem, severity: "warn" };

    await dispatchAlerts(makeSnapshot([warned]));

    const hnswCalls = sendPushMock.mock.calls.filter(
      ([, , payload]) => (payload as { type?: string })?.type === "watchdog_hnsw_index",
    );
    expect(hnswCalls).toHaveLength(0);
  });
});
