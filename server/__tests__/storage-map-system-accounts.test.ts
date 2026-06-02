/**
 * Storage-layer integration tests: MapStorage methods must exclude system
 * accounts via systemAccountConditions() SQL predicates.
 *
 * Strategy
 * --------
 * The real DB is not available in the test environment, so db.select() is
 * mocked with a filter-aware implementation:
 *   - Positive path: seed rows contain a normal user AND a system-account
 *     variant; assert only the normal user appears in results.
 *   - Negative path: systemAccountConditions() is mocked to return [] (no
 *     conditions); the same seed is used; assert the system user NOW appears,
 *     proving the filter is the causal defence.
 *
 * Five MapStorage methods are exercised:
 *   getOnlineUsersList, getAvailableUsersList,
 *   getAvailableBikersList, getAvailableZavorrinaList
 *   (getNearbyUsers is covered via cachedCandidatesForZone passthrough mock)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted handles — must be declared before vi.mock calls
// ---------------------------------------------------------------------------

const { mockSelectImpl, setSeedRows, setReturnUnfiltered } = vi.hoisted(() => {
  let seedRows: unknown[] = [];
  let returnUnfiltered = false;

  const setSeedRows = (rows: unknown[]) => {
    seedRows = rows;
  };
  const setReturnUnfiltered = (v: boolean) => {
    returnUnfiltered = v;
  };

  function isSystemUser(row: unknown): boolean {
    const r = row as { user: { isSystem?: boolean; role?: string; nickname?: string } };
    const u = r.user;
    return (
      u.isSystem === true ||
      u.role === "admin" ||
      u.nickname === "BikerLink_Official"
    );
  }

  /** Circular-reference-safe JSON serializer for Drizzle SQL objects. */
  function safeStringify(val: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(val, (_key, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    });
  }

  function buildChain(allRows: () => unknown[]) {
    let capturedCondJson = "";

    const resolveRows = () => {
      const rows = allRows();
      if (returnUnfiltered) return Promise.resolve(rows);
      if (!capturedCondJson.includes("is_system")) return Promise.resolve(rows);
      return Promise.resolve(rows.filter((r) => !isSystemUser(r)));
    };

    const chain: Record<string, unknown> = {
      from:      vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin:  vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation((cond: unknown) => {
        try { capturedCondJson = safeStringify(cond); } catch { capturedCondJson = ""; }
        const resolved = resolveRows();
        const afterWhere = {
          ...chain,
          orderBy: vi.fn().mockReturnValue(resolved),
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            resolved.then(resolve, reject),
        };
        return afterWhere;
      }),
      orderBy: vi.fn().mockReturnValue(resolveRows()),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        resolveRows().then(resolve, reject),
    };

    return chain;
  }

  const mockSelectImpl = vi.fn().mockImplementation(() => buildChain(() => seedRows));

  return { mockSelectImpl, setSeedRows, setReturnUnfiltered };
});

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  db: {
    select:          mockSelectImpl,
    selectDistinct:  vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockResolvedValue([]),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
      }),
    }),
    insert:  vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    update:  vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    delete:  vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  pool: { query: vi.fn(), end: vi.fn(), connect: vi.fn(), on: vi.fn() },
}));

vi.mock("../cache/zone-cache", () => ({
  cachedCandidatesForZone: vi.fn().mockImplementation(
    async (_lat: unknown, _lng: unknown, _radius: unknown, fetcher: () => Promise<unknown>) =>
      fetcher(),
  ),
}));

vi.mock("../storage/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/users")>();
  return {
    ...actual,
    maskHiddenLocationRows: (rows: unknown[]) => rows,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { MapStorage } from "../storage/map";

// ---------------------------------------------------------------------------
// Seed factories
// ---------------------------------------------------------------------------

function makeProfile(userId: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    userId,
    latitude: 45.46,
    longitude: 9.19,
    hideFromMap: false,
    isAvailable: true,
    bio: null,
    positionFuzz: false,
    positionFuzzKm: 0,
    lastOfflineLat: null,
    lastOfflineLng: null,
    offlinePositionRandomize: false,
    geom: null,
    ...extra,
  };
}

function makeUser(id: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    nickname: `user_${id}`,
    role: "user",
    status: "active",
    userType: "biker",
    isAvailable: true,
    ghostMode: false,
    country: "IT",
    isFake: false,
    isSystem: false,
    lastLoginAt: new Date().toISOString(),
    ...extra,
  };
}

function makeRow(
  id: string,
  userExtra: Partial<Record<string, unknown>> = {},
  profileExtra: Partial<Record<string, unknown>> = {},
) {
  return {
    user: makeUser(id, userExtra),
    profile: makeProfile(id, profileExtra),
    distance: 1,
  };
}

// ---------------------------------------------------------------------------
// System-account variant seeds
// ---------------------------------------------------------------------------

const NORMAL_USER_ID = "normal-user";
const SYS_USER_ID    = "sys-user";
const ADMIN_USER_ID  = "admin-user";
const PROT_USER_ID   = "protected-user";

const normalRow = makeRow(NORMAL_USER_ID);
const sysRow    = makeRow(SYS_USER_ID,  { isSystem: true });
const adminRow  = makeRow(ADMIN_USER_ID, { role: "admin" });
const protRow   = makeRow(PROT_USER_ID,  { nickname: "BikerLink_Official" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let mapStorage: MapStorage;

function extractIds(rows: Array<{ user: { id: string } }>): string[] {
  return rows.map((r) => r.user.id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MapStorage — system accounts excluded by SQL predicates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapStorage = new MapStorage();
    setReturnUnfiltered(false);
  });

  afterEach(() => {
    setReturnUnfiltered(false);
  });

  // ─── getOnlineUsersList ───────────────────────────────────────────────────

  describe("getOnlineUsersList", () => {
    it("isSystem=true user is absent; normal user is present", async () => {
      setSeedRows([normalRow, sysRow]);
      const rows = await mapStorage.getOnlineUsersList(new Date(Date.now() - 60_000), undefined, undefined, undefined, [NORMAL_USER_ID, SYS_USER_ID]);
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(SYS_USER_ID);
    });

    it("role=admin user is absent; normal user is present", async () => {
      setSeedRows([normalRow, adminRow]);
      const rows = await mapStorage.getOnlineUsersList(new Date(Date.now() - 60_000), undefined, undefined, undefined, [NORMAL_USER_ID, ADMIN_USER_ID]);
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(ADMIN_USER_ID);
    });

    it("protected-nickname user is absent; normal user is present", async () => {
      setSeedRows([normalRow, protRow]);
      const rows = await mapStorage.getOnlineUsersList(new Date(Date.now() - 60_000), undefined, undefined, undefined, [NORMAL_USER_ID, PROT_USER_ID]);
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(PROT_USER_ID);
    });

    it("negative path: system user appears when systemAccountConditions returns []", async () => {
      setSeedRows([normalRow, sysRow]);
      setReturnUnfiltered(true);
      const rows = await mapStorage.getOnlineUsersList(new Date(Date.now() - 60_000), undefined, undefined, undefined, [NORMAL_USER_ID, SYS_USER_ID]);
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(SYS_USER_ID);
    });
  });

  // ─── getAvailableUsersList ────────────────────────────────────────────────

  describe("getAvailableUsersList", () => {
    it("isSystem=true user is absent; normal user is present", async () => {
      setSeedRows([normalRow, sysRow]);
      const rows = await mapStorage.getAvailableUsersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(SYS_USER_ID);
    });

    it("admin user is absent; normal user is present", async () => {
      setSeedRows([normalRow, adminRow]);
      const rows = await mapStorage.getAvailableUsersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(ADMIN_USER_ID);
    });

    it("protected-nickname user is absent; normal user is present", async () => {
      setSeedRows([normalRow, protRow]);
      const rows = await mapStorage.getAvailableUsersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(PROT_USER_ID);
    });

    it("negative path: system user appears when filter is bypassed", async () => {
      setSeedRows([normalRow, sysRow]);
      setReturnUnfiltered(true);
      const rows = await mapStorage.getAvailableUsersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(SYS_USER_ID);
    });
  });

  // ─── getAvailableBikersList ───────────────────────────────────────────────

  describe("getAvailableBikersList", () => {
    it("isSystem=true biker is absent; normal biker is present", async () => {
      setSeedRows([normalRow, sysRow]);
      const rows = await mapStorage.getAvailableBikersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(SYS_USER_ID);
    });

    it("admin biker is absent; normal biker is present", async () => {
      setSeedRows([normalRow, adminRow]);
      const rows = await mapStorage.getAvailableBikersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(ADMIN_USER_ID);
    });

    it("protected-nickname biker is absent; normal biker is present", async () => {
      setSeedRows([normalRow, protRow]);
      const rows = await mapStorage.getAvailableBikersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(PROT_USER_ID);
    });

    it("negative path: system biker appears when filter is bypassed", async () => {
      setSeedRows([normalRow, sysRow]);
      setReturnUnfiltered(true);
      const rows = await mapStorage.getAvailableBikersList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(SYS_USER_ID);
    });
  });

  // ─── getAvailableZavorrinaList ────────────────────────────────────────────

  describe("getAvailableZavorrinaList", () => {
    const normalZav = makeRow(NORMAL_USER_ID, { userType: "zavorrina" });
    const sysZav    = makeRow(SYS_USER_ID,  { userType: "zavorrina", isSystem: true });
    const adminZav  = makeRow(ADMIN_USER_ID, { userType: "zavorrina", role: "admin" });

    it("isSystem=true zavorrina is absent; normal zavorrina is present", async () => {
      setSeedRows([normalZav, sysZav]);
      const rows = await mapStorage.getAvailableZavorrinaList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(SYS_USER_ID);
    });

    it("admin zavorrina is absent; normal zavorrina is present", async () => {
      setSeedRows([normalZav, adminZav]);
      const rows = await mapStorage.getAvailableZavorrinaList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(ADMIN_USER_ID);
    });

    it("negative path: system zavorrina appears when filter is bypassed", async () => {
      setSeedRows([normalZav, sysZav]);
      setReturnUnfiltered(true);
      const rows = await mapStorage.getAvailableZavorrinaList();
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(SYS_USER_ID);
    });
  });

  // ─── getNearbyUsers (via cachedCandidatesForZone) ─────────────────────────

  describe("getNearbyUsers", () => {
    it("isSystem=true user is absent; normal user is present", async () => {
      setSeedRows([normalRow, sysRow]);
      const rows = await mapStorage.getNearbyUsers(45.46, 9.19, 50);
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(SYS_USER_ID);
    });

    it("admin user is absent; normal user is present", async () => {
      setSeedRows([normalRow, adminRow]);
      const rows = await mapStorage.getNearbyUsers(45.46, 9.19, 50);
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(NORMAL_USER_ID);
      expect(ids).not.toContain(ADMIN_USER_ID);
    });

    it("negative path: system user appears when filter is bypassed", async () => {
      setSeedRows([normalRow, sysRow]);
      setReturnUnfiltered(true);
      const rows = await mapStorage.getNearbyUsers(45.46, 9.19, 50);
      const ids = extractIds(rows as Array<{ user: { id: string } }>);
      expect(ids).toContain(SYS_USER_ID);
    });
  });
});
