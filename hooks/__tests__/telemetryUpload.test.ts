/**
 * Tests for crash-recovery checkpoint logic.
 * Exercises the real exported pure helpers from useTelemetryUpload:
 *   writeCheckpoint, removeCrashCheckpoint, drainRecoverableKeys
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  UNSENT_PREFIX,
  CRASH_RECOVERY_PREFIX,
  CHECKPOINT_INTERVAL_MS,
  writeCheckpoint,
  removeCrashCheckpoint,
  drainRecoverableKeys,
} from "@/hooks/useTelemetryUpload";
import type { TelemetrySample } from "@shared/tracking-fusion";

// ── In-memory AsyncStorage mock ───────────────────────────────────────────────
const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem:    async (k: string, v: string) => { store.set(k, v); },
    getItem:    async (k: string) => store.get(k) ?? null,
    removeItem: async (k: string) => { store.delete(k); },
    getAllKeys:  async () => Array.from(store.keys()),
  },
}));

vi.mock("@/lib/query-client", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
  getApiUrl: () => "http://localhost:5000",
}));

vi.mock("@/lib/background-telemetry-task", () => ({
  BG_TELEMETRY_SESSION_KEY: "@bikerlink/bg_telemetry_session",
  drainBackgroundTelemetryBuffer: vi.fn(async () => []),
  startTelemetryBackgroundTask: vi.fn(),
  stopTelemetryBackgroundTask: vi.fn(),
}));

vi.mock("@shared/tracking-fusion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/tracking-fusion")>();
  return { ...actual };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeSample(ts = Date.now()): TelemetrySample {
  return { ts, lat: 45.0, lon: 9.0 };
}

// ── Shared postFn mock ────────────────────────────────────────────────────────
const postFn = vi.fn(async (_sid: string, _samples: TelemetrySample[]) => {});

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  postFn.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("constants", () => {
  it("CRASH_RECOVERY_PREFIX is distinct from UNSENT_PREFIX", () => {
    expect(CRASH_RECOVERY_PREFIX).not.toBe(UNSENT_PREFIX);
    expect(CRASH_RECOVERY_PREFIX).toContain("bikerlink");
  });

  it("CHECKPOINT_INTERVAL_MS is 30 seconds", () => {
    expect(CHECKPOINT_INTERVAL_MS).toBe(30_000);
  });
});

describe("writeCheckpoint", () => {
  it("writes crash-recovery key with correct structure", async () => {
    const sid     = "session-abc";
    const samples = [makeSample(), makeSample()];

    await writeCheckpoint(sid, samples);

    const raw = store.get(`${CRASH_RECOVERY_PREFIX}${sid}`);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.sessionId).toBe(sid);
    expect(parsed.samples).toHaveLength(2);
  });

  it("removes crash-recovery key when buffer is empty", async () => {
    const sid = "session-xyz";
    const key = `${CRASH_RECOVERY_PREFIX}${sid}`;
    store.set(key, JSON.stringify({ sessionId: sid, samples: [makeSample()] }));

    await writeCheckpoint(sid, []);

    expect(store.has(key)).toBe(false);
  });

  it("overwrites previous checkpoint with latest buffer snapshot", async () => {
    const sid   = "session-overwrite";
    const old   = [makeSample(1000)];
    const fresh = [makeSample(2000), makeSample(3000)];

    await writeCheckpoint(sid, old);
    await writeCheckpoint(sid, fresh);

    const raw    = store.get(`${CRASH_RECOVERY_PREFIX}${sid}`)!;
    const parsed = JSON.parse(raw);
    expect(parsed.samples).toHaveLength(2);
    expect(parsed.samples[0].ts).toBe(2000);
  });
});

describe("removeCrashCheckpoint", () => {
  it("removes the crash-recovery key on clean stop", async () => {
    const sid = "session-clean";
    const key = `${CRASH_RECOVERY_PREFIX}${sid}`;
    store.set(key, JSON.stringify({ sessionId: sid, samples: [makeSample()] }));

    await removeCrashCheckpoint(sid);

    expect(store.has(key)).toBe(false);
  });

  it("is a no-op when the key does not exist", async () => {
    await expect(removeCrashCheckpoint("nonexistent-session")).resolves.not.toThrow();
  });
});

describe("drainRecoverableKeys", () => {
  it("drains crash-recovery key and calls postFn with correct args", async () => {
    const sid     = "crashed-session";
    const samples = [makeSample(), makeSample(), makeSample()];
    await writeCheckpoint(sid, samples);

    const drained = await drainRecoverableKeys(postFn);

    expect(drained).toEqual([sid]);
    expect(postFn).toHaveBeenCalledOnce();
    expect(postFn).toHaveBeenCalledWith(sid, samples);
  });

  it("removes crash-recovery key from storage after draining", async () => {
    const sid = "crashed-session-2";
    await writeCheckpoint(sid, [makeSample()]);

    await drainRecoverableKeys(postFn);

    expect(store.has(`${CRASH_RECOVERY_PREFIX}${sid}`)).toBe(false);
  });

  it("drains both UNSENT and CRASH_RECOVERY keys in the same pass", async () => {
    const unsentSid = "unsent-session";
    const crashSid  = "crash-session";

    store.set(
      `${UNSENT_PREFIX}${unsentSid}`,
      JSON.stringify({ sessionId: unsentSid, samples: [makeSample()] })
    );
    await writeCheckpoint(crashSid, [makeSample(), makeSample()]);

    const drained = await drainRecoverableKeys(postFn);

    expect(drained.sort()).toEqual([crashSid, unsentSid].sort());
    expect(postFn).toHaveBeenCalledTimes(2);
    expect(store.has(`${UNSENT_PREFIX}${unsentSid}`)).toBe(false);
    expect(store.has(`${CRASH_RECOVERY_PREFIX}${crashSid}`)).toBe(false);
  });

  it("removes crash-recovery key even when postFn throws", async () => {
    postFn.mockRejectedValueOnce(new Error("network error"));

    const sid = "crash-network-fail";
    await writeCheckpoint(sid, [makeSample()]);

    await drainRecoverableKeys(postFn);

    expect(store.has(`${CRASH_RECOVERY_PREFIX}${sid}`)).toBe(false);
  });

  it("skips crash-recovery key if samples array is empty", async () => {
    const sid = "crash-empty";
    store.set(
      `${CRASH_RECOVERY_PREFIX}${sid}`,
      JSON.stringify({ sessionId: sid, samples: [] })
    );

    const drained = await drainRecoverableKeys(postFn);

    expect(drained).toHaveLength(0);
    expect(postFn).not.toHaveBeenCalled();
    expect(store.has(`${CRASH_RECOVERY_PREFIX}${sid}`)).toBe(false);
  });

  it("returns empty array when no recoverable keys exist", async () => {
    const drained = await drainRecoverableKeys(postFn);
    expect(drained).toHaveLength(0);
    expect(postFn).not.toHaveBeenCalled();
  });
});
