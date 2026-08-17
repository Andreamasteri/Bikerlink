/**
 * Route admin del registry job del coordinatore Horus
 * (ex Quebracho — Task #591: unified into Horus): snapshot, direttive manuali, kill-switch.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { isCoordinatorKillSwitchActiveMock, setCoordinatorKillSwitchMock, isHorusUnreachableMock, applyJobDirectiveMock, getCoordinatorHealthSummaryMock, getCoordinatorJobsSnapshotMock, getJobMock, resetJobToIdleMock } = vi.hoisted(() => ({
  isCoordinatorKillSwitchActiveMock: vi.fn(async () => false),
  setCoordinatorKillSwitchMock: vi.fn(async () => {}),
  // Horus reachability is the single coordinator health signal (Task #591).
  isHorusUnreachableMock: vi.fn(async () => false),
  applyJobDirectiveMock: vi.fn(async (name: string, kind: string) => ({ applied: true, jobName: name, kind })),
  getCoordinatorHealthSummaryMock: vi.fn(() => ({ killSwitch: false, horusReachable: true, jobs: { total: 1, running: 0, paused: 0, throttled: 0 } })),
  getCoordinatorJobsSnapshotMock: vi.fn(() => [{ name: "job-a", state: "idle" }]),
  getJobMock: vi.fn((name: string) => ({ name, state: "running" })),
  resetJobToIdleMock: vi.fn(),
}));

vi.mock("../ai/coordinator/job-gate", () => ({
  isCoordinatorKillSwitchActive: isCoordinatorKillSwitchActiveMock,
  setCoordinatorKillSwitch: setCoordinatorKillSwitchMock,
  // Horus reachability is the single coordinator health signal (Task #591).
  isHorusUnreachable: isHorusUnreachableMock,
  applyJobDirective: applyJobDirectiveMock,
  getCoordinatorHealthSummary: getCoordinatorHealthSummaryMock,
  getCoordinatorJobsSnapshot: getCoordinatorJobsSnapshotMock,
}));

vi.mock("../ai/coordinator/job-registry", () => ({
  getJob: getJobMock,
  resetJobToIdle: resetJobToIdleMock,
}));

import coordinatorJobsRouter from "../routes/admin/coordinator-jobs";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", coordinatorJobsRouter);
  return app;
}

beforeEach(() => {
  isCoordinatorKillSwitchActiveMock.mockReset().mockResolvedValue(false);
  setCoordinatorKillSwitchMock.mockReset().mockResolvedValue(undefined);
  // Horus reachability is the single coordinator health signal (Task #591).
  isHorusUnreachableMock.mockReset().mockResolvedValue(false);
  applyJobDirectiveMock.mockReset().mockImplementation(async (name: string, kind: string) => ({ applied: true, jobName: name, kind }));
  getJobMock.mockReset().mockImplementation((name: string) => ({ name, state: "running" }));
  resetJobToIdleMock.mockReset();
});

describe("GET /api/admin/coordinator/jobs", () => {
  it("ritorna kill-switch, reachability e snapshot job", async () => {
    const res = await request(buildApp()).get("/api/admin/coordinator/jobs");
    expect(res.status).toBe(200);
    expect(res.body.killSwitch).toBe(false);
    expect(res.body.horusReachable).toBe(true);
    expect(res.body.jobs).toEqual([{ name: "job-a", state: "idle" }]);
  });
});

describe("POST /api/admin/coordinator/jobs/:name/directive", () => {
  it("applica una direttiva valida come admin_manual", async () => {
    const res = await request(buildApp())
      .post("/api/admin/coordinator/jobs/job-a/directive")
      .send({ kind: "pause", reason: "manutenzione" });
    expect(res.status).toBe(200);
    expect(applyJobDirectiveMock).toHaveBeenCalledWith(
      "job-a",
      "pause",
      { reason: "manutenzione", throttleMs: undefined },
      "admin_manual",
    );
  });

  it("rifiuta un kind non valido con 400", async () => {
    const res = await request(buildApp())
      .post("/api/admin/coordinator/jobs/job-a/directive")
      .send({ kind: "explode" });
    expect(res.status).toBe(400);
    expect(applyJobDirectiveMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/coordinator/kill-switch", () => {
  it("attiva il kill-switch globale", async () => {
    const res = await request(buildApp()).post("/api/admin/coordinator/kill-switch").send({ active: true });
    expect(res.status).toBe(200);
    expect(setCoordinatorKillSwitchMock).toHaveBeenCalledWith(true);
  });

  it("rifiuta un body senza 'active' booleano", async () => {
    const res = await request(buildApp()).post("/api/admin/coordinator/kill-switch").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/coordinator/jobs/:name/reset", () => {
  it("resetta un job zombie e restituisce lo stato live", async () => {
    getJobMock.mockReturnValueOnce({ name: "job-a", state: "running" });
    getJobMock.mockReturnValueOnce({ name: "job-a", state: "idle" });

    const res = await request(buildApp()).post("/api/admin/coordinator/jobs/job-a/reset");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "job-a", previousState: "running", state: "idle", reset: true });
    expect(resetJobToIdleMock).toHaveBeenCalledWith("job-a", "reset manuale admin");
  });

  it("rifiuta un job non presente nel registry", async () => {
    getJobMock.mockReturnValue(undefined);

    const res = await request(buildApp()).post("/api/admin/coordinator/jobs/unknown/reset");

    expect(res.status).toBe(404);
    expect(resetJobToIdleMock).not.toHaveBeenCalled();
  });
});
