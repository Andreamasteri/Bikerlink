/**
 * Task #453 — Confirm the architect format alert fires when Horus sends a
 * bullet list instead of a table.
 *
 * emitArchitectFormatAlert() reads horus-tasks-pending.json and, when
 * `hasArchitectReview === true` and `architectFormatValid === false`, must:
 *   1. INSERT a system_signals row with source='horus',
 *      metric='architect.format_invalid', severity='high'.
 *   2. Attempt to fetch admin push tokens (and send a push if any exist).
 *
 * We test (1) by mocking db.execute and asserting the INSERT call.
 * We skip the push leg by returning no tokens from the SELECT mock, so no
 * real Expo API or push token is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

// ─── Hoist mocks before any imports ──────────────────────────────────────────

const dbExecuteMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/db", () => ({
  db: { execute: dbExecuteMock },
}));

vi.mock("../../server/lib/cf-access", () => ({
  cfAccessHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../lib/horus-sources", () => ({
  collectGitHub: vi.fn().mockResolvedValue({ issues: [], actions: [] }),
  collectSentry: vi.fn().mockResolvedValue({ events: [] }),
  collectGitHubRepoTree: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/horus-trim", () => ({
  estimateTokens: vi.fn().mockReturnValue(0),
  fmtSection: vi.fn().mockReturnValue(""),
  trimBundleToFit: vi.fn().mockReturnValue({ bundle: "", trimmed: [] }),
  TRIM_SECTIONS: [],
}));

vi.mock("../lib/horus-normalize", () => ({
  normalizeTaskSection: vi.fn().mockReturnValue(""),
}));

// Import the function under test AFTER mocks are registered.
import { emitArchitectFormatAlert } from "../log-analysis-horus";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a temporary directory, writes the manifest file, and returns the dir path. */
function writeSyntheticManifest(
  tmpDir: string,
  manifest: Record<string, unknown>,
): void {
  fs.writeFileSync(
    path.join(tmpDir, "horus-tasks-pending.json"),
    JSON.stringify(manifest),
    "utf8",
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("emitArchitectFormatAlert", () => {
  let tmpDir: string;
  let origHorusLogDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "horus-alert-test-"));
    origHorusLogDir = process.env.HORUS_LOG_DIR;
    // Point the function at the temp dir so it finds our synthetic manifest.
    process.env.HORUS_LOG_DIR = tmpDir;
    dbExecuteMock.mockReset();
  });

  afterEach(() => {
    if (origHorusLogDir === undefined) {
      delete process.env.HORUS_LOG_DIR;
    } else {
      process.env.HORUS_LOG_DIR = origHorusLogDir;
    }
    // Clean up temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ── Core case: invalid format → system_signals INSERT ──────────────────────

  it("inserts a system_signals row with source=horus, metric=architect.format_invalid, severity=high when architectFormatValid is false", async () => {
    writeSyntheticManifest(tmpDir, {
      hasArchitectReview: true,
      architectFormatValid: false,
      reportPath: "/tmp/horus-report.md",
      tasks: [],
    });

    // First call = INSERT system_signals (returns void/empty)
    // Second call = SELECT push tokens (returns empty → push skipped)
    dbExecuteMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await emitArchitectFormatAlert();

    // The INSERT must have been called.
    expect(dbExecuteMock).toHaveBeenCalled();

    // Inspect the first db.execute call — it must embed the expected strings.
    const firstCallArg = dbExecuteMock.mock.calls[0][0];
    const argStr = JSON.stringify(firstCallArg);

    expect(argStr).toContain("horus");
    expect(argStr).toContain("architect.format_invalid");
    expect(argStr).toContain("high");
  });

  // ── Guard: review not attempted → no INSERT ────────────────────────────────

  it("is a no-op when hasArchitectReview is false", async () => {
    writeSyntheticManifest(tmpDir, {
      hasArchitectReview: false,
      architectFormatValid: false,
      tasks: [],
    });

    await emitArchitectFormatAlert();

    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  // ── Guard: format valid → no INSERT ────────────────────────────────────────

  it("is a no-op when architectFormatValid is true", async () => {
    writeSyntheticManifest(tmpDir, {
      hasArchitectReview: true,
      architectFormatValid: true,
      tasks: [],
    });

    await emitArchitectFormatAlert();

    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  // ── Guard: architectFormatValid absent (undefined) → no INSERT ─────────────

  it("is a no-op when architectFormatValid is absent (field missing from manifest)", async () => {
    writeSyntheticManifest(tmpDir, {
      hasArchitectReview: true,
      // architectFormatValid intentionally omitted
      tasks: [],
    });

    await emitArchitectFormatAlert();

    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  // ── Guard: manifest missing → no INSERT ───────────────────────────────────

  it("is a no-op when the manifest file does not exist", async () => {
    // Nothing written to tmpDir — manifest is absent.
    await emitArchitectFormatAlert();

    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  // ── Resilience: INSERT error is non-fatal ──────────────────────────────────

  it("does not throw when the system_signals INSERT fails", async () => {
    writeSyntheticManifest(tmpDir, {
      hasArchitectReview: true,
      architectFormatValid: false,
    });

    // Simulate DB error on the INSERT.
    dbExecuteMock.mockRejectedValueOnce(new Error("DB connection refused"));

    // Should resolve without throwing (errors are logged as warnings).
    await expect(emitArchitectFormatAlert()).resolves.toBeUndefined();
  });

  // ── Push token query: 2nd db.execute call fetches tokens ──────────────────

  it("queries push tokens from DB as the second db.execute call after the INSERT", async () => {
    writeSyntheticManifest(tmpDir, {
      hasArchitectReview: true,
      architectFormatValid: false,
    });

    dbExecuteMock
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // SELECT tokens → empty → push skipped

    await emitArchitectFormatAlert();

    // Two db.execute calls expected: INSERT + SELECT push tokens.
    expect(dbExecuteMock).toHaveBeenCalledTimes(2);
  });
});
