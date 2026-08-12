import { beforeEach, describe, expect, it, vi } from "vitest";

const getAppSetting = vi.hoisted(() => vi.fn());

vi.mock("../storage", () => ({
  storage: { getAppSetting },
}));

vi.mock("../db", () => ({
  db: {},
  withDbRetry: vi.fn(),
}));

vi.mock("../lib/db-retry", () => ({
  withDbRetry: vi.fn(),
}));

vi.mock("../ai/coordinator/gated-job", () => ({
  withJobGate: (_name: string, fn: () => unknown) => fn,
}));

vi.mock("../jobs/assistant-images-retention", () => ({
  purgeOldAssistantImages: vi.fn(),
}));

import { getNotificationHistoryRetentionStart } from "../jobs/log-retention";

describe("notification_history retention baseline", () => {
  beforeEach(() => {
    getAppSetting.mockReset();
  });

  it("reads the migration-created baseline", async () => {
    getAppSetting.mockResolvedValue({ value: "2026-08-12T11:30:00.000Z" });

    await expect(getNotificationHistoryRetentionStart()).resolves.toEqual(
      new Date("2026-08-12T11:30:00.000Z"),
    );
    expect(getAppSetting).toHaveBeenCalledWith("notification_history_retention_started_at");
  });

  it("returns null when the baseline is absent or invalid", async () => {
    getAppSetting.mockResolvedValueOnce(undefined);
    await expect(getNotificationHistoryRetentionStart()).resolves.toBeNull();

    getAppSetting.mockResolvedValueOnce({ value: "not-a-date" });
    await expect(getNotificationHistoryRetentionStart()).resolves.toBeNull();
  });

  it("fails closed when the settings read errors", async () => {
    getAppSetting.mockRejectedValue(new Error("db unavailable"));
    await expect(getNotificationHistoryRetentionStart()).resolves.toBeNull();
  });
});
