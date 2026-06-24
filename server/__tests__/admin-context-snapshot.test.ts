/**
 * Guard the admin assistant platform snapshot (buildAdminContextSnapshot) so the
 * best-effort / degradation behaviour stays reliable when data sources fail.
 *
 * The admin chat injects a live snapshot (active users, businesses, last OTA,
 * ThinkCentre health) built by buildAdminContextSnapshot. Each data source is
 * wrapped in try/catch and is supposed to degrade to "dato non disponibile"
 * without breaking the whole snapshot. These tests pin that contract:
 *  1. When the DB stats query path throws, the snapshot still renders with
 *     "dato non disponibile" lines instead of throwing.
 *  2. When the ThinkCentre probe setting is missing/malformed, the snapshot
 *     still composes (empty services line).
 *  3. A fully successful path formats counts / OTA / services as expected.
 *
 * Mocks `withBgDbConnection` and `storage.getAppSetting`, mirroring the mock
 * style in server/__tests__/ai-assistant-config-api.test.ts.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared before any vi.mock() call
// ---------------------------------------------------------------------------

const { mockWithBgDbConnection, mockGetAppSetting } = vi.hoisted(() => ({
  mockWithBgDbConnection: vi.fn(),
  mockGetAppSetting: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbConnection: mockWithBgDbConnection,
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: mockGetAppSetting,
  },
}));

// ---------------------------------------------------------------------------
// Import under test — after mocks
// ---------------------------------------------------------------------------

import { buildAdminContextSnapshot } from "../ai/assistant/admin-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueryRows = Record<string, unknown>[];

/**
 * Build a fake PoolClient whose .query() returns rows based on the SQL text.
 * The three queries in loadDbStats are matched by a distinctive table name.
 */
function buildClient(
  routes: { users?: QueryRows; businesses?: QueryRows; ota?: QueryRows } = {},
): PoolClient {
  const query = vi.fn(async (sql: string) => {
    if (/FROM users/i.test(sql)) return { rows: routes.users ?? [] };
    if (/FROM businesses/i.test(sql)) return { rows: routes.businesses ?? [] };
    if (/FROM ota_releases/i.test(sql)) return { rows: routes.ota ?? [] };
    return { rows: [] };
  });
  return { query } as unknown as PoolClient;
}

/** Make withBgDbConnection run the provided callback with a given client. */
function runWithClient(client: PoolClient) {
  return async (fn: (c: PoolClient) => Promise<unknown>) => fn(client);
}

beforeEach(() => {
  mockWithBgDbConnection.mockReset();
  mockGetAppSetting.mockReset();
});

// ---------------------------------------------------------------------------
// Test Suite 1 — DB stats source fails → degrade to "dato non disponibile"
// ---------------------------------------------------------------------------

describe("buildAdminContextSnapshot — DB stats source failure degrades gracefully", () => {
  it("withBgDbConnection rejecting (bg-db kill-switch/overflow) does not throw", async () => {
    mockWithBgDbConnection.mockRejectedValue(new Error("bg-db overflow"));
    mockGetAppSetting.mockResolvedValue(null);

    const snapshot = await buildAdminContextSnapshot();

    expect(snapshot).toContain("Utenti attivi (24h): dato non disponibile");
    expect(snapshot).toContain("Business: dato non disponibile");
    expect(snapshot).toContain("Ultima OTA approvata (production): nessuna trovata");
  });

  it("an individual query throwing leaves only that source unavailable", async () => {
    // users query throws, businesses + ota succeed.
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/FROM users/i.test(sql)) throw new Error("users query failed");
        if (/FROM businesses/i.test(sql)) {
          return { rows: [{ approved: 5, pending: 2, active: 3 }] };
        }
        if (/FROM ota_releases/i.test(sql)) {
          return { rows: [{ ota_version: "1.4.0", published_at: "2026-06-20T10:00:00.000Z" }] };
        }
        return { rows: [] };
      }),
    } as unknown as PoolClient;
    mockWithBgDbConnection.mockImplementation(runWithClient(client));
    mockGetAppSetting.mockResolvedValue(null);

    const snapshot = await buildAdminContextSnapshot();

    // users degraded
    expect(snapshot).toContain("Utenti attivi (24h): dato non disponibile");
    // businesses + ota still rendered
    expect(snapshot).toContain("Business: 5 approvati, 2 in attesa, 3 attivi");
    expect(snapshot).toContain("Ultima OTA approvata (production): 1.4.0");
  });

  it("never rejects even when every DB query throws", async () => {
    const client = {
      query: vi.fn(async () => {
        throw new Error("db down");
      }),
    } as unknown as PoolClient;
    mockWithBgDbConnection.mockImplementation(runWithClient(client));
    mockGetAppSetting.mockResolvedValue(null);

    await expect(buildAdminContextSnapshot()).resolves.toBeTypeOf("string");
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2 — ThinkCentre probe setting missing/malformed → empty services
// ---------------------------------------------------------------------------

describe("buildAdminContextSnapshot — ThinkCentre probe setting missing/malformed", () => {
  beforeEach(() => {
    // DB stats path is irrelevant here; let it fail cleanly.
    mockWithBgDbConnection.mockRejectedValue(new Error("ignored"));
  });

  it("missing setting (null) composes with no-probe line", async () => {
    mockGetAppSetting.mockResolvedValue(null);

    const snapshot = await buildAdminContextSnapshot();

    expect(snapshot).toContain(
      "Servizi self-hosted (ThinkCentre): nessun probe recente disponibile",
    );
  });

  it("setting with non-object valueJson composes with no-probe line", async () => {
    mockGetAppSetting.mockResolvedValue({ key: "probe_log_snapshot", valueJson: "garbage" });

    const snapshot = await buildAdminContextSnapshot();

    expect(snapshot).toContain(
      "Servizi self-hosted (ThinkCentre): nessun probe recente disponibile",
    );
  });

  it("getAppSetting rejecting does not break the snapshot", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("storage down"));

    const snapshot = await buildAdminContextSnapshot();

    expect(snapshot).toContain(
      "Servizi self-hosted (ThinkCentre): nessun probe recente disponibile",
    );
  });

  it("malformed entries (empty arrays) are skipped, leaving no-probe line", async () => {
    mockGetAppSetting.mockResolvedValue({
      key: "probe_log_snapshot",
      valueJson: { ollama: [], graphhopper: [] },
    });

    const snapshot = await buildAdminContextSnapshot();

    expect(snapshot).toContain(
      "Servizi self-hosted (ThinkCentre): nessun probe recente disponibile",
    );
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3 — Fully successful path formats counts / OTA / services
// ---------------------------------------------------------------------------

describe("buildAdminContextSnapshot — fully successful path formats everything", () => {
  it("formats counts, OTA version and self-hosted services", async () => {
    const client = buildClient({
      users: [{ c: 137 }],
      businesses: [{ approved: 12, pending: 4, active: 9 }],
      ota: [{ ota_version: "2.1.5", published_at: "2026-06-23T08:30:00.000Z" }],
    });
    mockWithBgDbConnection.mockImplementation(runWithClient(client));

    const now = Date.now();
    mockGetAppSetting.mockResolvedValue({
      key: "probe_log_snapshot",
      valueJson: {
        ollama: [{ timestamp: now - 5 * 60000, ok: true, latencyMs: 120, detail: "ok" }],
        graphhopper: [{ timestamp: now - 2 * 60000, ok: false, latencyMs: null, detail: "timeout" }],
      },
    });

    const snapshot = await buildAdminContextSnapshot();

    expect(snapshot).toContain(
      "Utenti attivi (login ultime 24h, esclusi fake/staff): 137",
    );
    expect(snapshot).toContain("Business: 12 approvati, 4 in attesa, 9 attivi (visibili)");
    expect(snapshot).toContain("Ultima OTA approvata (production): 2.1.5");
    // Services line lists both probes with OK/KO status and age.
    expect(snapshot).toContain("Servizi self-hosted (ThinkCentre, ultimo probe):");
    expect(snapshot).toContain("ollama=OK (5min fa)");
    expect(snapshot).toContain("graphhopper=KO (2min fa)");
  });

  it("zero rows degrade users to 0 and OTA to 'nessuna trovata'", async () => {
    const client = buildClient({
      users: [{ c: 0 }],
      businesses: [{ approved: 0, pending: 0, active: 0 }],
      ota: [],
    });
    mockWithBgDbConnection.mockImplementation(runWithClient(client));
    mockGetAppSetting.mockResolvedValue(null);

    const snapshot = await buildAdminContextSnapshot();

    expect(snapshot).toContain(
      "Utenti attivi (login ultime 24h, esclusi fake/staff): 0",
    );
    expect(snapshot).toContain("Business: 0 approvati, 0 in attesa, 0 attivi (visibili)");
    expect(snapshot).toContain("Ultima OTA approvata (production): nessuna trovata");
  });

  it("caps the services list at 12 entries", async () => {
    mockWithBgDbConnection.mockRejectedValue(new Error("ignored"));
    const now = Date.now();
    const services: Record<string, unknown[]> = {};
    for (let i = 0; i < 20; i++) {
      services[`svc${i}`] = [{ timestamp: now, ok: true, latencyMs: 1, detail: "ok" }];
    }
    mockGetAppSetting.mockResolvedValue({ key: "probe_log_snapshot", valueJson: services });

    const snapshot = await buildAdminContextSnapshot();

    const servicesLine = snapshot
      .split("\n")
      .find((l) => l.includes("Servizi self-hosted (ThinkCentre, ultimo probe):"));
    expect(servicesLine).toBeDefined();
    const matches = servicesLine!.match(/svc\d+=/g) ?? [];
    expect(matches.length).toBe(12);
  });
});
