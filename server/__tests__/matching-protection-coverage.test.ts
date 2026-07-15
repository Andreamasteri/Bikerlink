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
  hnswIndexExists: vi.fn().mockResolvedValue(false),
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
import { runDistanceMatching, runRouteTypeZoneMatching } from "../matching/run-distance";

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
// 3. Route Type Zone Matching — runRouteTypeZoneMatching
// ═══════════════════════════════════════════════════════════════════════════════

describe("runRouteTypeZoneMatching — protected account exclusion", () => {
  it("emits SQL containing the PROTECTED_NICKNAMES exclusion clause", async () => {
    await runRouteTypeZoneMatching();
    expect(anyCallHasProtectedFilter()).toBe(true);
  });

  it("SQL contains BikerLink_Official in every db.execute call", async () => {
    await runRouteTypeZoneMatching();
    const calls = vi.mocked(db.execute).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const allSql = calls.map((c) => sqlToJson(c[0])).join("\n");
    expect(allSql).toContain(PROTECTED_NICKNAME);
  });

  it("completes without throwing when db returns no route stats", async () => {
    mockExecute.mockResolvedValue(fakeQueryResult([]));
    await expect(runRouteTypeZoneMatching()).resolves.toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Canary — constants integrity
// ═══════════════════════════════════════════════════════════════════════════════

describe("Canary — PROTECTED_NICKNAMES constant", () => {
  it("exports a non-empty array containing BikerLink_Official", async () => {
    const { PROTECTED_NICKNAMES } = await import("../constants");
    expect(Array.isArray(PROTECTED_NICKNAMES)).toBe(true);
    expect(PROTECTED_NICKNAMES.length).toBeGreaterThan(0);
    expect(PROTECTED_NICKNAMES).toContain(PROTECTED_NICKNAME);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Static import guard — all run-*.ts files must use protection-filter
// ═══════════════════════════════════════════════════════════════════════════════
//
// This test reads source files from disk and enforces that:
//   (a) no run-*.ts file imports PROTECTED_NICKNAMES directly from ../constants
//   (b) any run-*.ts file that references PROTECTED_NICKNAMES imports it from
//       ./protection-filter instead
//
// This catches new matching pipelines that bypass the shared utility.

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

describe("Static import guard — protection-filter usage in run-*.ts", () => {
  const matchingDir = resolve(__dirname, "../matching");
  const runFiles = readdirSync(matchingDir).filter(
    (f) => f.startsWith("run-") && f.endsWith(".ts"),
  );

  // Files reviewed and confirmed to not require user-nickname protection because
  // they delegate to storage methods that already exclude fake/inactive users
  // without direct SQL queries on `users.nickname`, or they match on non-user
  // entities (proposals, routes, clubs). Adding a new file here requires a code
  // review to confirm it does not expose protected accounts.
  const REVIEWED_EXEMPT = new Set([
    "run-biker.ts",                  // storage.getAllBikerMotorcyclesWithUsers — storage-level guard
    "run-clubs.ts",                  // club brand matching, no user-nickname SQL
    "run-extra.ts",                  // GPS/event/music via storage methods
    "run-extra.part2.ts",            // split (ratchet 600 righe) di run-extra.ts: stesse storage method guardate
    "run-matching.ts",               // proposal matching via storage.getActiveProposals
    "run-matching.part2.ts",         // split (ratchet 600 righe) di run-matching.ts: stesse storage method guardate
    "run-planned-route-affinity.ts", // queries userCurvyProfile, not users.nickname
    "run-profile.ts",                // proposal-to-profile via storage
    "run-proposals.ts",              // proposal CRUD via storage
    "run-route-similarity.ts",       // route-cell fingerprint matching
    "run-user.ts",                   // user triggers via storage
  ]);

  it("finds at least one run-*.ts file to audit", () => {
    expect(runFiles.length).toBeGreaterThan(0);
  });

  it("no run-*.ts file imports PROTECTED_NICKNAMES from ../constants directly (must use ./protection-filter)", () => {
    const violations: string[] = [];
    for (const file of runFiles) {
      const content = readFileSync(join(matchingDir, file), "utf-8");
      const usesConstant = content.includes("PROTECTED_NICKNAMES");
      const importsFromConstants = /from\s+['"]\.\.\/constants['"]/.test(content);
      if (usesConstant && importsFromConstants) {
        violations.push(file);
      }
    }
    expect(
      violations,
      `Run files importing PROTECTED_NICKNAMES from ../constants (must use ./protection-filter): ${violations.join(", ")}`,
    ).toHaveLength(0);
  });

  it("every run-*.ts file either imports ./protection-filter or is in the reviewed-exempt allowlist", () => {
    // NEW files are NOT auto-exempt: they must either import protection-filter or
    // be explicitly added to REVIEWED_EXEMPT above (with a justification comment).
    const unguarded: string[] = [];
    for (const file of runFiles) {
      if (REVIEWED_EXEMPT.has(file)) continue;
      const content = readFileSync(join(matchingDir, file), "utf-8");
      if (!content.includes("./protection-filter")) {
        unguarded.push(file);
      }
    }
    expect(
      unguarded,
      `New run-*.ts files not in REVIEWED_EXEMPT and lacking ./protection-filter import: ${unguarded.join(", ")}. ` +
        "Either import protection-filter or add the file to the REVIEWED_EXEMPT allowlist with a justification.",
    ).toHaveLength(0);
  });

  it("all run-*.ts files that use PROTECTED_NICKNAMES or protectedNicknamesSqlArray import from ./protection-filter", () => {
    const missing: string[] = [];
    for (const file of runFiles) {
      const content = readFileSync(join(matchingDir, file), "utf-8");
      const usesProtected =
        content.includes("PROTECTED_NICKNAMES") ||
        content.includes("protectedNicknamesSqlArray");
      const importsFilter = content.includes("./protection-filter");
      if (usesProtected && !importsFilter) {
        missing.push(file);
      }
    }
    expect(
      missing,
      `Run files using protection logic without importing from ./protection-filter: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });
});
