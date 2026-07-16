/**
 * Task #338 — Service write helpers invalidate the storage app_settings cache.
 *
 * When backup-service, export-service, or sync-service write an AppSetting key
 * via storage.upsertAppSetting(), the next storage.getAppSetting() call on that
 * key must return the fresh DB value — not a value cached up to 60 seconds ago
 * by a prior read from an admin route.
 *
 * Strategy
 * --------
 * For each service write function:
 *   1. Warm the in-memory cache for the target key via storage.getAppSetting().
 *      (mockDbSelect returns the old value; cache stores it.)
 *   2. Call the service write function — it calls storage.upsertAppSetting(),
 *      which deletes the key from _appSettingsCache.
 *   3. Assert that the next storage.getAppSetting() call bypasses the cache
 *      (mockDbSelect is called again) and returns the new value, not the stale one.
 *
 * The test shares the same storage singleton that the services use, so cache
 * state is authentic. mockDbSelect uses per-call return values to simulate the
 * DB returning old values before the write and new values after invalidation.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Hoisted: env + DB mock handles ───────────────────────────────────────────

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
  // Prevent backup scheduler from doing extra DB reads in restartSchedulerWithNewFrequency
  process.env.BACKUP_AUTO_ENABLED = "false";
});

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

// ── Mock: database ────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: vi.fn(),
    delete: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  },
  withDbRetry: <T>(fn: () => T): T => fn(),
  isPoolHealthy: () => true,
}));

// ── Mock: storage inheritance base ────────────────────────────────────────────
// Prevents the AdsStorage → ... chain from needing real DB connections.

vi.mock("../storage/ads", () => ({ AdsStorage: class {} }));

// ── Mock: @shared/db schema objects ───────────────────────────────────────────

vi.mock("@shared/db", () => ({
  appSettings: { key: "key" },
  otaReleases: {},
  thinkcentreHealthEvents: {},
  users: {},
  notifications: {},
  invitationCodes: {},
  feedbackTickets: {},
  phoneSharingTracker: {},
  workshopContacts: {},
}));

// ── Mock: drizzle-orm (keep real operators) ───────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

// ── Mock: external service dependencies ──────────────────────────────────────
// These modules are imported by the services but not invoked by the specific
// write functions under test (setBackupFrequency, setExportSchedule, upsertAppSetting).

vi.mock("../objectStorage", () => ({
  uploadBuffer: vi.fn(async () => {}),
  downloadBuffer: vi.fn(async () => Buffer.alloc(0)),
  listObjects: vi.fn(async () => []),
}));

vi.mock("../google-drive-backup", () => ({
  uploadBackupToGDrive: vi.fn(async () => {}),
}));

vi.mock("../ai/coordinator/gated-job", () => ({
  withJobGate: (_name: string, fn: () => Promise<void>) => fn,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type AppSettingRow = { key: string; value: string | null; valueJson: unknown };

/**
 * Returns a thenable db.select() chain.
 * Supports both:
 *   await db.select().from(t).where(w)          (backup/export readSetting)
 *   await db.select().from(t).where(w).limit(n)  (storage.getAppSetting)
 */
function makeSelectChain(rows: AppSettingRow[]) {
  const p = Promise.resolve(rows);
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => p,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return chain;
}

/** Returns an insert chain that resolves with `returning`. */
function makeInsertChain(returning: AppSettingRow[]) {
  return {
    values: () => ({
      onConflictDoUpdate: () => ({
        returning: () => Promise.resolve(returning),
      }),
    }),
  };
}

function makeRow(key: string, value: string | null, valueJson: unknown = null): AppSettingRow {
  return { key, value, valueJson };
}

// ── Imports (after mocks are registered) ─────────────────────────────────────

import { storage } from "../storage";
import { setBackupFrequency, setAutoBackupEnabled } from "../backup-service";
import { setExportSchedule } from "../export-service";

// ── Test suite ────────────────────────────────────────────────────────────────

describe("service write helpers → storage cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the module-level _appSettingsCache so each test starts fresh.
    storage.invalidateAppSettingCache();
  });

  afterEach(() => {
    storage.invalidateAppSettingCache();
  });

  // ── backup-service: setBackupFrequency ──────────────────────────────────────

  describe("backup-service — setBackupFrequency", () => {
    it("invalidates backup.freq_db_hours so storage.getAppSetting returns the new value", async () => {
      // ① Warm cache: storage.getAppSetting returns old value "24"
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup.freq_db_hours", "24")]),
      );
      const before = await storage.getAppSetting("backup.freq_db_hours");
      expect(before?.value).toBe("24");

      // setBackupFrequency internally reads both freq keys via db.select() (backup's own readSetting,
      // bypassing the storage cache).  Provide return values for those two reads:
      mockDbSelect
        .mockReturnValueOnce(makeSelectChain([makeRow("backup.freq_db_hours", "24")])) // getBackupFrequency → freq_db_hours
        .mockReturnValueOnce(makeSelectChain([makeRow("backup.freq_media_hours", "24")])); // getBackupFrequency → freq_media_hours

      // The two upsertSetting calls → storage.upsertAppSetting → db.insert
      mockDbInsert
        .mockReturnValueOnce(makeInsertChain([makeRow("backup.freq_db_hours", "48")]))
        .mockReturnValueOnce(makeInsertChain([makeRow("backup.freq_media_hours", "24")]));

      // ② Call service write: updates dbHours to 48.
      // BACKUP_AUTO_ENABLED=false → restartSchedulerWithNewFrequency returns early (no extra DB calls).
      await setBackupFrequency({ dbHours: 48 });

      // ③ Cache must be invalidated: DB should be queried again and return the new value.
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup.freq_db_hours", "48")]),
      );
      const after = await storage.getAppSetting("backup.freq_db_hours");
      expect(after?.value).toBe("48");

      // Confirm mockDbSelect was called after the write (not served from cache).
      // Calls: warmup(1) + getBackupFrequency(2) + post-write re-read(1) = 4
      expect(mockDbSelect).toHaveBeenCalledTimes(4);
    });

    it("invalidates backup.freq_media_hours so storage.getAppSetting returns the new value", async () => {
      // ① Warm cache for media hours key
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup.freq_media_hours", "168")]),
      );
      const before = await storage.getAppSetting("backup.freq_media_hours");
      expect(before?.value).toBe("168");

      // DB reads inside getBackupFrequency
      mockDbSelect
        .mockReturnValueOnce(makeSelectChain([makeRow("backup.freq_db_hours", "24")]))
        .mockReturnValueOnce(makeSelectChain([makeRow("backup.freq_media_hours", "168")]));

      // upserts for both keys
      mockDbInsert
        .mockReturnValueOnce(makeInsertChain([makeRow("backup.freq_db_hours", "24")]))
        .mockReturnValueOnce(makeInsertChain([makeRow("backup.freq_media_hours", "72")]));

      // ② Service write: change mediaHours to 72
      await setBackupFrequency({ mediaHours: 72 });

      // ③ Cache cleared — fresh DB read returns the new value
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup.freq_media_hours", "72")]),
      );
      const after = await storage.getAppSetting("backup.freq_media_hours");
      expect(after?.value).toBe("72");

      // Calls: warmup(1) + getBackupFrequency(2) + post-write re-read(1) = 4
      expect(mockDbSelect).toHaveBeenCalledTimes(4);
    });
  });

  // ── backup-service: setAutoBackupEnabled ───────────────────────────────────

  describe("backup-service — setAutoBackupEnabled", () => {
    it("invalidates backup_auto_enabled so storage.getAppSetting returns the updated flag", async () => {
      // ① Warm cache
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup_auto_enabled", "true")]),
      );
      const before = await storage.getAppSetting("backup_auto_enabled");
      expect(before?.value).toBe("true");

      // setAutoBackupEnabled(false) → upsertSetting("backup_auto_enabled", "false") → db.insert
      // Because BACKUP_AUTO_ENABLED env is "false", startScheduler/stopScheduler from the
      // `if (enabled)` branch is not reached (enabled=false → else branch: stopScheduler, no DB).
      mockDbInsert.mockReturnValueOnce(
        makeInsertChain([makeRow("backup_auto_enabled", "false")]),
      );

      // ② Service write
      await setAutoBackupEnabled(false);

      // ③ Cache cleared — re-read hits DB
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup_auto_enabled", "false")]),
      );
      const after = await storage.getAppSetting("backup_auto_enabled");
      expect(after?.value).toBe("false");

      // Calls: warmup(1) + post-write re-read(1) = 2
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });
  });

  // ── export-service: setExportSchedule ──────────────────────────────────────

  describe("export-service — setExportSchedule", () => {
    it("invalidates exports.schedule so storage.getAppSetting returns the updated schedule", async () => {
      // ① Warm cache with "weekly"
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("exports.schedule", "weekly")]),
      );
      const before = await storage.getAppSetting("exports.schedule");
      expect(before?.value).toBe("weekly");

      // setExportSchedule("off"):
      //   → upsertSetting("exports.schedule", "off") → db.insert (cache invalidated)
      //   → restartScheduler() → getExportSchedule() → readSetting → db.select → "off"
      //     → getScheduleIntervalMs("off") === null → stopExportScheduler() → returns
      mockDbInsert.mockReturnValueOnce(
        makeInsertChain([makeRow("exports.schedule", "off")]),
      );
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("exports.schedule", "off")]), // readSetting inside restartScheduler
      );

      // ② Service write
      await setExportSchedule("off");

      // ③ Cache cleared — re-read hits DB and returns "off"
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("exports.schedule", "off")]),
      );
      const after = await storage.getAppSetting("exports.schedule");
      expect(after?.value).toBe("off");

      // Calls: warmup(1) + restartScheduler's readSetting(1) + post-write re-read(1) = 3
      expect(mockDbSelect).toHaveBeenCalledTimes(3);
    });

    it("invalidates exports.schedule when switching from off to daily", async () => {
      // ① Warm cache with "off"
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("exports.schedule", "off")]),
      );
      const before = await storage.getAppSetting("exports.schedule");
      expect(before?.value).toBe("off");

      // setExportSchedule("daily"):
      //   → upsertSetting → db.insert (cache invalidated)
      //   → restartScheduler() → getExportSchedule() → readSetting → "daily"
      //   → startExportScheduler() → getExportSchedule() → readSetting → "daily"
      //     (then schedules a timer with unref — won't block the test)
      mockDbInsert.mockReturnValueOnce(
        makeInsertChain([makeRow("exports.schedule", "daily")]),
      );
      mockDbSelect
        .mockReturnValueOnce(makeSelectChain([makeRow("exports.schedule", "daily")])) // restartScheduler
        .mockReturnValueOnce(makeSelectChain([makeRow("exports.schedule", "daily")])); // startExportScheduler

      // ② Service write
      await setExportSchedule("daily");

      // ③ Cache cleared — re-read hits DB and returns "daily"
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("exports.schedule", "daily")]),
      );
      const after = await storage.getAppSetting("exports.schedule");
      expect(after?.value).toBe("daily");

      // Cache was NOT served (would have returned "off") — DB was queried
      expect(after?.value).not.toBe("off");
      // Calls: warmup(1) + restartScheduler(1) + startExportScheduler(1) + post-write re-read(1) = 4
      expect(mockDbSelect).toHaveBeenCalledTimes(4);
    });
  });

  // ── sync-service: reads go through storage cache ───────────────────────────
  //
  // sync-service.ts uses storage.getAppSetting() for both reads and writes, so
  // cache coherence is guaranteed by the storage contract itself. The test below
  // confirms that a direct storage.upsertAppSetting() call (as performed by the
  // sync write helpers) removes the key from the cache — verified by counting
  // DB select calls after a write.

  describe("sync-service — upsertAppSetting contract (storage layer)", () => {
    it("invalidates sync.last so the next storage.getAppSetting returns the updated sync metadata", async () => {
      const oldMeta = { ok: false, startedAt: "2026-01-01T00:00:00Z" };
      const newMeta = { ok: true, startedAt: "2026-07-16T10:00:00Z", finishedAt: "2026-07-16T10:01:00Z" };

      // ① Warm cache with old metadata
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("sync.last", null, oldMeta)]),
      );
      const before = await storage.getAppSetting("sync.last");
      expect(before?.valueJson).toEqual(oldMeta);

      // ② Simulate what sync-service's upsertJsonSetting does when syncProdToDev finishes:
      //    it calls storage.upsertAppSetting(key, undefined, value, description)
      mockDbInsert.mockReturnValueOnce(
        makeInsertChain([makeRow("sync.last", null, newMeta)]),
      );
      await storage.upsertAppSetting("sync.last", undefined, newMeta, "Ultimo sync prod→dev");

      // ③ Cache cleared — next read hits DB and returns new metadata
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("sync.last", null, newMeta)]),
      );
      const after = await storage.getAppSetting("sync.last");
      expect(after?.valueJson).toEqual(newMeta);

      // Calls: warmup(1) + post-write re-read(1) = 2
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });

    it("invalidates sync.next_at so the next storage.getAppSetting returns the updated schedule", async () => {
      const oldNextAt = "2026-07-16T00:00:00Z";
      const newNextAt = "2026-07-16T06:00:00Z";

      // ① Warm cache
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("sync.next_at", oldNextAt)]),
      );
      const before = await storage.getAppSetting("sync.next_at");
      expect(before?.value).toBe(oldNextAt);

      // ② Service write (upsertSetting in sync-service)
      mockDbInsert.mockReturnValueOnce(
        makeInsertChain([makeRow("sync.next_at", newNextAt)]),
      );
      await storage.upsertAppSetting("sync.next_at", newNextAt, undefined, "Prossimo sync prod→dev");

      // ③ Cache cleared
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("sync.next_at", newNextAt)]),
      );
      const after = await storage.getAppSetting("sync.next_at");
      expect(after?.value).toBe(newNextAt);

      // Calls: warmup(1) + post-write re-read(1) = 2
      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });
  });

  // ── Cross-service: stale cache scenario ──────────────────────────────────────
  //
  // This is the exact race the task describes: an admin route warms the cache
  // for a backup key, then a backup-service write runs, and the admin route
  // reads again — it must see the fresh value, not the 60-second-old one.

  describe("cross-service stale cache scenario", () => {
    it("admin route read after backup write returns fresh value, not 60-second stale one", async () => {
      // Simulate admin route warming cache (e.g. GET /api/admin/backup/status)
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup.freq_db_hours", "24")]),
      );
      const adminReadBefore = await storage.getAppSetting("backup.freq_db_hours");
      expect(adminReadBefore?.value).toBe("24");

      // Confirm cache is warm: same read should NOT call the DB again
      const cached = await storage.getAppSetting("backup.freq_db_hours");
      expect(cached?.value).toBe("24");
      expect(mockDbSelect).toHaveBeenCalledTimes(1); // no extra call

      // Backup service writes new frequency — provides DB reads it needs internally
      mockDbSelect
        .mockReturnValueOnce(makeSelectChain([makeRow("backup.freq_db_hours", "24")]))
        .mockReturnValueOnce(makeSelectChain([makeRow("backup.freq_media_hours", "24")]));
      mockDbInsert
        .mockReturnValueOnce(makeInsertChain([makeRow("backup.freq_db_hours", "12")]))
        .mockReturnValueOnce(makeInsertChain([makeRow("backup.freq_media_hours", "24")]));

      await setBackupFrequency({ dbHours: 12 });

      // Admin route reads again — must NOT get the stale "24" from cache
      mockDbSelect.mockReturnValueOnce(
        makeSelectChain([makeRow("backup.freq_db_hours", "12")]),
      );
      const adminReadAfter = await storage.getAppSetting("backup.freq_db_hours");
      expect(adminReadAfter?.value).toBe("12");
      expect(adminReadAfter?.value).not.toBe("24"); // not stale

      // Total selects: warmup(1) + getBackupFrequency in service(2) + post-write admin re-read(1) = 4
      expect(mockDbSelect).toHaveBeenCalledTimes(4);
    });
  });
});
