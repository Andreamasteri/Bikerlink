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

  it("heartbeat stantio: il loop è considerato morto → scheduler_heartbeat_dead high", async () => {
    getAppSettingMock.mockResolvedValue({
      valueJson: { lastRunAt: minutesAgo(200), lastTickAt: minutesAgo(200) },
    });
    const collectScheduler = await loadCollector();
    const signals = await collectScheduler();

    // Task #157 — la morte del loop è segnalata dal segnale dedicato
    // scheduler_heartbeat_dead (high); heartbeat_age_min resta descrittivo (warn).
    const dead = signals.find((x) => x.metric === "scheduler_heartbeat_dead");
    expect(dead?.severity).toBe("high");
    expect(dead?.value).toBe(200);
    expect(heartbeat(signals)?.severity).toBe("warn");
    expect(lastRun(signals)?.severity).toBe("high");
  });

  it("heartbeat entro la soglia dead (default 5min): nessun scheduler_heartbeat_dead", async () => {
    getAppSettingMock.mockResolvedValue({
      valueJson: { lastRunAt: minutesAgo(10), lastTickAt: minutesAgo(3) },
    });
    const collectScheduler = await loadCollector();
    const signals = await collectScheduler();
    expect(signals.find((x) => x.metric === "scheduler_heartbeat_dead")).toBeUndefined();
  });

  it("soglia configurabile via scheduler_dead_threshold_ms", async () => {
    getAppSettingMock.mockImplementation(async (key: string) => {
      if (key === "scheduler_dead_threshold_ms") return { value: String(30 * 60_000) };
      return { valueJson: { lastRunAt: minutesAgo(10), lastTickAt: minutesAgo(20) } };
    });
    const collectScheduler = await loadCollector();
    const signals = await collectScheduler();
    // 20min di silenzio ma soglia 30min → non morto
    expect(signals.find((x) => x.metric === "scheduler_heartbeat_dead")).toBeUndefined();
  });

  it("zombie recovery recente → segnale info scheduler.zombie_recovered", async () => {
    getAppSettingMock.mockResolvedValue({
      valueJson: { lastRunAt: minutesAgo(10), lastTickAt: minutesAgo(1), lastZombieRecoveredAt: minutesAgo(30) },
    });
    const collectScheduler = await loadCollector();
    const signals = await collectScheduler();
    const rec = signals.find((x) => x.metric === "scheduler.zombie_recovered");
    expect(rec?.severity).toBe("info");
    expect(rec?.value).toBe(30);
  });
});
