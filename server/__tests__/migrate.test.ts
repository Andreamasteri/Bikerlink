import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  pool: {
    connect: vi.fn(),
  },
}));

import { isPostgisOwnerError, applyMigration } from "../migrate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDbError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function makeMockClient() {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(typeof sql === "string" ? sql.trim() : sql);
      return { rows: [] };
    }),
    release: vi.fn(),
    _queries: queries,
  };
  return client;
}

// ---------------------------------------------------------------------------
// Unit tests — isPostgisOwnerError
// ---------------------------------------------------------------------------

describe("isPostgisOwnerError", () => {
  describe("returns true for 42501 errors on PostGIS system tables", () => {
    it("spatial_ref_sys", () => {
      const err = makeDbError(
        "42501",
        'must be owner of table spatial_ref_sys'
      );
      expect(isPostgisOwnerError(err)).toBe(true);
    });

    it("geography_columns", () => {
      const err = makeDbError(
        "42501",
        'permission denied for table geography_columns'
      );
      expect(isPostgisOwnerError(err)).toBe(true);
    });

    it("geometry_columns", () => {
      const err = makeDbError(
        "42501",
        'must be owner of view geometry_columns'
      );
      expect(isPostgisOwnerError(err)).toBe(true);
    });
  });

  describe("returns false for 42501 errors on non-PostGIS tables", () => {
    it("app table 'users'", () => {
      const err = makeDbError(
        "42501",
        'permission denied for table users'
      );
      expect(isPostgisOwnerError(err)).toBe(false);
    });

    it("app table 'rides'", () => {
      const err = makeDbError(
        "42501",
        'permission denied for table rides'
      );
      expect(isPostgisOwnerError(err)).toBe(false);
    });
  });

  describe("returns false for non-42501 error codes", () => {
    it("42P07 (duplicate_table) mentioning spatial_ref_sys", () => {
      const err = makeDbError(
        "42P07",
        'relation "spatial_ref_sys" already exists'
      );
      expect(isPostgisOwnerError(err)).toBe(false);
    });

    it("42701 (duplicate_column)", () => {
      const err = makeDbError("42701", "column already exists");
      expect(isPostgisOwnerError(err)).toBe(false);
    });

    it("non-Error object with code 42501 and matching text", () => {
      const err = { code: "42501", toString: () => "spatial_ref_sys" };
      expect(isPostgisOwnerError(err)).toBe(true);
    });

    it("null", () => {
      expect(isPostgisOwnerError(null)).toBe(false);
    });

    it("undefined", () => {
      expect(isPostgisOwnerError(undefined)).toBe(false);
    });

    it("plain string", () => {
      expect(isPostgisOwnerError("42501")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration test — migration runner skips 42501 on PostGIS system tables
// ---------------------------------------------------------------------------

describe("applyMigration — PostGIS 42501 guard", () => {
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    client = makeMockClient();
  });

  it("completes successfully when a statement fails with 42501 on spatial_ref_sys", async () => {
    const postgisErr = makeDbError(
      "42501",
      "must be owner of table spatial_ref_sys"
    );

    let statementCallCount = 0;
    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);

      if (trimmed === "ALTER TABLE spatial_ref_sys ADD PRIMARY KEY (srid)") {
        statementCallCount++;
        throw postgisErr;
      }
      return { rows: [] };
    });

    const statements = [
      "CREATE EXTENSION IF NOT EXISTS postgis",
      "ALTER TABLE spatial_ref_sys ADD PRIMARY KEY (srid)",
      "CREATE TABLE IF NOT EXISTS rides (id SERIAL PRIMARY KEY)",
    ];

    await expect(
      applyMigration(client as never, "0001_postgis_setup.sql", statements)
    ).resolves.toBeUndefined();

    expect(statementCallCount).toBe(1);

    const committed = client._queries.some((q) => q === "COMMIT");
    expect(committed).toBe(true);
  });

  it("throws when a statement fails with 42501 on an application table", async () => {
    const appErr = makeDbError(
      "42501",
      "permission denied for table rides"
    );

    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);

      if (trimmed === "ALTER TABLE rides ADD COLUMN speed INTEGER") {
        throw appErr;
      }
      return { rows: [] };
    });

    const statements = ["ALTER TABLE rides ADD COLUMN speed INTEGER"];

    await expect(
      applyMigration(client as never, "0002_add_speed.sql", statements)
    ).rejects.toThrow(/0002_add_speed\.sql.*failed/i);

    const rolledBack = client._queries.some((q) => q === "ROLLBACK");
    expect(rolledBack).toBe(true);
  });

  it("completes when all statements succeed (no errors)", async () => {
    const statements = [
      "CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY)",
      "CREATE INDEX IF NOT EXISTS idx_test ON test_table(id)",
    ];

    await expect(
      applyMigration(client as never, "0003_test.sql", statements)
    ).resolves.toBeUndefined();

    const committed = client._queries.some((q) => q === "COMMIT");
    expect(committed).toBe(true);
  });
});
