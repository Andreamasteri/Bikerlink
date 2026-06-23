import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Signal } from "../ai/watchdog/types";

// Task #4804 — il collector deve declassare scheduler.last_run_min_ago da
// "high" a "warn" quando il heartbeat (lastTickAt) è fresco: un loop vivo che
// salta non è uno "scheduler morto".

const getAppSettingMock = vi.hoisted(() => vi.fn());
vi.mock("../storage", () => ({ storage: { getAppSetting: getAppSettingMock } }));

async function loadCollector() {
  const mod = await import("../ai/watchdog/collectors/scheduler-collector");
  return mod.collectScheduler;
}

const lastRun = (s: Signal[]) => s.find((x) => x.metric === "scheduler.last_run_min_ago");
const heartbeat = (s: Signal[]) => s.find((x) => x.metric === "scheduler.heartbeat_age_min");

let nowMs = 0;
const minutesAgo = (min: number) => new Date(nowMs - min * 60_000).toISOString();

describe("scheduler-collector — heartbeat fresco declassa last_run_min_ago", () => {
  beforeEach(() => {
    nowMs = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    getAppSettingMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("senza heartbeat (loop morto): last_run vecchio (>180min) → high", async () => {
    getAppSettingMock.mockResolvedValue({ valueJson: { lastRunAt: minutesAgo(200) } });
    const collectScheduler = await loadCollector();
    const signals = await collectScheduler();
    expect(lastRun(signals)?.severity).toBe("high");
    expect(lastRun(signals)?.details).toMatchObject({ schedulerAlive: false });
  });

  it("heartbeat fresco (loop vivo): stesso last_run vecchio → declassato a warn", async () => {
    getAppSettingMock.mockResolvedValue({
      valueJson: { lastRunAt: minutesAgo(200), lastTickAt: minutesAgo(1), lastTickResult: "skip:pool_saturated" },
    });
    const collectScheduler = await loadCollector();
    const signals = await collectScheduler();

    expect(heartbeat(signals)?.severity).toBe("info"); // tick recentissimo
    const lr = lastRun(signals);
    expect(lr?.severity).toBe("warn");
    expect(lr?.details).toMatchObject({ schedulerAlive: true, lastTickResult: "skip:pool_saturated" });
  });

  it("heartbeat stantio (oltre 130min): il loop è considerato morto → high", async () => {
    getAppSettingMock.mockResolvedValue({
      valueJson: { lastRunAt: minutesAgo(200), lastTickAt: minutesAgo(200) },
    });
    const collectScheduler = await loadCollector();
    const signals = await collectScheduler();

    expect(heartbeat(signals)?.severity).toBe("high");
    expect(lastRun(signals)?.severity).toBe("high");
  });
});
