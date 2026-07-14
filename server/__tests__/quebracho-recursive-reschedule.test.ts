/**
 * Regressione (Task #9, review "REJECTED" — vedi .agents/memory/quebracho-job-gate-wiring.md):
 * withJobGate restituisce `undefined` senza eseguire la funzione interna quando
 * il gate nega l'esecuzione. Nei loop auto-rischedulanti (setTimeout ricorsivo)
 * il ri-arm del timer NON deve vivere dentro la funzione gated, altrimenti un
 * singolo skip (pausa/kill-switch/fallback) ferma il loop per sempre.
 *
 * Questo test verifica lo scheduler daily-time-profile (il più semplice dei 6
 * loop toccati — map-matching-job, curvy-score-job, vacuum-service,
 * time-profile, mapbox/tomtom quota-guard condividono lo stesso pattern
 * "gatedRun() dentro fireAndReschedule(), reschedule fuori dal gate"): con il
 * gate che nega SEMPRE, il loop deve comunque pianificare il tick successivo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dbExecuteMock = vi.hoisted(() => vi.fn(async () => ({ rows: [] })));
vi.mock("../db", () => ({ db: { execute: dbExecuteMock } }));

vi.mock("../storage", () => ({
  storage: { getAppSetting: vi.fn(async () => undefined), upsertAppSetting: vi.fn(async () => ({})) },
}));

const canRunJobMock = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
vi.mock("../ai/coordinator/job-gate", () => ({ canRunJob: canRunJobMock }));

vi.mock("../ai/coordinator/job-registry", () => ({ registerJob: vi.fn() }));
vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

import {
  scheduleDailyUserTimeProfileJob,
  stopDailyUserTimeProfileJob,
} from "../matching/time-profile";

beforeEach(() => {
  vi.useFakeTimers();
  dbExecuteMock.mockReset().mockResolvedValue({ rows: [] });
  canRunJobMock.mockReset().mockResolvedValue({ allowed: true });
});

afterEach(() => {
  stopDailyUserTimeProfileJob();
  vi.useRealTimers();
});

describe("scheduleDailyUserTimeProfileJob — sopravvivenza del loop a uno skip del gate", () => {
  it("un tick negato dal gate NON esegue il job ma pianifica comunque il tick successivo", async () => {
    canRunJobMock.mockResolvedValue({ allowed: false, reason: "pausa quebracho", source: "quebracho" });

    scheduleDailyUserTimeProfileJob();
    // Prima esecuzione pianificata (delay variabile in base all'ora corrente).
    await vi.runOnlyPendingTimersAsync();
    expect(canRunJobMock).toHaveBeenCalledTimes(1);
    expect(dbExecuteMock).not.toHaveBeenCalled(); // il gate ha negato: nessun lavoro reale eseguito

    // Se il ri-arm fosse dentro la funzione gated, qui non ci sarebbe alcun
    // timer pendente e questo secondo giro non scatterebbe mai.
    await vi.runOnlyPendingTimersAsync();
    expect(canRunJobMock).toHaveBeenCalledTimes(2);

    await vi.runOnlyPendingTimersAsync();
    expect(canRunJobMock).toHaveBeenCalledTimes(3);
  });

  it("quando il gate permette, il job gira e il loop continua comunque", async () => {
    scheduleDailyUserTimeProfileJob();
    await vi.runOnlyPendingTimersAsync();
    expect(canRunJobMock).toHaveBeenCalledTimes(1);
    expect(dbExecuteMock).toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();
    expect(canRunJobMock).toHaveBeenCalledTimes(2);
  });
});
