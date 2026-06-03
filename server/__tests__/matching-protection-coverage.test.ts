/**
 * Tests: run-bio-affinity and run-distance apply PROTECTED_NICKNAMES filter
 *
 * Strategy: mock db.execute and assert that the SQL object passed to it contains
 * the BikerLink_Official exclusion clause, following the pattern in
 * protected-accounts-filter.test.ts.
 *
 * NOTE: vi.mock() paths are relative to THIS test file (server/__tests__/).
 * Modules imported by server/matching/*.ts that use relative paths like "../db"
 * resolve to the same canonical path as "../db" from here, so mocks apply.
 * But server/matching/filters uses "./filters" → canonical server/matching/filters,
 * so we must mock it as "../matching/filters".
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted mock handles ──────────────────────────────────────────────────────

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeQueryResult(rows: unknown[]): Awaited<ReturnType<typeof import("../db").db.execute>> {
  return { rows } as never;
}

/** Creates a chainable drizzle-like query builder that resolves to `resolveWith`. */
function makeSelectMock(resolveWith: unknown[] = []) {
  const builder: Record<string, unknown> = {};
  const methods = ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "groupBy"];
  methods.forEach((m) => { builder[m] = vi.fn().mockReturnValue(builder); });
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(resolveWith).then(resolve, reject);
  builder.catch = (reject: (e: unknown) => void) =>
    Promise.resolve(resolveWith).catch(reject);
  return builder;
}

// ── Module mocks (paths relative to server/__tests__/) ───────────────────────

vi.mock("../db", () => ({
  db: {
    execute: mockExecute,
    select: vi.fn(() => makeSelectMock()),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
        onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  pool: { query: vi.fn(), end: vi.fn(), connect: vi.fn(), on: vi.fn() },
}));

vi.mock("../storage", () => ({
  storage: {
    getAllBlockedPairs: vi.fn().mockResolvedValue([]),
    createMatch: vi.fn().mockResolvedValue({ id: "match-1" }),
    getMatchByUsers: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../embeddings", () => ({
  findSimilar: vi.fn().mockResolvedValue([]),
  EMBEDDING_MODEL_TAG: "nomic-embed-text",
}));

// NB: path relative to this test file → resolves to server/matching/filters
vi.mock("../matching/filters", () => ({
  loadMatchPreferencesMap: vi.fn().mockResolvedValue(new Map()),
  bothPrefsEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock("../geo", () => ({
  haversineKm: vi.fn().mockReturnValue(10),
}));

// NB: path relative to this test file → resolves to server/matching/scoring
vi.mock("../matching/scoring", () => ({
  routeProfileOf: vi.fn().mockReturnValue("balanced"),
}));

vi.mock("../matching/notifications/classify", () => ({
  classifyMatch: vi.fn().mockReturnValue("new"),
}));

vi.mock("../matching/notifications/dispatcher", () => ({
  dispatchMatchNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: vi.fn().mockResolvedValue("https://example.com/file"),
  objectExists: vi.fn().mockResolvedValue(false),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  downloadBuffer: vi.fn().mockResolvedValue(Buffer.from("")),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { db } from "../db";
import { runBioAffinityMatching } from "../matching/run-bio-affinity";
import { runDistanceMatching } from "../matching/run-distance";

// ── Shared assertion helpers ──────────────────────────────────────────────────

const PROTECTED_NICKNAME = "BikerLink_Official";

function sqlToJson(sqlObj: unknown): string {
  return JSON.stringify(sqlObj);
}

function anyCallHasProtectedFilter(): boolean {
  return vi.mocked(db.execute).mock.calls.some(
    (call) => sqlToJson(call[0]).includes(PROTECTED_NICKNAME),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue(fakeQueryResult([]));
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Bio Affinity — runBioAffinityMatching
// ═══════════════════════════════════════════════════════════════════════════════

describe("runBioAffinityMatching — protected account exclusion", () => {
  it("emits SQL containing the PROTECTED_NICKNAMES exclusion clause", async () => {
    await runBioAffinityMatching();
    expect(anyCallHasProtectedFilter()).toBe(true);
  });

  it("SQL contains BikerLink_Official in every db.execute call", async () => {
    await runBioAffinityMatching();
    const calls = vi.mocked(db.execute).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const allSql = calls.map((c) => sqlToJson(c[0])).join("\n");
    expect(allSql).toContain(PROTECTED_NICKNAME);
  });

  it("completes without throwing when db returns no rows", async () => {
    mockExecute.mockResolvedValue(fakeQueryResult([]));
    await expect(runBioAffinityMatching()).resolves.toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Distance Matching — runDistanceMatching (via fetchCentroidPairs)
// ═══════════════════════════════════════════════════════════════════════════════

describe("runDistanceMatching — protected account exclusion", () => {
  it("emits SQL containing the PROTECTED_NICKNAMES exclusion clause", async () => {
    await runDistanceMatching();
    expect(anyCallHasProtectedFilter()).toBe(true);
  });

  it("SQL contains BikerLink_Official in every db.execute call", async () => {
    await runDistanceMatching();
    const calls = vi.mocked(db.execute).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const allSql = calls.map((c) => sqlToJson(c[0])).join("\n");
    expect(allSql).toContain(PROTECTED_NICKNAME);
  });

  it("completes without throwing when db returns no centroid pairs", async () => {
    mockExecute.mockResolvedValue(fakeQueryResult([]));
    await expect(runDistanceMatching()).resolves.toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Canary — constants integrity
// ═══════════════════════════════════════════════════════════════════════════════

describe("Canary — PROTECTED_NICKNAMES constant", () => {
  it("exports a non-empty array containing BikerLink_Official", async () => {
    const { PROTECTED_NICKNAMES } = await import("../constants");
    expect(Array.isArray(PROTECTED_NICKNAMES)).toBe(true);
    expect(PROTECTED_NICKNAMES.length).toBeGreaterThan(0);
    expect(PROTECTED_NICKNAMES).toContain(PROTECTED_NICKNAME);
  });
});
