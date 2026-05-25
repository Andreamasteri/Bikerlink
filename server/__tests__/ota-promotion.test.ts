import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock references — must be defined before vi.mock() factories run
// ---------------------------------------------------------------------------

const dbMocks = vi.hoisted(() => {
  // Chainable builder: each method returns `this` except terminal ones
  function makeChain(terminalValue: unknown) {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "where", "set", "values"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.limit = vi.fn().mockResolvedValue(terminalValue);
    chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    chain.returning = vi.fn().mockResolvedValue(terminalValue);
    return chain;
  }

  const insertChain = makeChain(undefined);
  const updateChain = makeChain([]);
  // selectChain will be replaced per-test via selectImpl
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectImpl = vi.fn() as any;

  const db = {
    select: selectImpl,
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    _insertChain: insertChain,
    _updateChain: updateChain,
    _selectImpl: selectImpl,
  };

  return { db };
});

vi.mock("../db", () => ({ db: dbMocks.db }));

vi.mock("@shared/db", () => ({
  otaReleases: { id: "otaReleases.id" },
  appSettings: { key: "appSettings.key" },
}));

// ---------------------------------------------------------------------------
// Import router after mocks are hoisted
// ---------------------------------------------------------------------------

import otaRouter from "../routes/admin/ota";

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

const AUTH_USER_ID = "admin-user-1";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: AUTH_USER_ID } });
    next();
  });
  app.use("/api/admin/ota", otaRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers for building db chain mocks
// ---------------------------------------------------------------------------

function makeSelectChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockResolvedValue(returnValue);
  chain.limit = vi.fn().mockResolvedValue(returnValue);
  return chain as ReturnType<typeof dbMocks.db._selectImpl>;
}

// ---------------------------------------------------------------------------
// 1. syncStagingUpdates saves easGroupId from the `group` field of EAS response
// ---------------------------------------------------------------------------

describe("syncStagingUpdates — salva easGroupId dal campo group", () => {
  const GROUP_ID = "group-abc-123";
  const UPDATE_ID = "update-id-999";

  beforeEach(() => {
    vi.restoreAllMocks();

    // EAS returns a staging branch with one update that has a `group` field
    const easResponse = {
      app: {
        byId: {
          updateBranches: [
            {
              id: "branch-1",
              name: "staging",
              updates: [
                {
                  id: UPDATE_ID,
                  group: GROUP_ID,
                  message: "Fix critico",
                  runtimeVersion: "10.0.0",
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          ],
        },
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: easResponse }),
      })
    );

    process.env.EAS_TOKEN = "test-token";

    // select calls:
    //   1st → getDirectApplySetting: returns [] (false)
    //   2nd → check if update already exists: returns [] (not found)
    const selectCallOrder = [
      makeSelectChain([]),   // getDirectApplySetting: no row → directApply = false
      makeSelectChain([]),   // existing otaRelease check: not found
    ];
    let selectCallIdx = 0;
    dbMocks.db._selectImpl.mockImplementation(() => {
      return selectCallOrder[selectCallIdx++] ?? makeSelectChain([]);
    });

    // Reset insert chain
    dbMocks.db._insertChain.values = vi.fn().mockReturnValue(dbMocks.db._insertChain);
    dbMocks.db._insertChain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    dbMocks.db.insert.mockReturnValue(dbMocks.db._insertChain);
  });

  it("inserisce il record con easGroupId preso dal campo group della risposta EAS", async () => {
    const app = buildApp();
    await request(app).post("/api/admin/ota/sync").expect(200);

    expect(dbMocks.db.insert).toHaveBeenCalled();
    const insertedValues = (dbMocks.db._insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.easGroupId).toBe(GROUP_ID);
    expect(insertedValues.easUpdateId).toBe(UPDATE_ID);
    expect(insertedValues.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/admin/ota/:id/approve chiama republishUpdateGroup col groupId corretto
// ---------------------------------------------------------------------------

describe("POST /api/admin/ota/:id/approve — chiama republishUpdateGroup col groupId corretto", () => {
  const GROUP_ID = "group-xyz-456";
  const RELEASE_ID = "release-id-1";

  beforeEach(() => {
    vi.restoreAllMocks();

    process.env.EAS_TOKEN = "test-token";

    // EAS respond success for the republish mutation
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            update: {
              republishUpdateGroup: {
                id: "new-update-id",
                group: GROUP_ID,
                message: "promoted",
                runtimeVersion: "10.0.0",
                branch: { name: "production" },
              },
            },
          },
        }),
      })
    );

    // select: returns the pending release with easGroupId set
    const pendingRelease = {
      id: RELEASE_ID,
      easUpdateId: "update-id-001",
      easGroupId: GROUP_ID,
      status: "pending",
      message: "Fix critico",
      channel: "staging",
      runtimeVersion: "10.0.0",
    };
    dbMocks.db._selectImpl.mockImplementation(() => makeSelectChain([pendingRelease]));

    // update returning approved release
    const approvedRelease = { ...pendingRelease, status: "approved", channel: "production" };
    dbMocks.db._updateChain.returning = vi.fn().mockResolvedValue([approvedRelease]);
    dbMocks.db._updateChain.where = vi.fn().mockReturnValue(dbMocks.db._updateChain);
    dbMocks.db._updateChain.set = vi.fn().mockReturnValue(dbMocks.db._updateChain);
    dbMocks.db.update.mockReturnValue(dbMocks.db._updateChain);
  });

  it("chiama la mutation republishUpdateGroup con il groupId corretto", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/ota/${RELEASE_ID}/approve`)
      .expect(200);

    // Verify fetch was called with the correct mutation and variables
    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [_url, fetchOptions] = fetchMock.mock.calls[0];
    const body = JSON.parse((fetchOptions as RequestInit).body as string) as {
      query: string;
      variables: { input: { groupId: string; branchName: string } };
    };

    expect(body.query).toContain("republishUpdateGroup");
    expect(body.variables.input.groupId).toBe(GROUP_ID);
    expect(body.variables.input.branchName).toBe("production");

    expect(res.body).toMatchObject({ status: "approved", channel: "production" });
  });
});

// ---------------------------------------------------------------------------
// 3. POST /api/admin/ota/:id/approve restituisce 400 se easGroupId è null
// ---------------------------------------------------------------------------

describe("POST /api/admin/ota/:id/approve — 400 se easGroupId è null", () => {
  const RELEASE_ID = "release-no-group";

  beforeEach(() => {
    vi.restoreAllMocks();

    process.env.EAS_TOKEN = "test-token";

    // select: returns a pending release WITHOUT easGroupId
    const pendingReleaseNoGroup = {
      id: RELEASE_ID,
      easUpdateId: "update-id-002",
      easGroupId: null,
      status: "pending",
      message: "Test senza groupId",
      channel: "staging",
      runtimeVersion: "10.0.0",
    };
    dbMocks.db._selectImpl.mockImplementation(() => makeSelectChain([pendingReleaseNoGroup]));
  });

  it("restituisce 400 con messaggio Ri-sincronizza se easGroupId è null", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/ota/${RELEASE_ID}/approve`)
      .expect(400);

    expect(res.body).toMatchObject({ success: false });
    expect(res.body.message).toContain("Ri-sincronizza");
  });

  it("non chiama fetch verso EAS se easGroupId è null", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const app = buildApp();
    await request(app)
      .post(`/api/admin/ota/${RELEASE_ID}/approve`)
      .expect(400);

    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });
});
