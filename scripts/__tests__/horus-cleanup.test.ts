/**
 * Unit tests for scripts/lib/horus-cleanup.ts
 *
 * Covers:
 *  - normalizeTitle:        lowercasing, punctuation stripping, whitespace collapse
 *  - jaccardSimilarity:     correct set-intersection arithmetic
 *  - cleanupStaleHorusFiles: fixture-based filesystem tests that confirm:
 *      • horus files whose title is highly similar (≥0.7) to a numbered task
 *        are deleted
 *      • horus files with distinct titles (even when sharing common words) are
 *        kept — i.e. no false positives for short or common-word-heavy titles
 *      • horus files with no H1 heading are skipped (not deleted)
 *      • the function is a no-op when there are no horus files or no numbered
 *        task files
 *      • the return value correctly counts only removed files
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  normalizeTitle,
  jaccardSimilarity,
  cleanupStaleHorusFiles,
} from "../lib/horus-cleanup";

// ─── normalizeTitle ───────────────────────────────────────────────────────────

describe("normalizeTitle", () => {
  it("lowercases the input", () => {
    expect(normalizeTitle("Alert Admins Via Push")).toBe("alert admins via push");
  });

  it("strips punctuation", () => {
    expect(normalizeTitle("Fix the bug (critical!)")).toBe("fix the bug critical");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeTitle("Fix  the   bug")).toBe("fix the bug");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTitle("  hello world  ")).toBe("hello world");
  });

  it("handles an already-clean string without modification", () => {
    expect(normalizeTitle("confirm scheduler heartbeat")).toBe("confirm scheduler heartbeat");
  });
});

// ─── jaccardSimilarity ───────────────────────────────────────────────────────

describe("jaccardSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(jaccardSimilarity("alert admins via push", "alert admins via push")).toBe(1);
  });

  it("returns 0 for completely disjoint strings", () => {
    expect(jaccardSimilarity("foo bar", "baz qux")).toBe(0);
  });

  it("returns 0 for two empty strings", () => {
    expect(jaccardSimilarity("", "")).toBe(0);
  });

  it("computes partial overlap correctly", () => {
    // "alert admins watchdog" ∩ "alert admins push" = {alert, admins} → 2
    // union = {alert, admins, watchdog, push} → 4 → Jaccard = 0.5
    expect(jaccardSimilarity("alert admins watchdog", "alert admins push")).toBeCloseTo(0.5);
  });

  it("is symmetric", () => {
    const a = "confirm scheduler heartbeat recovery";
    const b = "heartbeat recovery scheduler";
    expect(jaccardSimilarity(a, b)).toBeCloseTo(jaccardSimilarity(b, a));
  });

  it("is ≥0.7 for two near-identical long titles", () => {
    const a = "alert admins via push when ota sync repeatedly fails to reconcile eas records";
    const b = "alert admins via push when ota sync fails to reconcile eas records";
    expect(jaccardSimilarity(a, b)).toBeGreaterThanOrEqual(0.7);
  });

  it("is <0.7 for titles that share only a couple of common words", () => {
    // "alert watchdog" vs "alert scheduler" — common words but different subject
    const a = "alert admins watchdog timeout exceeded multiple times";
    const b = "alert admins scheduler heartbeat missing push";
    expect(jaccardSimilarity(a, b)).toBeLessThan(0.7);
  });
});

// ─── cleanupStaleHorusFiles — filesystem fixture tests ───────────────────────

/**
 * Helper: write a minimal markdown file with the given H1 title.
 */
function writeTaskFile(dir: string, filename: string, title: string): void {
  fs.writeFileSync(
    path.join(dir, filename),
    `# ${title}\n\nSome description.\n`,
    "utf8",
  );
}

describe("cleanupStaleHorusFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "horus-cleanup-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── no-op cases ──────────────────────────────────────────────────────────

  it("returns 0 when the directory does not exist", () => {
    expect(cleanupStaleHorusFiles(path.join(tmpDir, "nonexistent"))).toBe(0);
  });

  it("returns 0 when there are no horus-*.md files", () => {
    writeTaskFile(tmpDir, "467-fix-scheduler.md", "Fix the scheduler heartbeat");
    expect(cleanupStaleHorusFiles(tmpDir)).toBe(0);
  });

  it("returns 0 when there are no numbered task files", () => {
    writeTaskFile(tmpDir, "horus-alert-admins.md", "Alert admins via push when OTA sync fails");
    expect(cleanupStaleHorusFiles(tmpDir)).toBe(0);
  });

  it("returns 0 when the directory is empty", () => {
    expect(cleanupStaleHorusFiles(tmpDir)).toBe(0);
  });

  // ── should delete: highly similar titles ─────────────────────────────────

  it("removes a horus file when its title is nearly identical to a numbered task", () => {
    // Proposal and task differ only by one word — Jaccard >> 0.7
    writeTaskFile(
      tmpDir,
      "411-alert-ota-sync.md",
      "Alert admins via push when OTA sync repeatedly fails to reconcile EAS records",
    );
    writeTaskFile(
      tmpDir,
      "horus-alert-ota-sync.md",
      "Alert admins via push when OTA sync repeatedly fails to reconcile EAS records",
    );

    const removed = cleanupStaleHorusFiles(tmpDir);

    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, "horus-alert-ota-sync.md"))).toBe(false);
    // The numbered task file must be untouched
    expect(fs.existsSync(path.join(tmpDir, "411-alert-ota-sync.md"))).toBe(true);
  });

  it("removes a horus file whose title is a close paraphrase of a numbered task (≥0.7 Jaccard)", () => {
    // Drop one non-critical word — still above 0.7
    writeTaskFile(
      tmpDir,
      "134-tc-drift-alert.md",
      "Alert admins via push when the ThinkCentre app checkout first drifts not just when they open the health screen",
    );
    writeTaskFile(
      tmpDir,
      "horus-tc-drift-alert.md",
      "Alert admins via push when ThinkCentre checkout drifts not just when they open the health screen",
    );

    const removed = cleanupStaleHorusFiles(tmpDir);
    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, "horus-tc-drift-alert.md"))).toBe(false);
  });

  // ── should keep: distinct titles ─────────────────────────────────────────

  it("keeps a horus file whose title shares only common words with numbered tasks (false-positive guard)", () => {
    // Both mention "alert" and "admins", but the subjects are completely different
    writeTaskFile(
      tmpDir,
      "408-zombie-job-alert.md",
      "Show zombie job alerts in the admin push notifications not just in watchdog logs",
    );
    writeTaskFile(
      tmpDir,
      "horus-ota-sync-alert.md",
      "Alert admins via push when OTA sync repeatedly fails to reconcile EAS records",
    );

    const removed = cleanupStaleHorusFiles(tmpDir);
    expect(removed).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "horus-ota-sync-alert.md"))).toBe(true);
  });

  it("keeps a horus file that covers a genuinely different topic from all numbered tasks", () => {
    writeTaskFile(
      tmpDir,
      "467-graphhopper-areas-empty.md",
      "Confirm the GraphHopperBlock never crashes when areas data is empty or partially absent",
    );
    writeTaskFile(
      tmpDir,
      "horus-ssh-password-disabled.md",
      "Confirm SSH password auth stays disabled after a real ThinkCentre reboot",
    );

    const removed = cleanupStaleHorusFiles(tmpDir);
    expect(removed).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "horus-ssh-password-disabled.md"))).toBe(true);
  });

  it("keeps a horus file with a 2-word title unless it is an exact match", () => {
    // "watchdog alert" ≠ "show admins a watchdog alert in push" — should NOT be deleted
    writeTaskFile(tmpDir, "408-watchdog-alert.md", "Show admins a watchdog alert in push notifications");
    writeTaskFile(tmpDir, "horus-short.md", "Watchdog alert");

    const removed = cleanupStaleHorusFiles(tmpDir);
    expect(removed).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "horus-short.md"))).toBe(true);
  });

  it("deletes a horus file with a short title only when it is an exact word-set match", () => {
    writeTaskFile(tmpDir, "100-fix-scheduler.md", "Fix scheduler heartbeat");
    writeTaskFile(tmpDir, "horus-fix-scheduler.md", "Fix scheduler heartbeat");

    const removed = cleanupStaleHorusFiles(tmpDir);
    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, "horus-fix-scheduler.md"))).toBe(false);
  });

  // ── edge cases ───────────────────────────────────────────────────────────

  it("skips horus files that have no H1 heading", () => {
    writeTaskFile(tmpDir, "411-alert-ota.md", "Alert admins via push when OTA sync fails");
    // Write a horus file without an H1
    fs.writeFileSync(
      path.join(tmpDir, "horus-no-title.md"),
      "Some content without a heading\n",
      "utf8",
    );

    const removed = cleanupStaleHorusFiles(tmpDir);
    expect(removed).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "horus-no-title.md"))).toBe(true);
  });

  it("removes multiple stale horus files in one pass and returns the correct count", () => {
    writeTaskFile(
      tmpDir,
      "411-ota-sync.md",
      "Alert admins via push when OTA sync repeatedly fails to reconcile EAS records",
    );
    writeTaskFile(
      tmpDir,
      "134-tc-drift.md",
      "Alert admins via push when the ThinkCentre app checkout first drifts not just when they open the health screen",
    );
    // Two stale horus files
    writeTaskFile(
      tmpDir,
      "horus-ota-sync.md",
      "Alert admins via push when OTA sync repeatedly fails to reconcile EAS records",
    );
    writeTaskFile(
      tmpDir,
      "horus-tc-drift.md",
      "Alert admins via push when the ThinkCentre app checkout first drifts not just when they open the health screen",
    );
    // One horus file that should be kept
    writeTaskFile(
      tmpDir,
      "horus-ssh-disabled.md",
      "Confirm SSH password auth stays disabled after a real ThinkCentre reboot",
    );

    const removed = cleanupStaleHorusFiles(tmpDir);
    expect(removed).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, "horus-ota-sync.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "horus-tc-drift.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "horus-ssh-disabled.md"))).toBe(true);
  });

  it("does not touch the numbered task files under any circumstances", () => {
    const numberedFile = "411-ota-sync.md";
    writeTaskFile(
      tmpDir,
      numberedFile,
      "Alert admins via push when OTA sync repeatedly fails to reconcile EAS records",
    );
    writeTaskFile(
      tmpDir,
      "horus-ota-sync.md",
      "Alert admins via push when OTA sync repeatedly fails to reconcile EAS records",
    );

    cleanupStaleHorusFiles(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, numberedFile))).toBe(true);
  });
});
