import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpProbeMock, writeWatchdogLogMock } = vi.hoisted(() => ({
  httpProbeMock: vi.fn(),
  writeWatchdogLogMock: vi.fn(async () => undefined),
}));

vi.mock("../ai/watchdog/campaigns-self-check.part2", () => ({
  httpProbe: httpProbeMock,
}));

vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: writeWatchdogLogMock,
}));

vi.mock("../ai/coordinator/gated-job", () => ({
  withJobGate: (_name: string, fn: () => unknown) => fn,
}));

import { runCampaignsSelfCheck } from "../ai/watchdog/campaigns-self-check";

beforeEach(() => {
  httpProbeMock.mockReset();
  writeWatchdogLogMock.mockClear();
});

describe("campaign watchdog read-only contract", () => {
  it("esegue esclusivamente le due GET diagnostiche", async () => {
    httpProbeMock
      .mockResolvedValueOnce({ status: 200, body: "[]", json: [] })
      .mockResolvedValueOnce({ status: 200, body: "[]", json: [] });

    const result = await runCampaignsSelfCheck({
      triggeredBy: "manual",
      withAi: false,
    });

    expect(httpProbeMock).toHaveBeenCalledTimes(2);
    expect(httpProbeMock.mock.calls).toEqual([
      ["GET", "/api/admin/advertisements"],
      ["GET", "/api/ads/placement/all"],
    ]);
    expect(
      httpProbeMock.mock.calls.every(([method]) => method === "GET"),
    ).toBe(true);
    expect(result.overall).toBe("ok");
    expect(result.checks).toHaveLength(2);
    expect(writeWatchdogLogMock).toHaveBeenCalledTimes(1);
  });

  it("non tenta cleanup o mutazioni quando una GET fallisce", async () => {
    httpProbeMock
      .mockResolvedValueOnce({ status: 500, body: "errore", json: null })
      .mockResolvedValueOnce({ status: 200, body: "[]", json: [] });

    const result = await runCampaignsSelfCheck({
      triggeredBy: "scheduler",
      withAi: false,
    });

    expect(httpProbeMock).toHaveBeenCalledTimes(2);
    expect(httpProbeMock.mock.calls).toEqual([
      ["GET", "/api/admin/advertisements"],
      ["GET", "/api/ads/placement/all"],
    ]);
    expect(result.overall).toBe("broken");
    expect(result.checks[0]?.status).toBe("error");
  });
});
