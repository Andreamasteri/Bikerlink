/**
 * Guard the AI assistant settings save/load with server-side tests.
 *
 * Covers the exact contract the client depends on:
 *  1. Admin GET /api/admin/ai/assistant/config?platform=... returns
 *     { platform, config } with a fully-populated default config when nothing
 *     was ever saved (getAppSetting returns null).
 *  2. Admin PUT /api/admin/ai/assistant/config?platform=... accepts the raw
 *     platform config as the body (NOT wrapped in { config: ... }) and persists
 *     it; a subsequent GET reads it back correctly.
 *  3. Public GET /api/ai/assistant/config reflects enabled:false only when
 *     explicitly saved (not as the built-in default).
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { PROACTIVE_RULES } from "../ai/assistant/config";
import { ASSISTANT_ACTIONS } from "../ai/assistant/actions";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared before any vi.mock() call
// ---------------------------------------------------------------------------

const { mockGetAppSetting, mockUpsertAppSetting, mockGetUser } = vi.hoisted(() => ({
  mockGetAppSetting: vi.fn(),
  mockUpsertAppSetting: vi.fn().mockResolvedValue({}),
  mockGetUser: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: mockGetAppSetting,
    upsertAppSetting: mockUpsertAppSetting,
    getUser: mockGetUser,
  },
}));

vi.mock("../ai/assistant/telemetry", () => ({
  getTelemetrySummary: vi.fn().mockResolvedValue({ events: [] }),
  logAssistantEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai/assistant/memory-pruner", () => ({
  getMemoryStats: vi.fn().mockResolvedValue({ count: 0 }),
  runMemoryPruner: vi.fn().mockResolvedValue({ pruned: 0 }),
}));

// The public /message endpoint uses ioredis indirectly through rate-limit
vi.mock("../cache/redis", () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// Imports under test — after mocks
// ---------------------------------------------------------------------------

import adminAssistantRouter from "../routes/admin/ai-assistant";
import publicAssistantRouter from "../routes/ai-assistant";

// ---------------------------------------------------------------------------
// Test app builders
// ---------------------------------------------------------------------------

function buildAdminApp(): express.Application {
  const app = express();
  app.use(express.json());
  // Admin routes are mounted without a prefix in the router itself;
  // the real server mounts them under /api/admin.
  app.use("/api/admin", adminAssistantRouter);
  return app;
}

function buildPublicApp(userId: string): express.Application {
  const app = express();
  app.use(express.json());
  // Inject a fake session so requireUser can find userId.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { session: Record<string, unknown> }).session = { userId };
    next();
  });
  app.use("/api", publicAssistantRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_ACTION_KEYS = Object.keys(ASSISTANT_ACTIONS);
const ALL_PROACTIVE_KEYS = [...PROACTIVE_RULES];

/** Build a minimal valid platform config that passes the Zod ConfigBody schema. */
function buildValidConfig(overrides: Partial<{
  enabled: boolean;
  modes: { fab: boolean; selective: boolean; onboarding: boolean };
  actions: Record<string, boolean>;
  proactive: Record<string, boolean>;
  customFaqKeys: string[];
}> = {}) {
  return {
    enabled: true,
    modes: { fab: true, selective: false, onboarding: true },
    actions: Object.fromEntries(ALL_ACTION_KEYS.map((k) => [k, true])),
    proactive: Object.fromEntries(ALL_PROACTIVE_KEYS.map((k) => [k, true])),
    customFaqKeys: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite 1 — Admin GET returns default config when nothing saved
// ---------------------------------------------------------------------------

describe("Admin GET /api/admin/ai/assistant/config — default config when nothing saved", () => {
  beforeEach(() => {
    mockGetAppSetting.mockReset();
    mockUpsertAppSetting.mockReset();
    mockUpsertAppSetting.mockResolvedValue({});
    // Simulate no setting stored yet.
    mockGetAppSetting.mockResolvedValue(null);
  });

  it("returns 200 with { platform, config } shape", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=android");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("platform", "android");
    expect(res.body).toHaveProperty("config");
  });

  it("config has enabled:true (default)", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=android");

    expect(res.body.config.enabled).toBe(true);
  });

  it("config.modes is fully populated with defaults", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=android");

    expect(res.body.config.modes).toMatchObject({
      fab: true,
      selective: false,
      onboarding: true,
    });
  });

  it("config.actions contains all known action ids set to true", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=android");

    const actions = res.body.config.actions as Record<string, boolean>;
    for (const key of ALL_ACTION_KEYS) {
      expect(actions).toHaveProperty(key, true);
    }
  });

  it("config.proactive contains all known rule ids set to true", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=android");

    const proactive = res.body.config.proactive as Record<string, boolean>;
    for (const key of ALL_PROACTIVE_KEYS) {
      expect(proactive).toHaveProperty(key, true);
    }
  });

  it("config.customFaqKeys is an empty array", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=android");

    expect(res.body.config.customFaqKeys).toEqual([]);
  });

  it("platform defaults to android when query param is absent", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config");

    expect(res.status).toBe(200);
    expect(res.body.platform).toBe("android");
  });

  it("platform=ios is preserved", async () => {
    const res = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=ios");

    expect(res.status).toBe(200);
    expect(res.body.platform).toBe("ios");
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2 — Admin PUT persists config; subsequent GET reads it back
// ---------------------------------------------------------------------------

describe("Admin PUT /api/admin/ai/assistant/config — persists raw platform config body", () => {
  const savedStore: Record<string, unknown> = {};

  beforeEach(() => {
    mockGetAppSetting.mockReset();
    mockUpsertAppSetting.mockReset();

    // upsertAppSetting stores the third arg (valueJson) in our in-memory store.
    mockUpsertAppSetting.mockImplementation(
      (_key: string, _value: unknown, valueJson: unknown) => {
        const key = _key as string;
        savedStore[key] = valueJson;
        return Promise.resolve({});
      },
    );

    // getAppSetting returns whatever was stored (simulates round-trip).
    mockGetAppSetting.mockImplementation((key: string) => {
      const stored = savedStore[key];
      if (stored == null) return Promise.resolve(null);
      return Promise.resolve({ key, valueJson: stored });
    });
  });

  it("PUT with valid body returns 200 with { platform, config }", async () => {
    const body = buildValidConfig({ enabled: false });

    const res = await request(buildAdminApp())
      .put("/api/admin/ai/assistant/config?platform=android")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("platform", "android");
    expect(res.body).toHaveProperty("config");
  });

  it("PUT calls upsertAppSetting with the correct setting key and config data", async () => {
    const body = buildValidConfig({ enabled: false });

    await request(buildAdminApp())
      .put("/api/admin/ai/assistant/config?platform=android")
      .send(body)
      .set("Content-Type", "application/json");

    expect(mockUpsertAppSetting).toHaveBeenCalledTimes(1);
    const [key, , valueJson] = mockUpsertAppSetting.mock.calls[0] as [string, unknown, unknown];
    expect(key).toBe("ai_assistant.android");
    expect((valueJson as { enabled: boolean }).enabled).toBe(false);
  });

  it("PUT body is the raw platform config, NOT wrapped in { config: ... }", async () => {
    // The task specifically requires the body to be the raw config (not { config: {...} }).
    // A wrapped body { config: { enabled: false, ... } } should fail Zod validation → 400.
    const wrappedBody = { config: buildValidConfig({ enabled: false }) };

    const res = await request(buildAdminApp())
      .put("/api/admin/ai/assistant/config?platform=android")
      .send(wrappedBody)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("subsequent GET after PUT reflects the saved config", async () => {
    const body = buildValidConfig({ enabled: false });

    await request(buildAdminApp())
      .put("/api/admin/ai/assistant/config?platform=android")
      .send(body)
      .set("Content-Type", "application/json");

    const getRes = await request(buildAdminApp())
      .get("/api/admin/ai/assistant/config?platform=android");

    expect(getRes.status).toBe(200);
    expect(getRes.body.config.enabled).toBe(false);
  });

  it("PUT with partial actions object — unknown keys are stripped, known keys preserved", async () => {
    const body = buildValidConfig({
      actions: {
        ...Object.fromEntries(ALL_ACTION_KEYS.map((k) => [k, false])),
        "totally-unknown-action": true,
      },
    });

    const res = await request(buildAdminApp())
      .put("/api/admin/ai/assistant/config?platform=android")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    const savedActions = res.body.config.actions as Record<string, boolean>;
    expect(savedActions).not.toHaveProperty("totally-unknown-action");
    for (const k of ALL_ACTION_KEYS) {
      expect(savedActions).toHaveProperty(k, false);
    }
  });

  it("PUT for ios platform uses the ios setting key", async () => {
    const body = buildValidConfig({ enabled: false });

    await request(buildAdminApp())
      .put("/api/admin/ai/assistant/config?platform=ios")
      .send(body)
      .set("Content-Type", "application/json");

    expect(mockUpsertAppSetting).toHaveBeenCalledTimes(1);
    const [key] = mockUpsertAppSetting.mock.calls[0] as [string, ...unknown[]];
    expect(key).toBe("ai_assistant.ios");
  });

  it("PUT with missing required field returns 400", async () => {
    const incomplete = { enabled: true }; // missing modes, actions, proactive, customFaqKeys

    const res = await request(buildAdminApp())
      .put("/api/admin/ai/assistant/config?platform=android")
      .send(incomplete)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3 — Public GET /api/ai/assistant/config reflects enabled:false
// ---------------------------------------------------------------------------

describe("Public GET /api/ai/assistant/config — reflects enabled:false when explicitly saved", () => {
  const FAKE_USER_ID = "user-test-123";
  const FAKE_USER = {
    id: FAKE_USER_ID,
    role: "user",
    assistantPrefs: {},
  };

  beforeEach(() => {
    mockGetAppSetting.mockReset();
    mockGetUser.mockReset();
    // Auth: return a valid user so requireUser passes.
    mockGetUser.mockResolvedValue(FAKE_USER);
  });

  it("returns 200 with { platform, config, knowledge } shape", async () => {
    mockGetAppSetting.mockResolvedValue(null); // default config

    const res = await request(buildPublicApp(FAKE_USER_ID))
      .get("/api/ai/assistant/config?platform=android");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("platform");
    expect(res.body).toHaveProperty("config");
    expect(res.body).toHaveProperty("knowledge");
  });

  it("config.enabled is true by default (nothing saved)", async () => {
    mockGetAppSetting.mockResolvedValue(null);

    const res = await request(buildPublicApp(FAKE_USER_ID))
      .get("/api/ai/assistant/config?platform=android");

    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(true);
  });

  it("config.enabled is false when explicitly saved as false", async () => {
    // Simulate a previously saved setting with enabled:false.
    mockGetAppSetting.mockResolvedValue({
      key: "ai_assistant.android",
      valueJson: {
        enabled: false,
        modes: { fab: true, selective: false, onboarding: true },
        actions: Object.fromEntries(ALL_ACTION_KEYS.map((k) => [k, true])),
        proactive: Object.fromEntries(ALL_PROACTIVE_KEYS.map((k) => [k, true])),
        customFaqKeys: [],
      },
    });

    const res = await request(buildPublicApp(FAKE_USER_ID))
      .get("/api/ai/assistant/config?platform=android");

    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    // Build an app with no session injection — requireUser will find no userId.
    const bareApp = express();
    bareApp.use(express.json());
    bareApp.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { session: Record<string, unknown> }).session = {};
      next();
    });
    bareApp.use("/api", publicAssistantRouter);

    const res = await request(bareApp)
      .get("/api/ai/assistant/config?platform=android");

    expect(res.status).toBe(401);
  });

  it("platform=ios reads the ios setting key", async () => {
    mockGetAppSetting.mockResolvedValue(null);

    const res = await request(buildPublicApp(FAKE_USER_ID))
      .get("/api/ai/assistant/config?platform=ios");

    expect(res.status).toBe(200);
    expect(res.body.platform).toBe("ios");

    // Verify the storage was queried for the ios key.
    expect(mockGetAppSetting).toHaveBeenCalledWith("ai_assistant.ios");
  });
});
