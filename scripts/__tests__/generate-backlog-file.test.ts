/**
 * Unit tests for scripts/lib/horus-backlog.ts
 *
 * Covers:
 *  - parseFrontmatterState: various frontmatter shapes
 *  - loadCancelledRefs: valid file, missing file, malformed JSON
 *  - collectBacklogTitles: excluded by ref-list, excluded by frontmatter state,
 *    included normally, behaviour when refs source is missing/empty
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  parseFrontmatterState,
  loadCancelledRefs,
  collectBacklogTitles,
  CLOSED_STATES,
} from "../lib/horus-backlog";

// ─── parseFrontmatterState ────────────────────────────────────────────────────

describe("parseFrontmatterState", () => {
  it("returns null for a plain markdown file with no frontmatter", () => {
    const content = "# Fix Something\n\n## What & Why\nThis is a normal task.";
    expect(parseFrontmatterState(content)).toBeNull();
  });

  it("returns 'cancelled' for state: cancelled in frontmatter", () => {
    const content = "---\nstate: cancelled\n---\n# My Task\nSome content";
    expect(parseFrontmatterState(content)).toBe("cancelled");
  });

  it("returns 'merged' for state: merged in frontmatter", () => {
    const content = "---\nstate: merged\n---\n# My Task\nSome content";
    expect(parseFrontmatterState(content)).toBe("merged");
  });

  it("lowercases the state value", () => {
    const content = "---\nstate: Cancelled\n---\n# My Task";
    expect(parseFrontmatterState(content)).toBe("cancelled");
  });

  it("returns 'in_progress' (not in CLOSED_STATES) for an active task", () => {
    const content = "---\nstate: in_progress\n---\n# Active Task";
    const result = parseFrontmatterState(content);
    expect(result).toBe("in_progress");
    expect(CLOSED_STATES.has(result!)).toBe(false);
  });

  it("returns null when frontmatter has no state: field", () => {
    const content = "---\nauthor: horus\ndate: 2026-01-01\n---\n# Task";
    expect(parseFrontmatterState(content)).toBeNull();
  });

  it("returns null when frontmatter block is never closed", () => {
    const content = "---\nstate: cancelled\n# Task without closing ---";
    expect(parseFrontmatterState(content)).toBeNull();
  });

  it("ignores state: fields that appear after the frontmatter block", () => {
    const content = "# Task\n\nstate: cancelled";
    expect(parseFrontmatterState(content)).toBeNull();
  });
});

// ─── loadCancelledRefs ────────────────────────────────────────────────────────

describe("loadCancelledRefs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "horus-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty Set when the file does not exist", () => {
    const result = loadCancelledRefs(path.join(tmpDir, "nonexistent.json"));
    expect(result.size).toBe(0);
  });

  it("returns the correct Set of refs from a valid file", () => {
    const refsFile = path.join(tmpDir, "cancelled-refs.json");
    fs.writeFileSync(
      refsFile,
      JSON.stringify({ refs: ["154", "155", "450"], generatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );
    const result = loadCancelledRefs(refsFile);
    expect(result.size).toBe(3);
    expect(result.has("154")).toBe(true);
    expect(result.has("155")).toBe(true);
    expect(result.has("450")).toBe(true);
  });

  it("coerces numeric refs to strings", () => {
    const refsFile = path.join(tmpDir, "cancelled-refs.json");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fs.writeFileSync(refsFile, JSON.stringify({ refs: [154, 155] as any }), "utf8");
    const result = loadCancelledRefs(refsFile);
    expect(result.has("154")).toBe(true);
    expect(result.has("155")).toBe(true);
  });

  it("returns an empty Set when the file contains malformed JSON", () => {
    const refsFile = path.join(tmpDir, "bad.json");
    fs.writeFileSync(refsFile, "not valid json", "utf8");
    const result = loadCancelledRefs(refsFile);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set when refs field is missing", () => {
    const refsFile = path.join(tmpDir, "no-refs.json");
    fs.writeFileSync(refsFile, JSON.stringify({ generatedAt: "2026-01-01T00:00:00.000Z" }), "utf8");
    const result = loadCancelledRefs(refsFile);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set when refs field is not an array", () => {
    const refsFile = path.join(tmpDir, "bad-refs.json");
    fs.writeFileSync(refsFile, JSON.stringify({ refs: "154" }), "utf8");
    const result = loadCancelledRefs(refsFile);
    expect(result.size).toBe(0);
  });
});

// ─── collectBacklogTitles ─────────────────────────────────────────────────────

describe("collectBacklogTitles", () => {
  let tmpDir: string;

  function writeTask(filename: string, content: string): void {
    fs.writeFileSync(path.join(tmpDir, filename), content, "utf8");
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "horus-tasks-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes a normal task with no frontmatter", () => {
    writeTask("200-fix-something.md", "# Fix Something\n\n## What\nDoes a thing.\n");
    const result = collectBacklogTitles(["200-fix-something.md"], tmpDir, new Set());
    expect(result.titles).toContain("Fix Something");
    expect(result.skippedByRef).toBe(0);
    expect(result.skippedByFrontmatter).toBe(0);
  });

  it("excludes a numbered file whose ref is in the cancelled set", () => {
    writeTask("154-old-task.md", "# Old Task\n\n## What\nObsolete.\n");
    const result = collectBacklogTitles(["154-old-task.md"], tmpDir, new Set(["154"]));
    expect(result.titles).not.toContain("Old Task");
    expect(result.skippedByRef).toBe(1);
    expect(result.skippedByFrontmatter).toBe(0);
  });

  it("excludes a file with state: cancelled frontmatter", () => {
    writeTask(
      "horus-old-proposal.md",
      "---\nstate: cancelled\n---\n# Old Proposal\n\n## What\nAbandoned.\n",
    );
    const result = collectBacklogTitles(
      ["horus-old-proposal.md"],
      tmpDir,
      new Set(), // no refs-based exclusion
    );
    expect(result.titles).not.toContain("Old Proposal");
    expect(result.skippedByFrontmatter).toBe(1);
    expect(result.skippedByRef).toBe(0);
  });

  it("excludes a file with state: merged frontmatter", () => {
    writeTask(
      "300-merged-task.md",
      "---\nstate: merged\n---\n# Merged Task\n\n## What\nDone and merged.\n",
    );
    const result = collectBacklogTitles(["300-merged-task.md"], tmpDir, new Set());
    expect(result.titles).not.toContain("Merged Task");
    expect(result.skippedByFrontmatter).toBe(1);
  });

  it("does NOT exclude a file with state: in_progress frontmatter", () => {
    writeTask(
      "301-active-task.md",
      "---\nstate: in_progress\n---\n# Active Task\n\n## What\nStill running.\n",
    );
    const result = collectBacklogTitles(["301-active-task.md"], tmpDir, new Set());
    expect(result.titles).toContain("Active Task");
    expect(result.skippedByFrontmatter).toBe(0);
  });

  it("ref-based exclusion takes priority and avoids reading the file", () => {
    // File has state: in_progress but its ref is cancelled — ref wins
    writeTask(
      "400-surprising.md",
      "---\nstate: in_progress\n---\n# Surprising Task\n",
    );
    const result = collectBacklogTitles(["400-surprising.md"], tmpDir, new Set(["400"]));
    expect(result.titles).not.toContain("Surprising Task");
    expect(result.skippedByRef).toBe(1);
    expect(result.skippedByFrontmatter).toBe(0);
  });

  it("handles mixed files: some included, some excluded by ref, some by frontmatter", () => {
    writeTask("100-keep.md", "# Keep This\n\n## What\nStill needed.\n");
    writeTask("101-ref-excluded.md", "# Ref Excluded\n\n## What\nCancelled.\n");
    writeTask(
      "horus-fm-excluded.md",
      "---\nstate: cancelled\n---\n# FM Excluded\n\n## What\nAbandonware.\n",
    );

    const result = collectBacklogTitles(
      ["100-keep.md", "101-ref-excluded.md", "horus-fm-excluded.md"],
      tmpDir,
      new Set(["101"]),
    );

    expect(result.titles).toContain("Keep This");
    expect(result.titles).not.toContain("Ref Excluded");
    expect(result.titles).not.toContain("FM Excluded");
    expect(result.skippedByRef).toBe(1);
    expect(result.skippedByFrontmatter).toBe(1);
  });

  it("returns all titles when cancelled-refs set is empty and no frontmatter state", () => {
    writeTask("500-a.md", "# Task Alpha\n");
    writeTask("501-b.md", "# Task Beta\n");
    const result = collectBacklogTitles(["500-a.md", "501-b.md"], tmpDir, new Set());
    expect(result.titles).toContain("Task Alpha");
    expect(result.titles).toContain("Task Beta");
    expect(result.skippedByRef).toBe(0);
    expect(result.skippedByFrontmatter).toBe(0);
  });

  it("silently skips a file that cannot be read", () => {
    // File is listed but does not exist on disk
    const result = collectBacklogTitles(["999-nonexistent.md"], tmpDir, new Set());
    expect(result.titles).toHaveLength(0);
    expect(result.skippedByRef).toBe(0);
    expect(result.skippedByFrontmatter).toBe(0);
  });

  it("ignores files with no H1 heading", () => {
    writeTask("600-no-heading.md", "Just some prose without a heading.\n");
    const result = collectBacklogTitles(["600-no-heading.md"], tmpDir, new Set());
    expect(result.titles).toHaveLength(0);
  });

  it("horus-*.md files without frontmatter are included", () => {
    writeTask("horus-proposal.md", "# New Horus Proposal\n\n## What\nNeeded work.\n");
    const result = collectBacklogTitles(["horus-proposal.md"], tmpDir, new Set());
    expect(result.titles).toContain("New Horus Proposal");
  });
});
